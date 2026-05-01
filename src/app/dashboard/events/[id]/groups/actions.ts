"use server";

import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireEventOwner(
  eventId: string
): Promise<{ id: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });

  return event ?? { error: "Event not found." };
}

async function requireGroupOwner(
  groupId: string
): Promise<{ id: string; eventId: string; name: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const group = await db.photoGroup.findFirst({
    where: { id: groupId, event: { userId: session.user.id } },
    select: { id: true, eventId: true, name: true },
  });

  return group ?? { error: "Group not found." };
}

// ─── 1. createGroup ───────────────────────────────────────────────────────────

export async function createGroup(
  eventId: string,
  data: { name: string; description?: string; color?: string }
) {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  const duplicate = await db.photoGroup.findUnique({
    where: { eventId_name: { eventId, name: data.name } },
    select: { id: true },
  });
  if (duplicate) return { error: "A group with that name already exists in this event." };

  const agg = await db.photoGroup.aggregate({
    where: { eventId },
    _max: { sortOrder: true },
  });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;

  const group = await db.photoGroup.create({
    data: {
      eventId,
      name: data.name.trim(),
      description: data.description?.trim() ?? null,
      color: data.color ?? "#6366f1",
      sortOrder,
    },
  });

  revalidatePath(`/dashboard/events/${eventId}`);
  return { group };
}

// ─── 2. updateGroup ───────────────────────────────────────────────────────────

export async function updateGroup(
  groupId: string,
  data: { name?: string; description?: string; color?: string; isVisible?: boolean }
) {
  const auth = await requireGroupOwner(groupId);
  if ("error" in auth) return auth;

  // Check for name collision only when the name actually changes
  if (data.name !== undefined && data.name !== auth.name) {
    const duplicate = await db.photoGroup.findUnique({
      where: { eventId_name: { eventId: auth.eventId, name: data.name } },
      select: { id: true },
    });
    if (duplicate) return { error: "A group with that name already exists in this event." };
  }

  const group = await db.photoGroup.update({
    where: { id: groupId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() || null }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.isVisible !== undefined && { isVisible: data.isVisible }),
    },
  });

  revalidatePath(`/dashboard/events/${auth.eventId}`);
  return { group };
}

// ─── 3. deleteGroup ───────────────────────────────────────────────────────────

export async function deleteGroup(
  groupId: string,
  options: { reassignToGroupId?: string } = {}
) {
  const auth = await requireGroupOwner(groupId);
  if ("error" in auth) return auth;

  const { reassignToGroupId } = options;

  // If reassigning, verify the target group belongs to the same event
  if (reassignToGroupId) {
    const targetGroup = await db.photoGroup.findFirst({
      where: { id: reassignToGroupId, eventId: auth.eventId },
      select: { id: true },
    });
    if (!targetGroup) return { error: "Target group not found in this event." };
  }

  // Atomically reassign/null photos and delete the group
  const [updatedPhotos] = await db.$transaction([
    db.photo.updateMany({
      where: { groupId },
      data: { groupId: reassignToGroupId ?? null },
    }),
    db.photoGroup.delete({ where: { id: groupId } }),
  ]);

  // Recount the target group after reassignment
  if (reassignToGroupId) {
    const count = await db.photo.count({ where: { groupId: reassignToGroupId } });
    await db.photoGroup.update({
      where: { id: reassignToGroupId },
      data: { photoCount: count },
    });
  }

  revalidatePath(`/dashboard/events/${auth.eventId}`);
  return { deletedId: groupId, photosReassigned: updatedPhotos.count };
}

// ─── 4. reorderGroups ────────────────────────────────────────────────────────

