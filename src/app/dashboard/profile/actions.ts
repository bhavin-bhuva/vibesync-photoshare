"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export type ActionResult = { error: string } | { success: true };

export async function updatePersonalInfoAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required." };

  await db.user.update({
    where: { id: session.user.id },
    data: { name },
  });

  revalidatePath("/dashboard/profile");
  return { success: true };
}

export async function updateStudioProfileAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const studioName = (formData.get("studioName") as string)?.trim();
  if (!studioName) return { error: "Studio name is required." };

  const rawOpacity = parseInt(formData.get("watermarkOpacity") as string, 10);

  const data = {
    studioName,
    tagline:           (formData.get("tagline")    as string)?.trim() || null,
    website:           (formData.get("website")    as string)?.trim() || null,
    phone:             (formData.get("phone")      as string)?.trim() || null,
    address:           (formData.get("address")    as string)?.trim() || null,
    brandColor:        (formData.get("brandColor") as string)?.trim() || null,
    watermarkEnabled:  formData.get("watermarkEnabled") === "true",
    watermarkPosition: ((formData.get("watermarkPosition") as string) || "BOTTOM_RIGHT") as
      "BOTTOM_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_CENTER",
    watermarkOpacity:  isNaN(rawOpacity) ? 55 : Math.min(80, Math.max(10, rawOpacity)),
  };

  await db.studioProfile.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });

  revalidatePath("/dashboard/profile");
  return { success: true };
}

export async function updateWatermarkSettingsAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const rawOpacity = parseInt(formData.get("watermarkOpacity") as string, 10);

  const data = {
    watermarkEnabled:  formData.get("watermarkEnabled") === "true",
    watermarkPosition: ((formData.get("watermarkPosition") as string) || "BOTTOM_RIGHT") as
      "BOTTOM_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_CENTER",
    watermarkOpacity:  isNaN(rawOpacity) ? 55 : Math.min(80, Math.max(10, rawOpacity)),
  };

  await db.studioProfile.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, studioName: "", ...data },
    update: data,
  });

  revalidatePath("/dashboard/profile");
  return { success: true };
}

export async function saveLogoKeyAction(key: string): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  await db.studioProfile.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, studioName: "", logoS3Key: key },
    update: { logoS3Key: key },
  });

  revalidatePath("/dashboard/profile");
  return { success: true };
}
