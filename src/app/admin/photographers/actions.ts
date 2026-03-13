"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { PlanTier } from "@/generated/prisma/client";
import { getPlanStorageLimits } from "@/lib/platform-settings";

async function getIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    null
  );
}

export async function changePlanAction(
  targetUserId: string,
  newPlan: PlanTier
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();
    const storageLimits = await getPlanStorageLimits();

    await db.$transaction([
      db.subscription.update({
        where: { userId: targetUserId },
        data: { planTier: newPlan },
      }),
      db.user.update({
        where: { id: targetUserId },
        data: { storageLimit: storageLimits[newPlan] },
      }),
      db.adminActivityLog.create({
        data: {
          adminId: session.user.id,
          action: "CHANGED_PLAN",
          targetType: "USER",
          targetId: targetUserId,
          metadata: { newPlan },
          ipAddress: ip,
        },
      }),
    ]);

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to change plan. Please try again." };
  }
}

export async function suspendAccountAction(
  targetUserId: string,
  reason: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    await db.$transaction([
      db.user.update({
        where: { id: targetUserId },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedReason: reason.trim() || null,
        },
      }),
      db.adminActivityLog.create({
        data: {
          adminId: session.user.id,
          action: "SUSPENDED_USER",
          targetType: "USER",
          targetId: targetUserId,
          metadata: { reason: reason.trim() || null },
          ipAddress: ip,
        },
      }),
    ]);

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to suspend account. Please try again." };
  }
}

export async function unsuspendAccountAction(
  targetUserId: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    await db.$transaction([
      db.user.update({
        where: { id: targetUserId },
        data: {
          isSuspended: false,
          suspendedAt: null,
          suspendedReason: null,
        },
      }),
      db.adminActivityLog.create({
        data: {
          adminId: session.user.id,
          action: "UNSUSPENDED_USER",
          targetType: "USER",
          targetId: targetUserId,
          ipAddress: ip,
        },
      }),
    ]);

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to unsuspend account. Please try again." };
  }
}

export async function deleteAccountAction(
  targetUserId: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    // Log before deletion so the record exists
    await db.adminActivityLog.create({
      data: {
        adminId: session.user.id,
        action: "DELETED_USER",
        targetType: "USER",
        targetId: targetUserId,
        ipAddress: ip,
      },
    });

    await db.user.delete({ where: { id: targetUserId } });

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to delete account. Please try again." };
  }
}
