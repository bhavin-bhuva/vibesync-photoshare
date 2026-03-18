import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerT } from "@/lib/i18n/server";
import { formatStorageSize } from "@/lib/storage";
import { createCheckoutSessionAction } from "./actions";
import type { PlanTier } from "@/generated/prisma/client";

// ─── Plan definitions ─────────────────────────────────────────────────────────

type PlanKey = "free" | "pro" | "studio";

interface Plan {
  key: PlanKey;
  tier: PlanTier;
  priceId: string | null;
  price: string;
  popular: boolean;
  events: string;
  storage: string;
  features: boolean[];
}

// Feature flags by tier: [galleries, expiry, zipDownload, support, manager]
const TIER_FEATURES: Record<PlanTier, boolean[]> = {
  FREE:   [true, true, true, false, false],
  PRO:    [true, true, true, true,  false],
  STUDIO: [true, true, true, true,  true ],
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 10Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PricingPage() {
  const t = await getServerT();
  const [session, dbPlans] = await Promise.all([
    getServerSession(authOptions),
    db.stripePlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { tier: true, stripePriceId: true, price: true, storageBytes: true, maxEvents: true, isPopular: true, displayName: true },
    }),
  ]);

  let currentTier: PlanTier = "FREE";
  if (session) {
    const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
    currentTier = sub?.planTier ?? "FREE";
  }

  // Build plan list fully from DB — create plans at /admin/plans
  const PLANS: Plan[] = dbPlans.map((p) => ({
    key: p.tier.toLowerCase() as PlanKey,
    tier: p.tier,
    priceId: p.stripePriceId === "free" ? null : p.stripePriceId,
    price: Number(p.price) === 0 ? "$0" : `$${Number(p.price).toFixed(0)}`,
    popular: p.isPopular,
    events: p.maxEvents != null ? String(p.maxEvents) : "Unlimited",
    storage: formatStorageSize(p.storageBytes),
    features: TIER_FEATURES[p.tier] ?? [true, true, true, false, false],
  }));

  const featureKeys = ["galleries", "expiry", "zipDownload", "support", "manager"] as const;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">

      {/* ── Nav ── */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-50">
              <svg className="h-4 w-4 text-white dark:text-zinc-900" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{t.app.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            {session ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {t.nav.dashboard}
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                  {t.nav.signIn}
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {t.nav.getStarted}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t.pricing.title}
        </h1>
        <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">
          {t.pricing.subtitle}
        </p>
      </div>

      {/* ── Plan cards ── */}
      <div className="mx-auto max-w-5xl px-6 pb-24">
        {PLANS.length === 0 && (
          <p className="py-16 text-center text-zinc-400 dark:text-zinc-500">
            No plans available yet. Check back soon.
          </p>
        )}
        <div className={`grid gap-6 ${PLANS.length === 1 ? "max-w-sm mx-auto" : PLANS.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const planMeta = t.pricing.plans[plan.key] ?? { name: plan.key, description: "" };

            return (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-2xl border bg-white p-8 shadow-sm dark:bg-zinc-800 ${
                  plan.popular
                    ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-50 dark:ring-zinc-50"
                    : "border-zinc-200 dark:border-zinc-700"
                }`}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900">
                    {t.pricing.mostPopular}
                  </span>
                )}

                {/* Plan name + description */}
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {planMeta.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {planMeta.description}
                  </p>
                </div>

                {/* Price */}
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
                    {plan.price}
                  </span>
                  {plan.priceId && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {t.pricing.monthly}
                    </span>
                  )}
                </div>

                {/* Features */}
                <ul className="mt-8 flex-1 space-y-3">
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <CheckIcon />
                    {t.pricing.features.events(plan.events)}
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <CheckIcon />
                    {t.pricing.features.storage(plan.storage)}
                  </li>
                  {featureKeys.map((fk, i) => (
                    <li key={fk} className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                      {plan.features[i] ? <CheckIcon /> : <MinusIcon />}
                      <span className={plan.features[i] ? "" : "text-zinc-400 dark:text-zinc-500"}>
                        {t.pricing.features[fk]}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-8">
                  {isCurrent ? (
                    <div className="w-full rounded-lg border border-zinc-200 py-2.5 text-center text-sm font-medium text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                      {t.pricing.currentPlan}
                    </div>
                  ) : plan.priceId === null ? (
                    // Free plan — not current (shouldn't happen once logged in, but handles logged-out state)
                    <Link
                      href="/register"
                      className="block w-full rounded-lg border border-zinc-300 py-2.5 text-center text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-50 dark:hover:bg-zinc-700"
                    >
                      {t.pricing.getStarted}
                    </Link>
                  ) : !session ? (
                    <Link
                      href="/login?callbackUrl=/pricing"
                      className={`block w-full rounded-lg py-2.5 text-center text-sm font-medium transition-colors ${
                        plan.popular
                          ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                          : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-50 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {t.pricing.upgrade(planMeta.name)}
                    </Link>
                  ) : (
                    <form action={createCheckoutSessionAction}>
                      <input type="hidden" name="priceId" value={plan.priceId} />
                      <button
                        type="submit"
                        className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
                          plan.popular
                            ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-50 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {t.pricing.upgrade(planMeta.name)}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Guarantee note */}
        <p className="mt-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
          {t.pricing.trialNote}
        </p>
      </div>
    </div>
  );
}
