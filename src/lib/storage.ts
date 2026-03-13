import { db } from "@/lib/db";

export const PLAN_STORAGE_LIMITS = {
  FREE: BigInt(1073741824),        // 1 GB
  PRO: BigInt(53687091200),        // 50 GB
  STUDIO: BigInt(536870912000),    // 500 GB
} as const;

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
