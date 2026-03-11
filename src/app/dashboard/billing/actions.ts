"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function createPortalSessionAction() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const sub = await db.subscription.findUnique({
    where: { userId: session.user.id },
  });

  // No real Stripe customer yet — send them to upgrade instead
  if (!sub?.stripeCustomerId || sub.stripeCustomerId.startsWith("cus_pending_")) {
    redirect("/pricing");
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.NEXTAUTH_URL}/dashboard/billing`,
  });

  redirect(portalSession.url);
}
