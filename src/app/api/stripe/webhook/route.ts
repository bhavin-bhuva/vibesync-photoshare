import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import type { PlanTier } from "@/generated/prisma/client";
import { getStorageLimitForTier } from "@/lib/storage";
import { decrypt } from "@/lib/encryption";

async function tierFromPriceId(priceId: string): Promise<PlanTier> {
  const plan = await db.stripePlan.findFirst({
    where: { stripePriceId: priceId },
    select: { tier: true },
  });
  return plan?.tier ?? "FREE";
}

async function resolveWebhookSecret(): Promise<string | null> {
  const config = await db.stripeWebhookConfig.findFirst({
    where: { isActive: true },
    select: { webhookSecret: true },
  });
  if (config) return decrypt(config.webhookSecret);
  return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = await resolveWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Deduplication: skip events already processed successfully ──────────────
  const duplicate = await db.webhookLog.findFirst({
    where: { stripeEventId: event.id, status: "SUCCESS" },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ received: true });
  }

  // ── Process event ──────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const subscriptionId = session.subscription as string;
        if (!userId || !subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0].price.id;
        const tier = await tierFromPriceId(priceId);
        const storageLimit = await getStorageLimitForTier(tier);

        await db.$transaction([
          db.subscription.update({
            where: { userId },
            data: {
              stripeSubscriptionId: subscriptionId,
              stripePriceId: priceId,
              planTier: tier,
              status: sub.status,
              currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000),
            },
          }),
          db.user.update({
            where: { id: userId },
            data: { storageLimit },
          }),
        ]);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0].price.id;
        const tier = await tierFromPriceId(priceId);
        const storageLimit = await getStorageLimitForTier(tier);
        const existing = await db.subscription.findUnique({
          where: { stripeSubscriptionId: sub.id },
          select: { userId: true },
        });
        if (!existing) break;

        await db.$transaction([
          db.subscription.update({
            where: { stripeSubscriptionId: sub.id },
            data: {
              stripePriceId: priceId,
              planTier: tier,
              status: sub.status,
              currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000),
            },
          }),
          db.user.update({
            where: { id: existing.userId },
            data: { storageLimit },
          }),
        ]);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const existing = await db.subscription.findUnique({
          where: { stripeSubscriptionId: sub.id },
          select: { userId: true },
        });
        if (!existing) break;

        await db.$transaction([
          db.subscription.update({
            where: { stripeSubscriptionId: sub.id },
            data: {
              planTier: "FREE",
              status: "canceled",
              stripeSubscriptionId: null,
              stripePriceId: null,
              currentPeriodEnd: null,
            },
          }),
          db.user.update({
            where: { id: existing.userId },
            data: { storageLimit: await getStorageLimitForTier("FREE") },
          }),
        ]);
        break;
      }
    }

    await db.webhookLog.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        status: "SUCCESS",
        processingMs: Date.now() - startTime,
        receivedAt: new Date(),
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook]", event.type, error);

    await db.webhookLog.create({
      data: {
        stripeEventId: event.id ?? "unknown",
        eventType: event.type ?? "unknown",
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        processingMs: Date.now() - startTime,
        receivedAt: new Date(),
      },
    });

    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
