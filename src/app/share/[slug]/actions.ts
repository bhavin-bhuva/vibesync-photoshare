"use server";

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { signShareToken, verifyShareToken } from "@/lib/share-token";
import { getPresignedDownloadUrl } from "@/lib/s3";

export async function verifySharedLinkAction(
  slug: string,
  password: string
): Promise<{ error?: string }> {
  const link = await db.sharedLink.findUnique({
    where: { slug },
    select: { passwordHash: true, expiresAt: true },
  });

  if (!link) return { error: "Link not found." };

  if (link.expiresAt && new Date() > link.expiresAt)
    return { error: "This link has expired." };

  const valid = await bcrypt.compare(password, link.passwordHash);
  if (!valid) return { error: "Incorrect password." };

  const token = signShareToken(slug);
  const cookieStore = await cookies();
  cookieStore.set(`share_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60, // 24 hours
    path: "/",
  });

  return {};
}

/**
 * Generates a short-lived S3 presigned GET URL for a photo download.
 * Requires a valid share-access cookie for the given slug, and verifies
 * that the requested photo actually belongs to the linked event.
 */
export async function getPhotoDownloadUrl(
  slug: string,
  photoId: string
): Promise<{ url?: string; error?: string }> {
  // 1. Verify the visitor has passed the password gate
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) {
    return { error: "Access denied." };
  }

  // 2. Confirm the photo belongs to an event reachable via this slug
  const photo = await db.photo.findFirst({
    where: {
      id: photoId,
      event: { sharedLinks: { some: { slug } } },
    },
    select: { s3Key: true, filename: true },
  });
  if (!photo) return { error: "Photo not found." };

  // 3. Generate the presigned download URL
  const url = await getPresignedDownloadUrl(photo.s3Key, photo.filename);
  return { url };
}
