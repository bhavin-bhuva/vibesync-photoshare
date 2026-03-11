import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import type { PlanTier } from "@/generated/prisma/client";
import { PLAN_STORAGE_LIMITS } from "@/lib/storage";

function tierFromPriceId(priceId: string): PlanTier {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId === process.env.STRIPE_STUDIO_PRICE_ID) return "STUDIO";
  return "FREE";
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const subscriptionId = session.subscription as string;
        if (!userId || !subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0].price.id;

        const tier = tierFromPriceId(priceId);
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
            data: { storageLimit: PLAN_STORAGE_LIMITS[tier] },
          }),
        ]);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0].price.id;
        const tier = tierFromPriceId(priceId);
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
            data: { storageLimit: PLAN_STORAGE_LIMITS[tier] },
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
            data: { storageLimit: PLAN_STORAGE_LIMITS["FREE"] },
          }),
        ]);
        break;
      }
    }
  } catch (err) {
    console.error("[stripe-webhook]", event.type, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