export async function reorderGroups(eventId: string, groupIds: string[]) {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  // Verify every id in the list actually belongs to this event
  const belonging = await db.photoGroup.count({
    where: { id: { in: groupIds }, eventId },
  });
  if (belonging !== groupIds.length)
    return { error: "One or more groups do not belong to this event." };

  await db.$transaction(
    groupIds.map((id, index) =>
      db.photoGroup.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath(`/dashboard/events/${eventId}`);
  return {};
}

// ─── 5. assignPhotosToGroup ──────────────────────────────────────────────────

export async function assignPhotosToGroup(
  photoIds: string[],
  groupId: string | null
) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  if (photoIds.length === 0) return { updated: 0 };

  // Verify the photographer owns every photo in the list
  const ownedCount = await db.photo.count({
    where: { id: { in: photoIds }, event: { userId: session.user.id } },
  });
  if (ownedCount !== photoIds.length)
    return { error: "One or more photos not found." };

  // Resolve eventId and old groupIds before modifying anything
  const [firstPhoto, oldGroupRows] = await Promise.all([
    db.photo.findFirst({
      where: { id: photoIds[0] },
      select: { eventId: true },
    }),
    db.photo.findMany({
      where: { id: { in: photoIds }, groupId: { not: null } },
      select: { groupId: true },
      distinct: ["groupId"],
    }),
  ]);

  if (!firstPhoto) return { error: "Photo not found." };
  const { eventId } = firstPhoto;

  // If assigning to a group, verify it belongs to the same event
  if (groupId !== null) {
    const targetGroup = await db.photoGroup.findFirst({
      where: { id: groupId, eventId },
      select: { id: true },
    });
    if (!targetGroup) return { error: "Target group not found in this event." };
  }

  const result = await db.photo.updateMany({
    where: { id: { in: photoIds } },
    data: { groupId },
  });

  // Recalculate photoCount for every affected group
  const affectedGroupIds = new Set<string>(
    oldGroupRows.map((r) => r.groupId as string)
  );
  if (groupId !== null) affectedGroupIds.add(groupId);

  await recalculateGroupPhotoCounts(eventId, [...affectedGroupIds]);

  revalidatePath(`/dashboard/events/${eventId}`);
  return { updated: result.count };
}

// ─── 7. assignAllUngroupedToGroup ────────────────────────────────────────────

/**
 * Atomically assigns every photo in the event that has no group to a target
 * group. Used by the "Assign all ungrouped" shortcut in the filter bar.
 */
export async function assignAllUngroupedToGroup(
  eventId: string,
  targetGroupId: string
): Promise<{ updated: number } | { error: string }> {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  const targetGroup = await db.photoGroup.findFirst({
    where: { id: targetGroupId, eventId },
    select: { id: true },
  });
  if (!targetGroup) return { error: "Target group not found in this event." };

  const result = await db.photo.updateMany({
    where: { eventId, groupId: null },
    data: { groupId: targetGroupId },
  });

  await recalculateGroupPhotoCounts(eventId, [targetGroupId]);
  revalidatePath(`/dashboard/events/${eventId}`);
  return { updated: result.count };
}

// ─── 6. recalculateGroupPhotoCounts ──────────────────────────────────────────

/**
 * Recount photos for each group in the event and persist the updated
 * photoCount field.  Pass a subset via `groupIds` to limit recalculation
 * after targeted operations (e.g. assignPhotosToGroup, deleteGroup).
 * Omit `groupIds` to recount every group in the event.
 */
export async function recalculateGroupPhotoCounts(
  eventId: string,
  groupIds?: string[]
) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const groups = await db.photoGroup.findMany({
    where: {
      eventId,
      ...(groupIds ? { id: { in: groupIds } } : {}),
    },
    select: { id: true },
  });

  const counts = await Promise.all(
    groups.map(async ({ id }) => ({
      id,
      count: await db.photo.count({ where: { groupId: id } }),
    }))
  );

  if (counts.length > 0) {
    await db.$transaction(
      counts.map(({ id, count }) =>
        db.photoGroup.update({
          where: { id },
          data: { photoCount: count },
        })
      )
    );
  }

  return {};
}
