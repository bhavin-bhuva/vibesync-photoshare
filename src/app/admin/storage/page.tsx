import Link from "next/link";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { StorageChart, type PlanBreakdown } from "./StorageChart";
import { StorageTable, RecalculateAllButton, type StorageRow } from "./StorageClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: bigint): string {
  const v = Number(n);
  if (v >= 1_073_741_824) return `${(v / 1_073_741_824).toFixed(2)} GB`;
  if (v >= 1_048_576)     return `${(v / 1_048_576).toFixed(1)} MB`;
  if (v >= 1_024)         return `${(v / 1_024).toFixed(1)} KB`;
  return `${v} B`;
}

function pct(used: bigint, limit: bigint): number {
  if (limit === BigInt(0)) return 0;
  return Math.round(Number((used * BigInt(10000)) / limit) / 100);
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  FREE:   { label: "Free",   cls: "bg-zinc-100  text-zinc-600" },
  PRO:    { label: "Pro",    cls: "bg-blue-100  text-blue-700" },
  STUDIO: { label: "Studio", cls: "bg-violet-100 text-violet-700" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StoragePage() {
  await requireSuperAdmin();

  // ── All queries in parallel ─────────────────────────────────────────────
  const [allUsers, photoAgg] = await Promise.all([
    db.user.findMany({
      where:   { role: "PHOTOGRAPHER" },
      orderBy: { storageUsedBytes: "desc" },
      select: {
        id:               true,
        name:             true,
        email:            true,
        storageUsedBytes: true,
        storageLimit:     true,
        subscription:     { select: { planTier: true } },
        _count:           { select: { events: true } },
      },
    }),
    db.photo.groupBy({
      by:       ["eventId"],
      _count:   { id: true },
      _sum:     { size: true },
    }),
  ]);

  // Map eventId → { photoCount, sizeSum }
  const photosByEvent = new Map(
    photoAgg.map((g) => [g.eventId, { count: g._count.id, size: g._sum.size ?? 0 }])
  );

  // Per-user photo counts — we need userId→photos
  const eventUserMap = await db.event.findMany({
    where:  { userId: { in: allUsers.map((u) => u.id) } },
    select: { id: true, userId: true },
  });
  const photoCountByUser = new Map<string, number>();
  for (const ev of eventUserMap) {
    const entry = photosByEvent.get(ev.id);
    if (entry) {
      photoCountByUser.set(ev.userId, (photoCountByUser.get(ev.userId) ?? 0) + entry.count);
    }
  }

  // ── Plan breakdown ──────────────────────────────────────────────────────
  const planTotals: Record<string, bigint> = { FREE: BigInt(0), PRO: BigInt(0), STUDIO: BigInt(0) };
  const planCounts: Record<string, number> = { FREE: 0, PRO: 0, STUDIO: 0 };

  for (const u of allUsers) {
    const tier = u.subscription?.planTier ?? "FREE";
    planTotals[tier] = (planTotals[tier] ?? BigInt(0)) + u.storageUsedBytes;
    planCounts[tier] = (planCounts[tier] ?? 0) + 1;
  }

  const planBreakdown: PlanBreakdown[] = (["FREE", "PRO", "STUDIO"] as const).map((plan) => ({
    plan,
    totalBytes: planTotals[plan].toString(),
    userCount:  planCounts[plan],
  }));

  // ── Aggregate stats ─────────────────────────────────────────────────────
  const totalUsedBytes = allUsers.reduce((s, u) => s + u.storageUsedBytes, BigInt(0));
  const totalLimitBytes = allUsers.reduce((s, u) => s + u.storageLimit, BigInt(0));
  const usersOver90  = allUsers.filter((u) => pct(u.storageUsedBytes, u.storageLimit) >= 90).length;
  const usersOver100 = allUsers.filter((u) => pct(u.storageUsedBytes, u.storageLimit) > 100).length;

  // ── Top 10 ─────────────────────────────────────────────────────────────
  const top10 = allUsers.slice(0, 10);

  // ── Full table rows ─────────────────────────────────────────────────────
  const rows: StorageRow[] = allUsers.map((u) => ({
    userId:          u.id,
    name:            u.name,
    email:           u.email,
    planTier:        (u.subscription?.planTier ?? "FREE") as "FREE" | "PRO" | "STUDIO",
    storageUsedBytes: u.storageUsedBytes.toString(),
    storageLimit:    u.storageLimit.toString(),
    photoCount:      photoCountByUser.get(u.id) ?? 0,
  }));

  return (
    <div className="space-y-6">

      {/* ── Header row with Recalculate All ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Storage Overview</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{allUsers.length} photographers · {fmtBytes(totalUsedBytes)} used platform-wide</p>
        </div>
        <RecalculateAllButton />
      </div>

      {/* ── Overall stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">Total Used</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{fmtBytes(totalUsedBytes)}</p>
          <p className="mt-0.5 text-xs text-zinc-400">of {fmtBytes(totalLimitBytes)} provisioned</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">Photographers</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{allUsers.length.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-zinc-400">total accounts</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-medium text-amber-600">≥ 90% Full</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-amber-700">{usersOver90}</p>
          <p className="mt-0.5 text-xs text-amber-500">users near limit</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-medium text-red-600">Over Limit</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-red-700">{usersOver100}</p>
          <p className="mt-0.5 text-xs text-red-400">users exceeded</p>
        </div>
      </div>

      {/* ── Chart + Top 10 ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Storage by plan chart */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Storage by Plan Tier</h2>
          <StorageChart data={planBreakdown} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            {planBreakdown.map((p) => {
              const badge = PLAN_BADGE[p.plan];
              return (
                <div key={p.plan} className="rounded-lg border border-zinc-100 p-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <p className="mt-1.5 text-sm font-semibold text-zinc-800">
                    {fmtBytes(BigInt(p.totalBytes))}
                  </p>
                  <p className="text-xs text-zinc-400">{p.userCount} user{p.userCount !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top 10 table */}
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Top 10 by Storage Used</h2>
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                {["#", "Photographer", "Plan", "Used", "Photos"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {top10.map((u, i) => {
                const tier  = (u.subscription?.planTier ?? "FREE") as "FREE" | "PRO" | "STUDIO";
                const badge = PLAN_BADGE[tier];
                const p     = pct(u.storageUsedBytes, u.storageLimit);
                return (
                  <tr key={u.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 text-xs font-semibold text-zinc-300">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/photographers/${u.id}`}
                        className="font-medium text-zinc-800 hover:text-blue-600 hover:underline"
                      >
                        {u.name ?? <span className="italic text-zinc-400">No name</span>}
                      </Link>
                      <p className="text-xs text-zinc-400 truncate max-w-[140px]">{u.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono text-xs tabular-nums ${p >= 90 ? "text-red-600 font-semibold" : "text-zinc-700"}`}>
                        {fmtBytes(u.storageUsedBytes)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-xs text-zinc-500">
                      {(photoCountByUser.get(u.id) ?? 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── Full per-photographer table ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">All Photographers</h2>
          <div className="flex items-center gap-3 ml-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200 border border-amber-300" />
              ≥ 90% full
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-200 border border-red-300" />
              Over limit
            </span>
          </div>
        </div>
        <StorageTable initialRows={rows} />
      </section>

    </div>
  );
}
