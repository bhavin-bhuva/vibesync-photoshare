"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateSelectionStatusAction(
  selectionId: string,
  status: "PENDING" | "REVIEWED" | "DELIVERED"
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized" };

  // Verify ownership via the relation chain
  const selection = await db.photoSelection.findUnique({
    where: { id: selectionId },
    select: { sharedLink: { select: { event: { select: { id: true, userId: true } } } } },
  });

  if (!selection) return { error: "Not found" };
  if (selection.sharedLink.event.userId !== session.user.id) return { error: "Forbidden" };

  await db.photoSelection.update({ where: { id: selectionId }, data: { status } });

  revalidatePath(
    `/dashboard/events/${selection.sharedLink.event.id}/selections`
  );
  return {};
}
