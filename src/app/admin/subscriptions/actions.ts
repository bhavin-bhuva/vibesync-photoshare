"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { PlanTier } from "@/generated/prisma/client";
import { getPlanStorageLimits } from "@/lib/platform-settings";

async function getIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

// ─── Search photographer by email ─────────────────────────────────────────────

export type PhotographerSearchResult = {
  id: string;
  name: string | null;
  email: string;
  planTier: "FREE" | "PRO" | "STUDIO";
  hasSubscription: boolean;
};

export async function searchPhotographerByEmailAction(
  email: string
): Promise<{ result?: PhotographerSearchResult; error?: string }> {
  try {
    await requireSuperAdmin();

    const user = await db.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" }, role: "PHOTOGRAPHER" },
      select: {
        id: true,
        name: true,
        email: true,
        subscription: { select: { planTier: true } },
      },
    });

    if (!user) return { error: "No photographer found with this email address." };

    return {
      result: {
        id:              user.id,
        name:            user.name,
        email:           user.email,
        planTier:        (user.subscription?.planTier ?? "FREE") as "FREE" | "PRO" | "STUDIO",
        hasSubscription: !!user.subscription,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Search failed. Please try again." };
  }
}

// ─── Override plan (manual, bypasses Stripe) ──────────────────────────────────

export async function overridePlanAction(
  targetUserId: string,
  newPlan: PlanTier,
  note: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip      = await getIp();
    const storageLimits = await getPlanStorageLimits();

    await db.$transaction([
      db.subscription.update({
        where: { userId: targetUserId },
        data:  { planTier: newPlan },
      }),
      db.user.update({
        where: { id: targetUserId },
        data:  { storageLimit: storageLimits[newPlan] },
      }),
      db.adminActivityLog.create({
        data: {
          adminId:    session.user.id,
          action:     "CHANGED_PLAN",
          targetType: "USER",
          targetId:   targetUserId,
          metadata:   { newPlan, note: note.trim() || null, source: "manual_override" },
          ipAddress:  ip,
        },
      }),
    ]);

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to override plan. Please try again." };
  }
}
