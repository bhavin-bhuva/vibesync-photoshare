import { db } from "@/lib/db";
import { RefreshButton } from "./RefreshButton";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStorage(bytes: bigint): string {
  const n = Number(bytes);
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024)         return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)                  return "just now";
  if (s < 3600)                return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)               return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

const COLOR_MAP = {
  blue:   { bg: "bg-blue-50",   icon: "text-blue-600"   },
  violet: { bg: "bg-violet-50", icon: "text-violet-600" },
  amber:  { bg: "bg-amber-50",  icon: "text-amber-600"  },
  emerald:{ bg: "bg-emerald-50",icon: "text-emerald-600"},
  rose:   { bg: "bg-rose-50",   icon: "text-rose-600"   },
  sky:    { bg: "bg-sky-50",    icon: "text-sky-600"    },
} as const;

type ColorKey = keyof typeof COLOR_MAP;

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: ColorKey;
  icon: React.ReactNode;
}) {
  const { bg, icon: iconColor } = COLOR_MAP[color];
  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg} ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-zinc-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Plan badge ───────────────────────────────────────────────────────────────

const PLAN_BADGE: Record<string, { label: string; className: string }> = {
  FREE:   { label: "Free",   className: "bg-zinc-100 text-zinc-600" },
  PRO:    { label: "Pro",    className: "bg-blue-100 text-blue-700" },
  STUDIO: { label: "Studio", className: "bg-violet-100 text-violet-700" },
};

// ─── Action badge colour ──────────────────────────────────────────────────────

function actionBadgeClass(action: string): string {
  if (action.startsWith("DELETED") || action.startsWith("SUSPENDED")) return "bg-red-100 text-red-700";
  if (action.startsWith("CHANGED"))                                    return "bg-amber-100 text-amber-700";
  if (action.startsWith("RESTORED") || action.startsWith("UNSUSPENDED")) return "bg-emerald-100 text-emerald-700";
  return "bg-zinc-100 text-zinc-600";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalPhotographers,
    activeSubscriptions,
    storageAgg,
    totalPhotos,
    totalEvents,
    newSignupsThisMonth,
    recentSignups,
    recentActivity,
  ] = await Promise.all([
    db.user.count({ where: { role: "PHOTOGRAPHER" } }),
    db.subscription.count({ where: { planTier: { in: ["PRO", "STUDIO"] }, status: "active" } }),
    db.user.aggregate({ _sum: { storageUsedBytes: true } }),
    db.photo.count(),
    db.event.count(),
    db.user.count({ where: { role: "PHOTOGRAPHER", createdAt: { gte: startOfMonth } } }),
    db.user.findMany({
      where: { role: "PHOTOGRAPHER" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        isSuspended: true,
        subscription: { select: { planTier: true } },
      },
    }),
    db.adminActivityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { admin: { select: { name: true, email: true } } },
    }),
  ]);

  const totalStorageBytes = storageAgg._sum.storageUsedBytes ?? BigInt(0);

  const lastUpdated = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const stats: { label: string; value: string; color: ColorKey; icon: React.ReactNode }[] = [
    {
      label: "Total Photographers",
      value: totalPhotographers.toLocaleString(),
      color: "blue",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 17a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
        </svg>
      ),
    },
    {
      label: "Active Subscriptions",
      value: activeSubscriptions.toLocaleString(),
      color: "violet",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 0 0 1 5.5V6h18v-.5A1.5 1.5 0 0 0 17.5 4h-15ZM19 8.5H1v6A1.5 1.5 0 0 0 2.5 16h15a1.5 1.5 0 0 0 1.5-1.5v-6ZM3 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm4.75-.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "Total Storage Used",
      value: formatStorage(totalStorageBytes),
      color: "amber",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.477.246.477.525v3.584a.75.75 0 0 0 1.272.53l3.88-3.88a.997.997 0 0 1 .232-.18c.264-.137.455-.38.455-.664V5.426c0-1.413-.993-2.67-2.43-2.902A41.202 41.202 0 0 0 10 2Z" />
        </svg>
      ),
    },
    {
      label: "Total Photos",
      value: totalPhotos.toLocaleString(),
      color: "emerald",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "Total Events",
      value: totalEvents.toLocaleString(),
      color: "rose",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "New Signups This Month",
      value: newSignupsThisMonth.toLocaleString(),
      color: "sky",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.046 15.253c-.058.468.172.92.57 1.174A9.953 9.953 0 0 0 8 18c1.982 0 3.83-.578 5.384-1.573.398-.254.628-.706.57-1.174a6.001 6.001 0 0 0-11.908 0ZM12.75 7.75a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0V9.25h2.25a.75.75 0 0 0 0-1.5h-2.25V5.5a.75.75 0 0 0-1.5 0v2.25h-2.25Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          Last updated: <span className="text-zinc-600">{lastUpdated}</span>
        </p>
        <RefreshButton />
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* ── Tables ── */}
      <div className="grid grid-cols-2 gap-6">

        {/* Recent Signups */}
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Recent Signups</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
              Last 10
            </span>
          </div>

          {recentSignups.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-400">No photographers yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-50">
              {recentSignups.map((u) => {
                const plan = u.subscription?.planTier ?? "FREE";
                const badge = PLAN_BADGE[plan];
                return (
                  <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                      {(u.name ?? u.email)[0].toUpperCase()}
                    </div>
                    {/* Name + email */}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-900">
                        {u.name ?? <span className="text-zinc-400">No name</span>}
                        {u.isSuspended && (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                            Suspended
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-zinc-400">{u.email}</p>
                    </div>
                    {/* Plan */}
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                    {/* Date */}
                    <span className="shrink-0 text-xs text-zinc-400">{formatDate(u.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent Activity */}
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Recent Activity</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
              Last 10
            </span>
          </div>

          {recentActivity.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-400">No admin actions recorded yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-50">
              {recentActivity.map((log) => (
                <li key={log.id} className="flex items-start gap-3 px-5 py-3">
                  {/* Action badge */}
                  <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${actionBadgeClass(log.action)}`}>
                    {log.action.replace(/_/g, " ")}
                  </span>
                  {/* Target + admin */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">{log.targetType}</span>
                      {" · "}
                      <span className="font-mono">{log.targetId.slice(0, 10)}…</span>
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      by {log.admin.name ?? log.admin.email}
                    </p>
                  </div>
                  {/* Time ago */}
                  <span className="shrink-0 text-xs text-zinc-400">{timeAgo(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}
