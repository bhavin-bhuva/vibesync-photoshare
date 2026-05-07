import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getServerT } from "@/lib/i18n/server";
import { getEventLimits } from "@/lib/platform-settings";
import { formatStorageSize } from "@/lib/storage";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingPage() {
  const [t, session] = await Promise.all([getServerT(), getServerSession(authOptions)]);
  if (!session) redirect("/login");

  const [user, eventLimits] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      include: {
        subscription: true,
        events: {
          include: { photos: { select: { size: true } } },
        },
      },
    }),
    getEventLimits(),
  ]);
  if (!user) redirect("/api/auth/force-signout");

  const sub = user.subscription;
  const plan: PlanTier = sub?.planTier ?? "FREE";
  const isPaid = plan !== "FREE";
  const isCanceled = sub?.status === "canceled";
  const hasRealCustomer = sub?.stripeCustomerId && !sub.stripeCustomerId.startsWith("cus_pending_");
  const canManage = isPaid && !!hasRealCustomer;

  // Usage
  const eventCount = user.events.length;
  const storageUsed = user.events.flatMap((e) => e.photos).reduce((s, p) => s + p.size, 0);
  const storageLimit = Number(user.storageLimit);
  const storagePercent = Math.min(Math.round((storageUsed / storageLimit) * 100), 100);
  const storageLimitLabel = formatStorageSize(user.storageLimit);

  const planEventLimitNum: Record<PlanTier, number | null> = {
    FREE:   eventLimits.FREE,
    PRO:    eventLimits.PRO,
    STUDIO: null,
  };
  const eventLimitNum = planEventLimitNum[plan];
  const eventLimitLabel = eventLimitNum != null ? String(eventLimitNum) : "Unlimited";

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

  // Fetch recent invoices from Stripe (non-blocking)
  type InvoiceRow = {
    id: string;
    date: string;
    description: string;
    amount: string;
    status: string;
    pdfUrl: string | null;
  };
  let invoices: InvoiceRow[] = [];
  if (canManage && sub?.stripeCustomerId) {
    try {
      const list = await stripe.invoices.list({
        customer: sub.stripeCustomerId,
        limit: 10,
      });
      invoices = list.data.map((inv) => ({
        id: inv.id,
        date: new Date((inv.created) * 1000).toLocaleDateString("en-US", {
          year: "numeric", month: "short", day: "numeric",
        }),
        description: inv.description ?? (inv.lines.data[0]?.description ?? "Subscription"),
        amount: formatAmount(inv.amount_paid, inv.currency),
        status: inv.status ?? "paid",
        pdfUrl: inv.invoice_pdf ?? null,
      }));
    } catch {
      // Silently fail — invoices are non-critical
    }
  }

  const INVOICE_STATUS_COLOR: Record<string, string> = {
    paid:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    open:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    void:   "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
    draft:  "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">

      {/* ── Header ── */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
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

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">

        {/* ── Plan card ── */}
        <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700 sm:p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:mb-5">
            {t.billing.planSection}
          </h2>

          <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            {/* Plan info */}
            <div className="space-y-2.5">
              {/* Plan name + badge */}
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

              {/* Next billing */}
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
            <div className="sm:shrink-0 sm:self-start">
              {canManage ? (
                <ManageBillingButton fullWidthMobile />
              ) : (
                <Link
                  href="/pricing"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:py-2.5"
                >
                  {t.billing.upgradeButton}
                </Link>
              )}
            </div>
          </div>

          {/* Notes */}
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
        <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700 sm:p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:mb-5">
            {t.billing.usageSection}
          </h2>

          {/* Stats row — side-by-side on desktop */}
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Events stat */}
            <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-700/50">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t.billing.eventsLabel}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{eventCount}</p>
              <p className="text-xs text-zinc-400">of {eventLimitLabel}</p>
            </div>

            {/* Storage stat */}
            <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-700/50">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t.billing.storageLabel}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{formatBytes(storageUsed)}</p>
              <p className="text-xs text-zinc-400">of {storageLimitLabel}</p>
            </div>
          </div>

          {/* Progress bars */}
          <div className="space-y-4">
            {/* Events progress */}
            {eventLimitNum != null && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{t.billing.eventsLabel}</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {t.billing.eventsUsed(eventCount, eventLimitLabel)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                  <div
                    className={`h-full rounded-full ${eventCount >= eventLimitNum ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min((eventCount / eventLimitNum) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Storage progress */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{t.billing.storageLabel}</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.billing.storageUsed(formatBytes(storageUsed), storageLimitLabel)}
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

        {/* ── Invoice history ── */}
        {invoices.length > 0 && (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700 sm:p-6">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:mb-5">
              Invoice History
            </h2>

            {/* Desktop: table */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-700">
                    <th className="pb-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Date</th>
                    <th className="pb-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Description</th>
                    <th className="pb-3 text-right font-medium text-zinc-500 dark:text-zinc-400">Amount</th>
                    <th className="pb-3 text-left font-medium text-zinc-500 dark:text-zinc-400 pl-4">Status</th>
                    <th className="pb-3 text-right font-medium text-zinc-500 dark:text-zinc-400">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 text-zinc-600 dark:text-zinc-400">{inv.date}</td>
                      <td className="py-3 text-zinc-900 dark:text-zinc-100 max-w-[200px] truncate">{inv.description}</td>
                      <td className="py-3 text-right font-semibold text-zinc-900 dark:text-zinc-100">{inv.amount}</td>
                      <td className="py-3 pl-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${INVOICE_STATUS_COLOR[inv.status] ?? INVOICE_STATUS_COLOR.paid}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {inv.pdfUrl ? (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200">
                            Download
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list */}
            <div className="space-y-3 sm:hidden">
              {invoices.map((inv) => (
                <div key={inv.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                  {/* Row 1: Date + Amount */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{inv.date}</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{inv.amount}</span>
                  </div>
                  {/* Row 2: Description + Status */}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-zinc-700 dark:text-zinc-200">{inv.description}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${INVOICE_STATUS_COLOR[inv.status] ?? INVOICE_STATUS_COLOR.paid}`}>
                      {inv.status}
                    </span>
                  </div>
                  {/* Row 3: PDF link */}
                  {inv.pdfUrl && (
                    <div className="mt-2 flex justify-end">
                      <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200">
                        Download PDF
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Upgrade banner (free plan) ── */}
        {!isPaid && (
          <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-700 p-5 text-white dark:from-zinc-700 dark:to-zinc-600 sm:p-6">
            <h2 className="text-base font-semibold">Unlock more with Pro</h2>
            <p className="mt-1 text-sm text-zinc-300">
              More events, more storage, watermarking, and ZIP downloads for your clients.
            </p>
            <Link
              href="/pricing"
              className="mt-4 flex w-full items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 sm:inline-flex sm:w-auto sm:py-2.5"
            >
              View plans
            </Link>
          </div>
        )}

      </main>
    </div>
  );
}
