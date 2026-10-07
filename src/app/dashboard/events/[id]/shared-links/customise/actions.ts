"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCloudfrontSignedUrl, getCloudfrontPreviewUrl } from "@/lib/cloudfront";
import {
  THEME_ACCESS,
  ANIMATION_ACCESS,
  type PlanTier,
} from "@/lib/plans";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireOwnership(sharedLinkId: string, userId: string) {
  const link = await db.sharedLink.findFirst({
    where: { id: sharedLinkId, event: { userId } },
    select: { id: true, event: { select: { userId: true } } },
  });
  if (!link) throw new Error("Link not found or access denied.");
  return link;
}

async function getPlanTier(userId: string): Promise<PlanTier> {
  const sub = await db.subscription.findFirst({
    where: { userId },
    select: { planTier: true },
  });
  return (sub?.planTier ?? "FREE") as PlanTier;
}

// ─── updateGalleryCustomisation ───────────────────────────────────────────────

export interface UpdateGalleryData {
  theme?: string;
  welcomeEnabled?: boolean;
  welcomeMessage?: string;
  welcomeHeroPhotoId?: string | null;
  introAnimation?: string;
  showPhotoCount?: boolean;
  showEventDate?: boolean;
  galleryTitle?: string;
  gallerySubtitle?: string;
}

export async function updateGalleryCustomisation(
  sharedLinkId: string,
  data: UpdateGalleryData
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  try {
    await requireOwnership(sharedLinkId, session.user.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const plan = await getPlanTier(session.user.id);

  if (data.theme !== undefined && !THEME_ACCESS[plan].includes(data.theme)) {
    return {
      error: `Theme "${data.theme}" is not available on the ${plan} plan. Upgrade to PRO or STUDIO.`,
    };
  }

  if (
    data.introAnimation !== undefined &&
    !ANIMATION_ACCESS[plan].includes(data.introAnimation)
  ) {
    return {
      error: `Animation "${data.introAnimation}" is not available on the ${plan} plan. Upgrade to PRO or STUDIO.`,
    };
  }

  // Validate welcomeHeroPhotoId belongs to the same event (prevent cross-event access)
  if (data.welcomeHeroPhotoId) {
    const photo = await db.photo.findFirst({
      where: {
        id: data.welcomeHeroPhotoId,
        event: { userId: session.user.id },
      },
      select: { id: true },
    });
    if (!photo) return { error: "Hero photo not found or access denied." };
  }

  await db.sharedLink.update({
    where: { id: sharedLinkId },
    data: {
      ...(data.theme !== undefined && { theme: data.theme }),
      ...(data.welcomeEnabled !== undefined && { welcomeEnabled: data.welcomeEnabled }),
      ...(data.welcomeMessage !== undefined && { welcomeMessage: data.welcomeMessage }),
      ...(data.welcomeHeroPhotoId !== undefined && { welcomeHeroPhotoId: data.welcomeHeroPhotoId }),
      ...(data.introAnimation !== undefined && { introAnimation: data.introAnimation }),
      ...(data.showPhotoCount !== undefined && { showPhotoCount: data.showPhotoCount }),
      ...(data.showEventDate !== undefined && { showEventDate: data.showEventDate }),
      ...(data.galleryTitle !== undefined && { galleryTitle: data.galleryTitle }),
      ...(data.gallerySubtitle !== undefined && { gallerySubtitle: data.gallerySubtitle }),
      // Invalidate cached QR card — will regenerate with new settings on next download
      qrCardS3Key: null,
    },
  });

  revalidatePath(`/dashboard/events`);
  return {};
}

// ─── getGalleryCustomisation ──────────────────────────────────────────────────

export interface GalleryCustomisationResult {
  link: {
    id: string;
    slug: string;
    theme: string;
    welcomeEnabled: boolean;
    welcomeMessage: string | null;
    welcomeHeroPhotoId: string | null;
    welcomeHeroThumbnailUrl: string | null;
    introAnimation: string;
    showPhotoCount: boolean;
    showEventDate: boolean;
    galleryTitle: string | null;
    gallerySubtitle: string | null;
    qrCardS3Key: string | null;
  };
  availableThemes: string[];
  availableAnimations: string[];
  planTier: string;
}

export async function getGalleryCustomisation(
  sharedLinkId: string
): Promise<GalleryCustomisationResult | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await db.sharedLink.findFirst({
    where: { id: sharedLinkId, event: { userId: session.user.id } },
    select: {
      id: true,
      slug: true,
      theme: true,
      welcomeEnabled: true,
      welcomeMessage: true,
      welcomeHeroPhotoId: true,
      welcomeHeroPhoto: {
        select: { s3Key: true, thumbS3Key: true },
      },
      introAnimation: true,
      showPhotoCount: true,
      showEventDate: true,
      galleryTitle: true,
      gallerySubtitle: true,
      qrCardS3Key: true,
    },
  });

  if (!link) return { error: "Link not found or access denied." };

  const plan = await getPlanTier(session.user.id);

  let welcomeHeroThumbnailUrl: string | null = null;
  if (link.welcomeHeroPhoto) {
    const { s3Key, thumbS3Key } = link.welcomeHeroPhoto;
    welcomeHeroThumbnailUrl = thumbS3Key
      ? getCloudfrontSignedUrl(thumbS3Key)
      : getCloudfrontPreviewUrl(s3Key, 800);
  }

  return {
    link: {
      id: link.id,
      slug: link.slug,
      theme: link.theme,
      welcomeEnabled: link.welcomeEnabled,
      welcomeMessage: link.welcomeMessage,
      welcomeHeroPhotoId: link.welcomeHeroPhotoId,
      welcomeHeroThumbnailUrl,
      introAnimation: link.introAnimation,
      showPhotoCount: link.showPhotoCount,
      showEventDate: link.showEventDate,
      galleryTitle: link.galleryTitle,
      gallerySubtitle: link.gallerySubtitle,
      qrCardS3Key: link.qrCardS3Key,
    },
    availableThemes: THEME_ACCESS[plan],
    availableAnimations: ANIMATION_ACCESS[plan],
    planTier: plan,
  };
}

// ─── previewGalleryExperience ─────────────────────────────────────────────────

export async function previewGalleryExperience(
  sharedLinkId: string
): Promise<{ previewUrl: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await db.sharedLink.findFirst({
    where: { id: sharedLinkId, event: { userId: session.user.id } },
    select: { slug: true },
  });
  if (!link) return { error: "Link not found or access denied." };

  // Purge expired tokens for this link (best-effort cleanup)
  await db.previewToken.deleteMany({
    where: { sharedLinkId, expiresAt: { lt: new Date() } },
  }).catch(() => null);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.previewToken.create({
    data: { token, sharedLinkId, expiresAt },
  });

  const previewUrl = `/share/${link.slug}/preview?token=${token}`;
  return { previewUrl };
}
