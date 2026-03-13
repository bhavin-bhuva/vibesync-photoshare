import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { fetchActivityLogs } from "./actions";
import { ActivityClient, type AdminOption } from "./ActivityClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function actionBadgeCls(action: string): string {
  const prefix = action.split("_")[0];
  const map: Record<string, string> = {
    DELETED:      "bg-red-100     text-red-700",
    SUSPENDED:    "bg-red-100     text-red-700",
    UNSUSPENDED:  "bg-emerald-100 text-emerald-700",
    RESTORED:     "bg-emerald-100 text-emerald-700",
    CHANGED:      "bg-amber-100   text-amber-700",
    RESET:        "bg-sky-100     text-sky-700",
    IMPERSONATED: "bg-violet-100  text-violet-700",
    EXITED:       "bg-zinc-100    text-zinc-600",
    INCREASED:    "bg-blue-100    text-blue-700",
  };
  return map[prefix] ?? "bg-zinc-100 text-zinc-600";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    admin?:  string;
    action?: string;
    type?:   string;
    from?:   string;
    to?:     string;
    search?: string;
    page?:   string;
  }>;
}) {
  await requireSuperAdmin();

  const sp = await searchParams;

  const adminFilter      = sp.admin  ?? "";
  const actionFilter     = sp.action ?? "";
  const targetTypeFilter = sp.type   ?? "";
  const dateFrom         = sp.from   ?? "";
  const dateTo           = sp.to     ?? "";
  const search           = sp.search ?? "";
  const currentPage      = Math.max(1, parseInt(sp.page ?? "1", 10));

  const filters = { adminId: adminFilter, action: actionFilter, targetType: targetTypeFilter, dateFrom, dateTo, search };

  // ── Fetch in parallel: logs + filter options ────────────────────────────────
  const [{ rows: rawRows, total }, adminsRaw, actionsRaw, targetTypesRaw] = await Promise.all([
    fetchActivityLogs(filters, currentPage, PAGE_SIZE),

    // Distinct admins who have logged actions
    db.user.findMany({
      where:   { role: "SUPER_ADMIN", adminActivityLogs: { some: {} } },
      select:  { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),

    // Distinct action types
    db.adminActivityLog.findMany({
      distinct: ["action"],
      select:   { action: true },
      orderBy:  { action: "asc" },
    }),

    // Distinct target types
    db.adminActivityLog.findMany({
      distinct: ["targetType"],
      select:   { targetType: true },
      orderBy:  { targetType: "asc" },
    }),
  ]);

  // Serialize dates to ISO strings (Date → string for client components)
  const rows = rawRows.map((r) => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  const admins: AdminOption[]      = adminsRaw;
  const distinctActions: string[]  = actionsRaw.map((a) => a.action);
  const distinctTargetTypes: string[] = targetTypesRaw.map((t) => t.targetType);

  // ── Summary counts ──────────────────────────────────────────────────────────
  const now        = new Date();
  const dayStart   = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart  = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const [totalLogs, todayLogs, weekLogs] = await Promise.all([
    db.adminActivityLog.count(),
    db.adminActivityLog.count({ where: { createdAt: { gte: dayStart } } }),
    db.adminActivityLog.count({ where: { createdAt: { gte: weekStart } } }),
  ]);

  // Recent action breakdown for summary bar
  const recentByAction = await db.adminActivityLog.groupBy({
    by:      ["action"],
    _count:  { id: true },
    orderBy: { _count: { id: "desc" } },
    take:    6,
  });

  return (
    <div className="space-y-6">

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">Total Actions</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{totalLogs.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-zinc-400">all time</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">Today</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{todayLogs.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-zinc-400">actions logged</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">Last 7 Days</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{weekLogs.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-zinc-400">actions logged</p>
        </div>
      </div>

      {/* ── Action breakdown ── */}
      {recentByAction.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Action Breakdown</h2>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-3">
            {recentByAction.map(({ action, _count }) => (
              <Link
                key={action}
                href={`?action=${encodeURIComponent(action)}`}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${actionBadgeCls(action)}`}
              >
                <span>{action.replace(/_/g, " ")}</span>
                <span className="opacity-70">× {_count.id}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Full audit table ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Audit Trail</h2>
        <ActivityClient
          rows={rows}
          total={total}
          pageSize={PAGE_SIZE}
          currentPage={currentPage}
          admins={admins}
          distinctActions={distinctActions}
          distinctTargetTypes={distinctTargetTypes}
          adminFilter={adminFilter}
          actionFilter={actionFilter}
          targetTypeFilter={targetTypeFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          search={search}
        />
      </section>

    </div>
  );
}
