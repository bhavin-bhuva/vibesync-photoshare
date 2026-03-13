import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { Prisma } from "@/generated/prisma/client";
import { SubscriptionsClient, type SubscriptionRow } from "./SubscriptionsClient";
import { ManualOverridePanel } from "./ManualOverridePanel";

// ─── Stripe URL helper ────────────────────────────────────────────────────────

function stripeCustomerUrl(customerId: string): string {
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test") ?? true;
  return `https://dashboard.stripe.com/${isTest ? "test/" : ""}customers/${customerId}`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "blue" | "violet" | "red" | "amber";
}) {
  const accentCls: Record<string, string> = {
    green:  "bg-emerald-50 text-emerald-600",
    blue:   "bg-blue-50   text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    red:    "bg-red-50    text-red-600",
    amber:  "bg-amber-50  text-amber-600",
  };
  const cls = accent ? accentCls[accent] : "bg-zinc-50 text-zinc-600";
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-sm`}>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${accent ? accentCls[accent].split(" ")[1] : "text-zinc-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?:   string;
    status?: string;
    from?:   string;
    to?:     string;
    sort?:   string;
    dir?:    string;
    page?:   string;
  }>;
}) {
  await requireSuperAdmin();

  const sp = await searchParams;

  const planFilter   = sp.plan   ?? "";
  const statusFilter = sp.status ?? "";
  const dateFrom     = sp.from   ?? "";
  const dateTo       = sp.to     ?? "";
  const sortBy       = sp.sort   ?? "createdAt";
  const sortDir      = (sp.dir === "asc" ? "asc" : "desc") as "asc" | "desc";
  const currentPage  = Math.max(1, parseInt(sp.page ?? "1", 10));

  // ── Stat queries (all in parallel) ─────────────────────────────────────────
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activePro,
    activeStudio,
    newThisMonth,
    canceledThisMonth,
  ] = await Promise.all([
    db.subscription.count({ where: { planTier: "PRO",    status: { in: ["active", "trialing"] } } }),
    db.subscription.count({ where: { planTier: "STUDIO", status: { in: ["active", "trialing"] } } }),
    db.subscription.count({ where: { planTier: { not: "FREE" }, createdAt: { gte: monthStart } } }),
    db.subscription.count({ where: { status: "canceled", updatedAt: { gte: monthStart } } }),
  ]);

  const mrr = activePro * 19 + activeStudio * 49;

  // ── Table data ──────────────────────────────────────────────────────────────

  // Build where clause
  const where: Prisma.SubscriptionWhereInput = {};

  if (planFilter)   where.planTier = planFilter as "FREE" | "PRO" | "STUDIO";
  if (statusFilter) where.status   = statusFilter;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  // Build orderBy
  type OrderByType = Prisma.SubscriptionOrderByWithRelationInput;
  let orderBy: OrderByType;

  switch (sortBy) {
    case "name":
      orderBy = { user: { name: sortDir } };
      break;
    case "email":
      orderBy = { user: { email: sortDir } };
      break;
    case "plan":
      orderBy = { planTier: sortDir };
      break;
    case "status":
      orderBy = { status: sortDir };
      break;
    case "currentPeriodEnd":
      orderBy = { currentPeriodEnd: sortDir };
      break;
    default:
      orderBy = { createdAt: sortDir };
  }

  const [total, subs] = await Promise.all([
    db.subscription.count({ where }),
    db.subscription.findMany({
      where,
      orderBy,
      skip:  (currentPage - 1) * PAGE_SIZE,
      take:  PAGE_SIZE,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const rows: SubscriptionRow[] = subs.map((s) => ({
    id:               s.id,
    userId:           s.user.id,
    name:             s.user.name,
    email:            s.user.email,
    planTier:         s.planTier as "FREE" | "PRO" | "STUDIO",
    stripeCustomerId: s.stripeCustomerId,
    stripeUrl:        stripeCustomerUrl(s.stripeCustomerId),
    status:           s.status,
    createdAt:        s.createdAt.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : null,
  }));

  return (
    <div className="space-y-6">

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard
          label="Monthly Recurring Revenue"
          value={`$${mrr.toLocaleString()}`}
          sub="Active + trialing paid plans"
          accent="green"
        />
        <StatCard
          label="PRO Subscribers"
          value={activePro.toLocaleString()}
          sub="$19/mo × active"
          accent="blue"
        />
        <StatCard
          label="STUDIO Subscribers"
          value={activeStudio.toLocaleString()}
          sub="$49/mo × active"
          accent="violet"
        />
        <StatCard
          label="New This Month"
          value={newThisMonth.toLocaleString()}
          sub="Paid plans started"
          accent="amber"
        />
        <StatCard
          label="Churned This Month"
          value={canceledThisMonth.toLocaleString()}
          sub="Canceled this month"
          accent="red"
        />
      </div>

      {/* ── Table ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">All Subscriptions</h2>
        <Suspense fallback={<div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">Loading…</div>}>
          <SubscriptionsClient
            rows={rows}
            total={total}
            pageSize={PAGE_SIZE}
            currentPage={currentPage}
            sortBy={sortBy}
            sortDir={sortDir}
            planFilter={planFilter}
            statusFilter={statusFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </Suspense>
      </section>

      {/* ── Manual Override ── */}
      <ManualOverridePanel />

    </div>
  );
}
