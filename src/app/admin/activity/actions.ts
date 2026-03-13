"use server";

import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { Prisma } from "@/generated/prisma/client";

export type ActivityFilters = {
  adminId:    string;
  action:     string;
  targetType: string;
  dateFrom:   string;
  dateTo:     string;
  search:     string;
};

// ─── Shared SQL builder ───────────────────────────────────────────────────────

function buildConditions(f: ActivityFilters): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];
  if (f.adminId)    conds.push(Prisma.sql`al."adminId" = ${f.adminId}`);
  if (f.action)     conds.push(Prisma.sql`al.action = ${f.action}`);
  if (f.targetType) conds.push(Prisma.sql`al."targetType" = ${f.targetType}`);
  if (f.dateFrom)   conds.push(Prisma.sql`al."createdAt" >= ${new Date(f.dateFrom)}`);
  if (f.dateTo) {
    const end = new Date(f.dateTo);
    end.setHours(23, 59, 59, 999);
    conds.push(Prisma.sql`al."createdAt" <= ${end}`);
  }
  if (f.search) {
    const like = `%${f.search}%`;
    conds.push(Prisma.sql`al.metadata::text ILIKE ${like}`);
  }
  return conds;
}

function whereClause(conds: Prisma.Sql[]): Prisma.Sql {
  return conds.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`
    : Prisma.empty;
}

// ─── Raw row type returned from $queryRaw ─────────────────────────────────────

type RawLog = {
  id:          string;
  createdAt:   Date;
  action:      string;
  targetType:  string;
  targetId:    string;
  metadata:    unknown;
  ipAddress:   string | null;
  adminId:     string;
  adminName:   string | null;
  adminEmail:  string;
};

// ─── Paginated fetch (used by page.tsx directly, exported for reuse) ──────────

export async function fetchActivityLogs(
  filters: ActivityFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: RawLog[]; total: number }> {
  await requireSuperAdmin();

  const conds  = buildConditions(filters);
  const where  = whereClause(conds);
  const offset = (page - 1) * pageSize;

  const [rows, countResult] = await Promise.all([
    db.$queryRaw<RawLog[]>`
      SELECT
        al.id,
        al."createdAt",
        al.action,
        al."targetType",
        al."targetId",
        al.metadata,
        al."ipAddress",
        al."adminId",
        u.name  AS "adminName",
        u.email AS "adminEmail"
      FROM "AdminActivityLog" al
      JOIN "User" u ON al."adminId" = u.id
      ${where}
      ORDER BY al."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    db.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM "AdminActivityLog" al
      JOIN "User" u ON al."adminId" = u.id
      ${where}
    `,
  ]);

  return { rows, total: Number(countResult[0].count) };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function escapeCsv(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(
    typeof v === "object" ? JSON.stringify(v) : v
  );
  // Wrap in quotes if contains comma, quote, or newline
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportActivityCsvAction(
  filters: ActivityFilters,
): Promise<{ csv?: string; error?: string }> {
  try {
    await requireSuperAdmin();

    const conds = buildConditions(filters);
    const where = whereClause(conds);

    const rows = await db.$queryRaw<RawLog[]>`
      SELECT
        al.id,
        al."createdAt",
        al.action,
        al."targetType",
        al."targetId",
        al.metadata,
        al."ipAddress",
        al."adminId",
        u.name  AS "adminName",
        u.email AS "adminEmail"
      FROM "AdminActivityLog" al
      JOIN "User" u ON al."adminId" = u.id
      ${where}
      ORDER BY al."createdAt" DESC
    `;

    const header = ["Timestamp", "Admin", "Admin Email", "Action", "Target Type", "Target ID", "IP Address", "Metadata"].join(",");
    const lines  = rows.map((r) =>
      [
        escapeCsv(r.createdAt.toISOString()),
        escapeCsv(r.adminName ?? ""),
        escapeCsv(r.adminEmail),
        escapeCsv(r.action),
        escapeCsv(r.targetType),
        escapeCsv(r.targetId),
        escapeCsv(r.ipAddress),
        escapeCsv(r.metadata),
      ].join(",")
    );

    return { csv: [header, ...lines].join("\n") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Export failed. Please try again." };
  }
}
