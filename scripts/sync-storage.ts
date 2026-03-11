/**
 * Recalculates storageUsedBytes for every user based on the actual sum of
 * their Photo.size values, then updates the User record to match.
 *
 * Usage:
 *   npm run storage:sync
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const users = await db.user.findMany({
    select: {
      id: true,
      storageUsedBytes: true,
      _count: { select: { events: true } },
    },
  });

  type Row = {
    userId: string;
    calculatedBytes: bigint;
    previousBytes: bigint;
    difference: bigint;
  };

  const rows: Row[] = [];

  for (const user of users) {
    const agg = await db.photo.aggregate({
      where: { event: { userId: user.id } },
      _sum: { size: true },
    });

    const calculatedBytes = BigInt(agg._sum.size ?? 0);
    const previousBytes = user.storageUsedBytes;
    const difference = calculatedBytes - previousBytes;

    if (difference !== 0n) {
      await db.user.update({
        where: { id: user.id },
        data: { storageUsedBytes: calculatedBytes },
      });
    }

    rows.push({ userId: user.id, calculatedBytes, previousBytes, difference });
  }

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log("\nStorage sync complete\n");
  console.log(
    "userId".padEnd(32),
    "calculatedBytes".padStart(18),
    "previousBytes".padStart(16),
    "difference".padStart(14)
  );
  console.log("─".repeat(82));

  for (const r of rows) {
    const diff = r.difference === 0n ? "  (no change)" : r.difference > 0n
      ? `+${r.difference}`
      : `${r.difference}`;

    console.log(
      r.userId.padEnd(32),
      String(r.calculatedBytes).padStart(18),
      String(r.previousBytes).padStart(16),
      diff.padStart(14)
    );
  }

  const updated = rows.filter((r) => r.difference !== 0n).length;
  console.log(`\n${rows.length} user(s) checked, ${updated} updated.`);
}

main()
  .catch((err) => {
    console.error("sync-storage failed:", err.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
