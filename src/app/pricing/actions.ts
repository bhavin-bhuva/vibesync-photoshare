"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function createCheckoutSessionAction(formData: FormData) {
  const priceId = formData.get("priceId") as string;
  if (!priceId) throw new Error("Missing priceId");

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/pricing");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { subscription: true },
  });
  if (!user) redirect("/login");

  // Replace placeholder customer ID with a real Stripe customer
  let stripeCustomerId = user.subscription?.stripeCustomerId ?? "";
  if (!stripeCustomerId || stripeCustomerId.startsWith("cus_pending_") || stripeCustomerId.startsWith("cus_test_")) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    stripeCustomerId = customer.id;
    await db.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        stripeCustomerId,
        planTier: "FREE",
        status: "active",
      },
      update: { stripeCustomerId },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
    client_reference_id: user.id,
    subscription_data: { metadata: { userId: user.id } },
  });

  redirect(checkoutSession.url!);
}
