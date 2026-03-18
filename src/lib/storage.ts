import { db } from "@/lib/db";
import type { PlanTier } from "@/generated/prisma/client";

// Fallback constants used when no matching StripePlan row exists
const STORAGE_FALLBACK: Record<PlanTier, bigint> = {
  FREE:   BigInt(1073741824),     // 1 GB
  PRO:    BigInt(53687091200),    // 50 GB
  STUDIO: BigInt(536870912000),   // 500 GB
};

/** Returns the storage limit for a plan tier, preferring the StripePlan DB row. */
export async function getStorageLimitForTier(tier: PlanTier): Promise<bigint> {
  const plan = await db.stripePlan.findFirst({
    where: { tier, isActive: true },
    select: { storageBytes: true },
  });
  return plan?.storageBytes ?? STORAGE_FALLBACK[tier];
}

/** Format a byte count as a human-readable size string, e.g. "50 GB". */
export function formatStorageSize(bytes: bigint): string {
  const gb = Number(bytes) / 1_073_741_824;
  if (gb >= 1) return `${parseFloat(gb.toFixed(gb >= 10 ? 0 : 1))} GB`;
  const mb = Number(bytes) / 1_048_576;
  if (mb >= 1) return `${parseFloat(mb.toFixed(0))} MB`;
  return `${parseFloat((Number(bytes) / 1_024).toFixed(0))} KB`;
}

export async function getStorageUsed(userId: string): Promise<bigint> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { storageUsedBytes: true },
  });
  return user.storageUsedBytes;
}

export async function checkStorageLimit(
  userId: string,
  incomingFileBytes: number
): Promise<{ allowed: boolean; used: bigint; limit: bigint; percentUsed: number }> {
  const [user, sizeAgg] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { storageLimit: true },
    }),
    db.photo.aggregate({
      where: { event: { userId } },
      _sum: { size: true },
    }),
  ]);

  const limit = user.storageLimit;
  const used = BigInt(sizeAgg._sum.size ?? 0);
  const incoming = BigInt(incomingFileBytes);
  const allowed = used + incoming <= limit;
  const percentUsed = limit > 0n ? Number((used * 10000n) / limit) / 100 : 100;

  return { allowed, used, limit, percentUsed };
}

export async function incrementStorage(userId: string, bytes: number): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { storageUsedBytes: { increment: BigInt(bytes) } },
  });
}

export async function decrementStorage(userId: string, bytes: number): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { storageUsedBytes: { decrement: BigInt(bytes) } },
  });
}

export function formatBytes(used: bigint, limit: bigint): string {
  const fmt = (b: bigint): string => {
    const gb = Number(b) / 1_073_741_824;
    if (gb >= 1) return `${parseFloat(gb.toFixed(1))} GB`;
    const mb = Number(b) / 1_048_576;
    if (mb >= 1) return `${parseFloat(mb.toFixed(1))} MB`;
    const kb = Number(b) / 1_024;
    return `${parseFloat(kb.toFixed(1))} KB`;
  };
  return `${fmt(used)} of ${fmt(limit)} used`;
}
