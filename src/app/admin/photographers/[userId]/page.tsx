import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EventsSection, type EventRow } from "./EventsSection";
import { DangerZone } from "./DangerZone";
import { ImpersonateButton } from "./ImpersonateButton";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | null) {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(date: Date | null): string {
  if (!date) return "Never";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)    return "Just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatStorage(bytes: bigint): string {
  const n = Number(bytes);
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024)         return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function storagePercent(used: bigint, limit: bigint): number {
  if (limit === BigInt(0)) return 0;
  return Math.min(100, Math.round(Number((used * BigInt(100)) / limit)));
}

function storageCls(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-blue-500";
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  FREE:   { label: "Free",   cls: "bg-zinc-100 text-zinc-700" },
  PRO:    { label: "Pro",    cls: "bg-blue-100 text-blue-700" },
  STUDIO: { label: "Studio", cls: "bg-violet-100 text-violet-700" },
};

function getInitials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0][0].toUpperCase();
  }
  return email[0].toUpperCase();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PhotographerDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const user = await db.user.findUnique({
    where: { id: userId, role: "PHOTOGRAPHER" },
    include: {
      subscription: true,
      studioProfile: { select: { studioName: true } },
      events: {
        orderBy: { date: "desc" },
        include: {
          _count: { select: { photos: true, sharedLinks: true } },
          sharedLinks: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              slug: true,
              createdAt: true,
              expiresAt: true,
              _count: { select: { photoSelections: true } },
              event: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!user) notFound();

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const totalEvents     = user.events.length;
  const totalPhotos     = user.events.reduce((s, e) => s + e._count.photos, 0);
  const totalLinks      = user.events.reduce((s, e) => s + e._count.sharedLinks, 0);
  const allLinks        = user.events.flatMap((e) => e.sharedLinks);
  const totalSelections = allLinks.reduce((s, l) => s + l._count.photoSelections, 0);

  const pct   = storagePercent(user.storageUsedBytes, user.storageLimit);
  const plan  = user.subscription?.planTier ?? "FREE";
  const badge = PLAN_BADGE[plan];

  // ── Serialise events for client component ────────────────────────────────
  const eventRows: EventRow[] = user.events.map((e) => ({
    id:             e.id,
    name:           e.name,
    date:           e.date.toISOString(),
    createdAt:      e.createdAt.toISOString(),
    photoCount:     e._count.photos,
    sharedLinkCount: e._count.sharedLinks,
  }));

  // ── Flatten + sort all shared links ─────────────────────────────────────
  const now = new Date();
  const linkRows = allLinks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="space-y-6">

      {/* ── Back ── */}
      <Link
        href="/admin/photographers"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-700"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" /></svg>
        Back to Photographers
      </Link>

      {/* ── Profile card ── */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-start gap-5 p-6">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-xl font-bold text-white shadow-md">
            {getInitials(user.name, user.email)}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-zinc-900">{user.name ?? <span className="italic text-zinc-400">No name</span>}</h1>
              {/* Role badge */}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Photographer
              </span>
              {/* Plan badge */}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
              {/* Status badge */}
              {user.isSuspended ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Suspended</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
              )}
            </div>

            <p className="mt-0.5 text-sm text-zinc-500">{user.email}</p>
            {user.studioProfile?.studioName && (
              <p className="mt-0.5 text-xs text-zinc-400">Studio: <span className="text-zinc-600">{user.studioProfile.studioName}</span></p>
            )}

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
              <span>Joined: <span className="text-zinc-600">{formatDate(user.createdAt)}</span></span>
              <span>Last login: <span className="text-zinc-600">{timeAgo(user.lastLoginAt)}</span></span>
              {user.lastLoginIp && (
                <span>IP: <code className="rounded bg-zinc-100 px-1 text-zinc-600">{user.lastLoginIp}</code></span>
              )}
              {user.isSuspended && user.suspendedReason && (
                <span className="text-red-400">Reason: <span className="text-red-600">{user.suspendedReason}</span></span>
              )}
            </div>
          </div>

          {/* Actions + User ID */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <ImpersonateButton userId={user.id} />
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">User ID</p>
              <code className="text-xs text-zinc-400">{user.id}</code>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Storage — special card with progress bar */}
        <div className="col-span-2 flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-500">Storage Used</p>
            <span className="text-xs font-semibold text-zinc-700">{pct}%</span>
          </div>
          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className={`h-full rounded-full transition-all ${storageCls(pct)}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              {formatStorage(user.storageUsedBytes)} of {formatStorage(user.storageLimit)}
            </p>
          </div>
        </div>

        {/* Simple stat cards */}
        {[
          { label: "Events",     value: totalEvents },
          { label: "Photos",     value: totalPhotos },
          { label: "Share Links",value: totalLinks },
          { label: "Selections", value: totalSelections },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col justify-center rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* ── Events (expandable, client) ── */}
      <EventsSection events={eventRows} />

      {/* ── Shared Links ── */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Shared Links</h2>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">{linkRows.length}</span>
        </div>

        {linkRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-400">No shared links yet.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                {["Slug", "Event", "Created", "Expires", "Selections", "Status"].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {linkRows.map((link) => {
                const expired = link.expiresAt ? link.expiresAt < now : false;
                return (
                  <tr key={link.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700">{link.slug}</code>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{link.event.name}</td>
                    <td className="px-5 py-3 text-zinc-500">{formatDate(link.createdAt)}</td>
                    <td className="px-5 py-3 text-zinc-500">
                      {link.expiresAt ? (
                        <span className={expired ? "text-red-500" : ""}>{formatDate(link.expiresAt)}</span>
                      ) : (
                        <span className="text-zinc-300">No expiry</span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-zinc-600">{link._count.photoSelections}</td>
                    <td className="px-5 py-3">
                      {expired ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">Expired</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Danger Zone (client) ── */}
      <DangerZone
        userId={user.id}
        userName={user.name ?? user.email}
        isSuspended={user.isSuspended}
        currentPlan={plan}
      />
    </div>
  );
}
