import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerT } from "@/lib/i18n/server";
import { ManageBillingButton } from "./ManageBillingButton";
import type { PlanTier } from "@/generated/prisma/client";

// ─── Config ───────────────────────────────────────────────────────────────────

const PLAN_LABEL: Record<PlanTier, string> = {
  FREE: "Free",
  PRO: "Pro",
  STUDIO: "Studio",
};

const PLAN_BADGE: Record<PlanTier, string> = {
  FREE:   "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  PRO:    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  STUDIO: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
};

const PLAN_EVENT_LIMIT: Record<PlanTier, string> = {
  FREE: "3",
  PRO: "25",
  STUDIO: "Unlimited",
};

const PLAN_STORAGE_BYTES: Record<PlanTier, number> = {
  FREE:   1  * 1024 ** 3,
  PRO:    50 * 1024 ** 3,
  STUDIO: 500 * 1024 ** 3,
};

const PLAN_STORAGE_LABEL: Record<PlanTier, string> = {
  FREE: "1 GB",
  PRO: "50 GB",
  STUDIO: "500 GB",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingPage() {
  const [t, session] = await Promise.all([getServerT(), getServerSession(authOptions)]);
  if (!session) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      subscription: true,
      events: {
        include: { photos: { select: { size: true } } },
      },
    },
  });
  if (!user) redirect("/login");

  const sub = user.subscription;
  const plan: PlanTier = sub?.planTier ?? "FREE";
  const isPaid = plan !== "FREE";
  const isCanceled = sub?.status === "canceled";
  const hasRealCustomer = sub?.stripeCustomerId && !sub.stripeCustomerId.startsWith("cus_pending_");
  const canManage = isPaid && !!hasRealCustomer;

  // Usage
  const eventCount = user.events.length;
  const storageUsed = user.events.flatMap((e) => e.photos).reduce((s, p) => s + p.size, 0);
  const storageLimit = PLAN_STORAGE_BYTES[plan];
  const storagePercent = Math.min(Math.round((storageUsed / storageLimit) * 100), 100);

  // Status label key
  type StatusKey = "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  const statusKey = (sub?.status ?? "active") as StatusKey;
  const statusLabel = t.billing.status[statusKey] ?? sub?.status ?? "Active";

  const STATUS_COLOR: Record<string, string> = {
    active:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    trialing:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    past_due:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    canceled:   "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
    incomplete: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">

      {/* ── Header ── */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Link
            href="/dashboard"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label={t.nav.backToDashboard}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {t.billing.title}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">

        {/* ── Plan card ── */}
        <div className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t.billing.planSection}
          </h2>

          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Plan info */}
            <div className="space-y-3">
              {/* Plan name */}
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {PLAN_LABEL[plan]}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${PLAN_BADGE[plan]}`}>
                  {PLAN_LABEL[plan]}
                </span>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">{t.billing.statusLabel}:</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[statusKey] ?? STATUS_COLOR.active}`}>
                  {statusLabel}
                </span>
              </div>

              {/* Next billing date */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">{t.billing.nextBillingLabel}:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {sub?.currentPeriodEnd && !isCanceled
                    ? formatDate(sub.currentPeriodEnd)
                    : t.billing.noBilling}
                </span>
              </div>
            </div>

            {/* CTA */}
            <div className="shrink-0">
              {canManage ? (
                <ManageBillingButton />
              ) : (
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {t.billing.upgradeButton}
                </Link>
              )}
            </div>
          </div>

          {/* Info notes */}
          {!isPaid && (
            <p className="mt-5 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-700/50 dark:text-zinc-400">
              {t.billing.freePlanNote}
            </p>
          )}
          {isCanceled && (
            <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {t.billing.canceledNote}
            </p>
          )}
        </div>

        {/* ── Usage card ── */}
        <div className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t.billing.usageSection}
          </h2>

          <div className="space-y-5">
            {/* Events */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Events</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.billing.eventsUsed(eventCount, PLAN_EVENT_LIMIT[plan])}
                </span>
              </div>
              {plan !== "STUDIO" && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                  <div
                    className={`h-full rounded-full ${
                      eventCount >= parseInt(PLAN_EVENT_LIMIT[plan])
                        ? "bg-red-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min((eventCount / parseInt(PLAN_EVENT_LIMIT[plan])) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Storage */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Storage</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.billing.storageUsed(formatBytes(storageUsed), PLAN_STORAGE_LABEL[plan])}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                <div
                  className={`h-full rounded-full transition-all ${
                    storagePercent >= 90 ? "bg-red-500" : storagePercent >= 70 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
