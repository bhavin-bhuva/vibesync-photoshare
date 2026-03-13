/**
 * Back-fills accessType on existing SharedLink records that pre-date the
 * accessType column:
 *   - passwordHash IS NOT NULL → accessType = PASSWORD
 *   - passwordHash IS NULL     → accessType = NONE
 *
 * After updating, verifies:
 *   - No record has accessType = null / unexpected value
 *   - All records with passwordHash have accessType = PASSWORD
 *   - All records without passwordHash have accessType = NONE
 *
 * Usage:
 *   npm run links:migrate
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  // ── 1. Fetch all SharedLink records ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links = await (db as any).sharedLink.findMany({
    select: { id: true, passwordHash: true, accessType: true },
  }) as Array<{ id: string; passwordHash: string | null; accessType: string }>;

  console.log(`\nFound ${links.length} SharedLink record(s).\n`);

  // ── 2. Determine which records need updating ────────────────────────────────
  type Update = { id: string; from: string; to: string };
  const toUpdate: Update[] = [];

  for (const link of links) {
    const expected = link.passwordHash ? "PASSWORD" : "NONE";
    if (link.accessType !== expected) {
      toUpdate.push({ id: link.id, from: link.accessType, to: expected });
    }
  }

  if (toUpdate.length === 0) {
    console.log("Nothing to update — all records already have the correct accessType.\n");
  } else {
    console.log(`Updating ${toUpdate.length} record(s):\n`);
    console.log("id".padEnd(32), "from".padEnd(12), "→  to");
    console.log("─".repeat(58));

    for (const u of toUpdate) {
      console.log(u.id.padEnd(32), u.from.padEnd(12), "→ ", u.to);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).sharedLink.update({
        where: { id: u.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { accessType: u.to } as any,
      });
    }
  }

  // ── 3. Verification query ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const after = await (db as any).sharedLink.findMany({
    select: { id: true, passwordHash: true, accessType: true },
  }) as Array<{ id: string; passwordHash: string | null; accessType: string }>;

  const mismatches = after.filter((l) => {
    const expected = l.passwordHash ? "PASSWORD" : "NONE";
    return l.accessType !== expected;
  });

  const passwordCount = after.filter((l) => l.accessType === "PASSWORD").length;
  const noneCount     = after.filter((l) => l.accessType === "NONE").length;
  const pinCount      = after.filter((l) => l.accessType === "PIN").length;
  const nullCount     = after.filter((l) => !l.accessType).length;

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  console.log("\n── Verification ─────────────────────────────────────────────\n");
  console.log(`  Total records   : ${after.length}`);
  console.log(`  Updated         : ${toUpdate.length}`);
  console.log(`  PASSWORD        : ${passwordCount}`);
  console.log(`  NONE            : ${noneCount}`);
  if (pinCount > 0) console.log(`  PIN             : ${pinCount}`);
  if (nullCount > 0) console.log(`  null/missing    : ${nullCount}  ⚠️`);

  if (mismatches.length > 0) {
    console.error(`\n  ❌ ${mismatches.length} mismatch(es) found after update:`);
    for (const m of mismatches) {
      console.error(`     ${m.id}  accessType=${m.accessType}  passwordHash=${m.passwordHash ? "(set)" : "null"}`);
    }
    process.exit(1);
  }

  if (nullCount > 0) {
    console.error("\n  ❌ Records with null accessType remain — manual inspection needed.");
    process.exit(1);
  }

  console.log("\n  ✅ All records verified.\n");
}

main()
  .catch((err) => {
    console.error("\nmigrate-shared-links failed:", err.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
