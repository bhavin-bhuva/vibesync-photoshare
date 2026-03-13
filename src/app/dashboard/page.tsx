import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import type { PlanTier } from "@/generated/prisma/client";
import { CreateEventModal } from "./CreateEventModal";
import { AccessDeniedToast } from "./AccessDeniedToast";
import { UserMenu } from "./UserMenu";
import { StorageBanner } from "./StorageBanner";
import { getCloudfrontSignedUrl } from "@/lib/cloudfront";
import Link from "next/link";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { checkStorageLimit, formatBytes } from "@/lib/storage";
import { getEventLimits } from "@/lib/platform-settings";

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_BADGE: Record<PlanTier, { label: string; className: string }> = {
  FREE:   { label: "Free",   className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300" },
  PRO:    { label: "Pro",    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  STUDIO: { label: "Studio", className: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Deterministic placeholder colour based on event name
const COVER_GRADIENTS = [
  "from-rose-400 to-orange-300",
  "from-sky-400 to-blue-300",
  "from-violet-400 to-purple-300",
  "from-emerald-400 to-teal-300",
  "from-amber-400 to-yellow-300",
  "from-pink-400 to-rose-300",
];
function placeholderGradient(name: string) {
  const idx = name.charCodeAt(0) % COVER_GRADIENTS.length;
  return COVER_GRADIENTS[idx];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [t, locale, session] = await Promise.all([
    getServerT(),
    getServerLocale(),
    getServerSession(authOptions),
  ]);
  if (!session) redirect("/login");

  const [user, eventLimits] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      include: {
        subscription: true,
        events: {
          orderBy: { date: "desc" },
          include: {
            _count: { select: { photos: true } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sharedLinks: { select: { accessType: true, expiresAt: true } as any },
          },
        },
      },
    }),
    getEventLimits(),
  ]);

  if (!user) redirect("/login");

  const plan = user.subscription?.planTier ?? "FREE";
  const badge = PLAN_BADGE[plan];
  const planEventLimit: Record<PlanTier, number | null> = {
    FREE:   eventLimits.FREE,
    PRO:    eventLimits.PRO,
    STUDIO: null,
  };
  const eventLimit = planEventLimit[plan];

  const { used: storageUsed, limit: storageLimit, percentUsed: storagePercent } =
    await checkStorageLimit(session.user.id, 0);

  const events = user.events;
  const atEventLimit = eventLimit !== null && events.length >= eventLimit;

  const coverUrls = new Map(
    await Promise.all(
      events.map(async (e) => [e.id, e.coverPhotoKey ? await getCloudfrontSignedUrl(e.coverPhotoKey) : null] as const)
    )
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {error === "access_denied" && <AccessDeniedToast />}
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t.app.name}
          </span>
          <UserMenu
            name={user.name}
            email={user.email ?? ""}
            locale={locale}
          />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">

        {/* ── Storage warning banner ── */}
        {storagePercent > 90 && <StorageBanner />}

        {/* ── New selections banner ── */}
        {events.some((e) => e.hasNewSelections) && (() => {
          const first = events.find((e) => e.hasNewSelections)!;
          return (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6ZM10 18a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z" />
                </svg>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  {t.dashboard.newSelectionsBanner}
                </p>
              </div>
              <Link
                href={`/dashboard/events/${first.id}/selections`}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                {t.dashboard.newSelectionsButton}
              </Link>
            </div>
          );
        })()}

        {/* ── Welcome + plan badge ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {t.dashboard.welcome(user.name ?? user.email ?? "")}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {t.dashboard.subtitle}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${badge.className}`}
          >
            {t.dashboard.planBadge(badge.label)}
          </span>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Events */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              {t.dashboard.stats.events}
            </p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {events.length}
              {eventLimit !== null && (
                <span className="ml-1 text-lg font-normal text-zinc-400">
                  / {eventLimit}
                </span>
              )}
            </p>
            {atEventLimit && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {t.dashboard.stats.atEventLimit}
              </p>
            )}
          </div>

          {/* Photos */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              {t.dashboard.stats.photos}
            </p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {events.reduce((s, e) => s + e._count.photos, 0).toLocaleString()}
            </p>
          </div>

          {/* Storage */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              {t.dashboard.stats.storage}
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
              <div
                className={`h-full rounded-full transition-all ${
                  storagePercent > 95
                    ? "bg-red-500"
                    : storagePercent >= 80
                    ? "bg-amber-400"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(storagePercent, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {formatBytes(storageUsed, storageLimit)}
            </p>
          </div>
        </div>

        {/* ── Events grid ── */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t.dashboard.events.sectionTitle}
            </h2>
            <CreateEventModal atEventLimit={atEventLimit} />
          </div>

          {events.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-3xl">📷</p>
              <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t.dashboard.events.empty}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {t.dashboard.events.emptySubtitle}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => {
                const coverUrl = coverUrls.get(event.id) ?? null;
                return (
                  <Link
                    key={event.id}
                    href={`/dashboard/events/${event.id}`}
                    className="group overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 transition-shadow hover:shadow-md dark:bg-zinc-800 dark:ring-zinc-700"
                  >
                    {/* Cover */}
                    <div
                      className={`relative h-44 ${!coverUrl ? `bg-gradient-to-br ${placeholderGradient(event.name)}` : "bg-zinc-100 dark:bg-zinc-700"}`}
                    >
                      {coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coverUrl}
                          alt={`${event.name} cover`}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                          <svg className="h-16 w-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                            <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
                          </svg>
                        </div>
                      )}

                      {/* Photo count pill */}
                      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                          <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
                        </svg>
                        {t.common.photoCount(event._count.photos)}
                      </span>

                      {/* New selections badge */}
                      {event.hasNewSelections && (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                          {t.dashboard.newSelectionsBadge}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                        {event.name}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                        {formatDate(event.date)}
                      </p>
                      {/* Protection badges — distinct types among non-expired links */}
                      {(() => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const links = (event as any).sharedLinks as Array<{ accessType: string; expiresAt: Date | null }> ?? [];
                        const activeTypes = [...new Set(
                          links
                            .filter((l) => !l.expiresAt || new Date() <= new Date(l.expiresAt))
                            .map((l) => l.accessType)
                        )];
                        if (activeTypes.length === 0) return null;
                        return (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {activeTypes.map((type) => (
                              <span
                                key={type}
                                className={
                                  type === "NONE"
                                    ? "rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                                    : type === "PIN"
                                    ? "rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                }
                              >
                                {type === "NONE"
                                  ? t.shareModal.accessBadgeNone
                                  : type === "PIN"
                                  ? t.shareModal.accessBadgePin
                                  : t.shareModal.accessBadgePassword}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
