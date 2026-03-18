import { db } from "@/lib/db";
import { PlansClient, type PlanRow } from "./PlansClient";

export default async function PlansPage() {
  const plans = await db.stripePlan.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // Serialise BigInt and Decimal for the client
  const rows: PlanRow[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    tier: p.tier,
    stripePriceId: p.stripePriceId,
    stripeProductId: p.stripeProductId,
    price: p.price.toString(),
    currency: p.currency,
    interval: p.interval,
    storageBytes: p.storageBytes.toString(),
    maxEvents: p.maxEvents,
    features: p.features as string[],
    isActive: p.isActive,
    isPopular: p.isPopular,
    sortOrder: p.sortOrder,
  }));

  return <PlansClient plans={rows} />;
}
