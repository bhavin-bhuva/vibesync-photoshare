import { Suspense } from "react";
import { db } from "@/lib/db";
import type { Prisma, PlanTier } from "@/generated/prisma/client";
import { PhotographersClient, type PhotographerRow } from "./PhotographersClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

type SortCol = "name" | "email" | "plan" | "storage" | "events" | "createdAt" | "lastLoginAt";
type SortDir = "asc" | "desc";

function buildOrderBy(col: string, dir: SortDir): Prisma.UserOrderByWithRelationInput {
  switch (col as SortCol) {
    case "name":        return { name: dir };
    case "email":       return { email: dir };
    case "plan":        return { subscription: { planTier: dir } };
    case "storage":     return { storageUsedBytes: dir };
    case "events":      return { events: { _count: dir } };
    case "lastLoginAt": return { lastLoginAt: dir };
    default:            return { createdAt: dir };
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PhotographersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const search      = sp.q?.trim() ?? "";
  const planFilter  = sp.plan ?? "";
  const statusFilter = sp.status ?? "";
  const dateFrom    = sp.from ?? "";
  const dateTo      = sp.to ?? "";
  const sortBy      = sp.sort ?? "createdAt";
  const sortDir     = (sp.dir === "asc" ? "asc" : "desc") as SortDir;
  const page        = Math.max(1, parseInt(sp.page ?? "1", 10));

  // ── Build where clause ──────────────────────────────────────────────────────
  const where: Prisma.UserWhereInput = { role: "PHOTOGRAPHER" };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (planFilter && ["FREE", "PRO", "STUDIO"].includes(planFilter)) {
    where.subscription = { planTier: planFilter as PlanTier };
  }
  if (statusFilter === "suspended") where.isSuspended = true;
  if (statusFilter === "active")    where.isSuspended = false;

  const createdAtFilter: Prisma.DateTimeFilter<"User"> = {};
  if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
  if (dateTo)   createdAtFilter.lte = new Date(dateTo + "T23:59:59.999Z");
  if (dateFrom || dateTo) where.createdAt = createdAtFilter;

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: buildOrderBy(sortBy, sortDir),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        isSuspended: true,
        suspendedReason: true,
        createdAt: true,
        lastLoginAt: true,
        storageUsedBytes: true,
        subscription: { select: { planTier: true } },
        _count: { select: { events: true } },
        events: { select: { _count: { select: { photos: true } } } },
      },
    }),
    db.user.count({ where }),
  ]);

  // ── Serialise for client (BigInt → string, Date → ISO) ─────────────────────
  const rows: PhotographerRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isSuspended: u.isSuspended,
    suspendedReason: u.suspendedReason,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    storageUsedBytes: u.storageUsedBytes.toString(),
    planTier: u.subscription?.planTier ?? "FREE",
    eventCount: u._count.events,
    photoCount: u.events.reduce((sum, e) => sum + e._count.photos, 0),
  }));

  return (
    <Suspense>
      <PhotographersClient
        rows={rows}
        total={total}
        pageSize={PAGE_SIZE}
        currentPage={page}
        sortBy={sortBy}
        sortDir={sortDir}
        search={search}
        planFilter={planFilter}
        statusFilter={statusFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
    </Suspense>
  );
}
