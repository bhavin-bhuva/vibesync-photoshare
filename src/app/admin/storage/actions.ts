"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";

async function getIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

// ─── Recalculate storage for a single user ────────────────────────────────────

export async function recalculateStorageAction(
  targetUserId: string
): Promise<{ newBytes: string; error?: string }> {
  try {
    await requireSuperAdmin();

    const agg = await db.photo.aggregate({
      where: { event: { userId: targetUserId } },
      _sum:  { size: true },
    });

    const newBytes = BigInt(agg._sum.size ?? 0);

    await db.user.update({
      where: { id: targetUserId },
      data:  { storageUsedBytes: newBytes },
    });

    return { newBytes: newBytes.toString() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { newBytes: "0", error: "Access denied." };
    return { newBytes: "0", error: "Recalculation failed. Please try again." };
  }
}

// ─── Recalculate storage for ALL users ────────────────────────────────────────

export async function recalculateAllStorageAction(): Promise<{
  updated: number;
  error?: string;
}> {
  try {
    await requireSuperAdmin();

    // Fetch all photographers with their actual photo size sums
    const users = await db.user.findMany({
      where:  { role: "PHOTOGRAPHER" },
      select: { id: true },
    });

    const updates = await Promise.all(
      users.map(async (u) => {
        const agg = await db.photo.aggregate({
          where: { event: { userId: u.id } },
          _sum:  { size: true },
        });
        return db.user.update({
          where: { id: u.id },
          data:  { storageUsedBytes: BigInt(agg._sum.size ?? 0) },
        });
      })
    );

    return { updated: updates.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { updated: 0, error: "Access denied." };
    return { updated: 0, error: "Bulk recalculation failed. Please try again." };
  }
}

// ─── Increase storage limit for a user ────────────────────────────────────────

export async function increaseLimitAction(
  targetUserId: string,
  newLimitBytes: string,
  reason: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip      = await getIp();

    const newLimit = BigInt(newLimitBytes);
    if (newLimit <= BigInt(0)) return { error: "Limit must be greater than 0." };

    await db.$transaction([
      db.user.update({
        where: { id: targetUserId },
        data:  { storageLimit: newLimit },
      }),
      db.adminActivityLog.create({
        data: {
          adminId:    session.user.id,
          action:     "INCREASED_STORAGE_LIMIT",
          targetType: "USER",
          targetId:   targetUserId,
          metadata:   {
            newLimitBytes: newLimitBytes,
            reason:        reason.trim() || null,
            source:        "manual_override",
          },
          ipAddress: ip,
        },
      }),
    ]);

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to update limit. Please try again." };
  }
}
