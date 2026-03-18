"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { stripe } from "@/lib/stripe";
import type { BillingInterval, PlanTier } from "@/generated/prisma/client";

async function getIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    null
  );
}

// ─── Update Plan ──────────────────────────────────────────────────────────────

export type UpdatePlanInput = {
  displayName: string;
  stripePriceId: string;
  price: number;
  interval: BillingInterval;
  storageGb: number;
  maxEvents: number | null;
  features: string[];
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
};

export async function updateStripePlanAction(
  planId: string,
  input: UpdatePlanInput
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    const existing = await db.stripePlan.findUniqueOrThrow({
      where: { id: planId },
      select: { name: true },
    });

    await db.$transaction([
      db.stripePlan.update({
        where: { id: planId },
        data: {
          displayName: input.displayName,
          stripePriceId: input.stripePriceId,
          price: input.price,
          interval: input.interval,
          storageBytes: BigInt(Math.round(input.storageGb * 1073741824)),
          maxEvents: input.maxEvents,
          features: input.features,
          isPopular: input.isPopular,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
      }),
      db.adminActivityLog.create({
        data: {
          adminId: session.user.id,
          action: "UPDATED_PLAN",
          targetType: "STRIPE_PLAN",
          targetId: planId,
          metadata: { planName: existing.name, changes: input },
          ipAddress: ip,
        },
      }),
    ]);

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to update plan. Please try again." };
  }
}

// ─── Create Plan ──────────────────────────────────────────────────────────────

export type CreatePlanInput = {
  productName: string;   // name for the Stripe Product
  displayName: string;   // shown in the admin UI / pricing page
  tier: PlanTier;
  price: number;         // dollars, e.g. 0, 19, 49
  interval: BillingInterval;
  storageGb: number;
  maxEvents: number | null;
  features: string[];
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type CreatePlanResult =
  | { id: string; stripePriceId: string; stripeProductId: string }
  | { error: string };

export async function createStripePlanAction(
  input: CreatePlanInput
): Promise<CreatePlanResult> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    // 1. Create Stripe Product
    const product = await stripe.products.create({
      name: input.productName,
      metadata: { tier: input.tier },
    });

    // 2. Create Stripe Price (recurring for all plans, including $0)
    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(input.price * 100),
      currency: "usd",
      recurring: { interval: input.interval === "MONTH" ? "month" : "year" },
    });

    // 3. Persist to DB
    const plan = await db.stripePlan.create({
      data: {
        name: input.tier,
        displayName: input.displayName,
        tier: input.tier,
        stripePriceId: stripePrice.id,
        stripeProductId: product.id,
        price: input.price,
        currency: "usd",
        interval: input.interval,
        storageBytes: BigInt(Math.round(input.storageGb * 1073741824)),
        maxEvents: input.maxEvents,
        features: input.features,
        isPopular: input.isPopular,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
      select: { id: true, stripePriceId: true, stripeProductId: true },
    });

    // 4. Audit log
    await db.adminActivityLog.create({
      data: {
        adminId: session.user.id,
        action: "CREATED_PLAN",
        targetType: "STRIPE_PLAN",
        targetId: plan.id,
        metadata: {
          planName: input.displayName,
          stripeProductId: product.id,
          stripePriceId: stripePrice.id,
        },
        ipAddress: ip,
      },
    });

    return {
      id: plan.id,
      stripePriceId: plan.stripePriceId,
      stripeProductId: plan.stripeProductId!,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: `Failed to create plan: ${msg}` };
  }
}

// ─── Delete Plan ──────────────────────────────────────────────────────────────

export async function deleteStripePlanAction(
  planId: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    const plan = await db.stripePlan.findUnique({
      where: { id: planId },
      select: { stripePriceId: true, stripeProductId: true, displayName: true },
    });
    if (!plan) return { error: "Plan not found." };

    // Block deletion if any users are actively subscribed to this plan
    if (plan.stripePriceId !== "free") {
      const activeCount = await db.subscription.count({
        where: {
          stripePriceId: plan.stripePriceId,
          status: { in: ["active", "trialing"] },
        },
      });
      if (activeCount > 0) {
        return {
          error: `Cannot delete: ${activeCount} ${activeCount === 1 ? "user is" : "users are"} actively subscribed to this plan.`,
        };
      }
    }

    // Archive in Stripe (skip for the "free" sentinel — it has no real Stripe price)
    if (plan.stripePriceId !== "free") {
      if (plan.stripeProductId) {
        // Unset the default price first — Stripe won't archive a price that is
        // set as its product's default_price.
        await stripe.products.update(plan.stripeProductId, { default_price: "" }).catch(() => {});
      }
      await stripe.prices.update(plan.stripePriceId, { active: false });
      if (plan.stripeProductId) {
        // Best-effort: archive the product too. May fail if other prices are attached — that's fine.
        await stripe.products.update(plan.stripeProductId, { active: false }).catch(() => {});
      }
    }

    await db.stripePlan.delete({ where: { id: planId } });

    await db.adminActivityLog.create({
      data: {
        adminId: session.user.id,
        action: "DELETED_PLAN",
        targetType: "STRIPE_PLAN",
        targetId: planId,
        metadata: { planName: plan.displayName, stripePriceId: plan.stripePriceId },
        ipAddress: ip,
      },
    });

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: `Failed to delete plan: ${msg}` };
  }
}

