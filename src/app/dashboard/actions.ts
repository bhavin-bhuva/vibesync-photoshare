"use server";

import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { PlanTier } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";

export type CreateEventState = { error: string } | { success: true } | null;

const EVENT_LIMITS: Record<PlanTier, number | null> = {
  FREE: 3,
  PRO: 25,
  STUDIO: null,
};

export async function createEventAction(
  _prev: CreateEventState,
  formData: FormData
): Promise<CreateEventState> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const name = (formData.get("name") as string)?.trim();
  const date = (formData.get("date") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name) return { error: "Event title is required." };
  if (!date) return { error: "Event date is required." };

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      subscription: true,
      _count: { select: { events: true } },
    },
  });
  if (!user) return { error: "User not found." };

  const plan = user.subscription?.planTier ?? "FREE";
  const limit = EVENT_LIMITS[plan];
  if (limit !== null && user._count.events >= limit) {
    return {
      error: `Your ${plan} plan allows up to ${limit} events. Upgrade to add more.`,
    };
  }

  await db.event.create({
    data: {
      name,
      date: new Date(date),
      description,
      userId: session.user.id,
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<{ error?: string; success?: true }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "Unauthorized." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "INVALID_CURRENT_PASSWORD" };

  if (newPassword.length < 8) return { error: "PASSWORD_TOO_SHORT" };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { success: true };
}
