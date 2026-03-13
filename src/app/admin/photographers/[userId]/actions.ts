"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { getCloudfrontPreviewUrl } from "@/lib/cloudfront";

async function getIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

/**
 * Generates a random temporary password, hashes it, saves it to the user,
 * and returns the plain-text version once for the admin to share.
 */
export async function resetPasswordAction(
  targetUserId: string
): Promise<{ tempPassword?: string; error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ip = await getIp();

    // 12-char base64url password: URL-safe, strong entropy
    const tempPassword = randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await db.$transaction([
      db.user.update({
        where: { id: targetUserId },
        data: { passwordHash },
      }),
      db.adminActivityLog.create({
        data: {
          adminId: session.user.id,
          action: "RESET_PASSWORD",
          targetType: "USER",
          targetId: targetUserId,
          ipAddress: ip,
        },
      }),
    ]);

    return { tempPassword };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to reset password. Please try again." };
  }
}

/**
 * Fetches photos for an event with CloudFront signed URLs — called from
 * the admin detail page when expanding an event row.
 */
export async function getEventPhotosAction(
  eventId: string
): Promise<{ photos?: { id: string; filename: string; url: string | null }[]; error?: string }> {
  try {
    await requireSuperAdmin();

    const photos = await db.photo.findMany({
      where: { eventId },
      select: { id: true, filename: true, s3Key: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      photos: await Promise.all(
        photos.map(async (p) => ({
          id: p.id,
          filename: p.filename,
          url: await getCloudfrontPreviewUrl(p.s3Key, 800),
        }))
      ),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to load photos." };
  }
}
