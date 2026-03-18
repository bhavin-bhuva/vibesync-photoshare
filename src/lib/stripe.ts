import Stripe from "stripe";
import { db } from "@/lib/db";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

// Warn once at startup if no active paid plans are configured in the DB
if (typeof process !== "undefined") {
  db.stripePlan
    .count({ where: { isActive: true, tier: { not: "FREE" } } })
    .then((count) => {
      if (count === 0) {
        console.warn(
          "⚠️  No active Stripe plans found in database. Run db:seed or configure plans in /admin/plans"
        );
      }
    })
    .catch(() => {
      // Silently ignore — DB may not be available during build
    });
}