// ─── Verify Stripe Price ──────────────────────────────────────────────────────

export type VerifyPriceResult =
  | { valid: true; productName: string; amount: number; currency: string; interval: string; active: boolean }
  | { valid: false; error: string };

export async function verifyStripePriceAction(
  priceId: string
): Promise<VerifyPriceResult> {
  try {
    await requireSuperAdmin();
    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    });
    const product = typeof price.product === "string" ? null : price.product;
    const productName = product && "name" in product ? (product as { name: string }).name : "Unknown Product";
    return {
      valid: true,
      productName,
      amount: (price.unit_amount ?? 0) / 100,
      currency: price.currency,
      interval: price.recurring?.interval ?? "one_time",
      active: price.active,
    };
  } catch {
    return { valid: false, error: "Price ID not found in Stripe. Check your dashboard." };
  }
}

// ─── Sync from Stripe ─────────────────────────────────────────────────────────

export type SyncResultItem = {
  planName: string;
  priceId: string;
  priceChanged: boolean;
  oldPrice: string;
  newPrice: string;
  productIdChanged: boolean;
  oldProductId: string | null;
  newProductId: string | null;
  notFound: boolean;
  noStripePrice: boolean; // true when stripePriceId is the "free" sentinel
};

export async function syncPlansFromStripeAction(): Promise<
  { results: SyncResultItem[]; error?: never } | { error: string; results?: never }
> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    // Fetch all active plans — including the FREE sentinel so it appears in results
    const plans = await db.stripePlan.findMany({
      where: { isActive: true },
    });

    // Only call Stripe for plans that have a real price ID (not the "free" sentinel)
    const paidPlans = plans.filter((p) => p.stripePriceId !== "free");
    const stripeResults = await Promise.allSettled(
      paidPlans.map((p) => stripe.prices.retrieve(p.stripePriceId))
    );

    const results: SyncResultItem[] = [];
    const updates: Promise<unknown>[] = [];

    for (const plan of plans) {
      // ── Sentinel: plan has no real Stripe price configured ──
      if (plan.stripePriceId === "free") {
        results.push({
          planName: plan.displayName,
          priceId: plan.stripePriceId,
          priceChanged: false,
          oldPrice: Number(plan.price).toFixed(2),
          newPrice: Number(plan.price).toFixed(2),
          productIdChanged: false,
          oldProductId: plan.stripeProductId,
          newProductId: plan.stripeProductId,
          notFound: false,
          noStripePrice: true,
        });
        continue;
      }

      // ── Paid plan: look up its Stripe result ──
      const paidIndex = paidPlans.findIndex((p) => p.id === plan.id);
      const settled = stripeResults[paidIndex];

      if (settled.status === "rejected") {
        results.push({
          planName: plan.displayName,
          priceId: plan.stripePriceId,
          priceChanged: false,
          oldPrice: Number(plan.price).toFixed(2),
          newPrice: Number(plan.price).toFixed(2),
          productIdChanged: false,
          oldProductId: plan.stripeProductId,
          newProductId: plan.stripeProductId,
          notFound: true,
          noStripePrice: false,
        });
        continue;
      }

      const stripePrice = settled.value;
      const newPrice = (stripePrice.unit_amount ?? 0) / 100;
      const oldPrice = Number(plan.price);
      const newProductId =
        typeof stripePrice.product === "string"
          ? stripePrice.product
          : stripePrice.product?.id ?? null;

      const priceChanged = newPrice !== oldPrice;
      const productIdChanged = newProductId !== plan.stripeProductId;

      if (priceChanged || productIdChanged) {
        updates.push(
          db.stripePlan.update({
            where: { id: plan.id },
            data: {
              price: newPrice,
              stripeProductId: newProductId,
            },
          })
        );
      }

      results.push({
        planName: plan.displayName,
        priceId: plan.stripePriceId,
        priceChanged,
        oldPrice: oldPrice.toFixed(2),
        newPrice: newPrice.toFixed(2),
        productIdChanged,
        oldProductId: plan.stripeProductId,
        newProductId,
        notFound: false,
        noStripePrice: false,
      });
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    await db.adminActivityLog.create({
      data: {
        adminId: session.user.id,
        action: "SYNCED_PLANS_FROM_STRIPE",
        targetType: "STRIPE_PLAN",
        targetId: "all",
        metadata: { syncedCount: plans.length, updatedCount: updates.length },
        ipAddress: ip,
      },
    });

    return { results };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Sync failed. Please try again." };
  }
}
