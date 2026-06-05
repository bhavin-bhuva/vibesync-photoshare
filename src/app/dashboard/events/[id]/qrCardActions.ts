"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { generateQRCode } from "@/lib/qrGenerator";
import { generateQRCard, generateA4Sheet } from "@/lib/qrCardGenerator";

// Lazy-initialized to avoid module-level AWS SDK side effects during SSR prerender
function getS3() {
  return new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

async function fetchLinkCardData(sharedLinkId: string, userId: string) {
  return db.sharedLink.findFirst({
    where: { id: sharedLinkId, event: { userId } },
    select: {
      slug: true,
      accessType: true,
      pinPlain: true,
      event: {
        select: {
          name: true,
          user: {
            select: {
              studioProfile: {
                select: { studioName: true, logoS3Key: true, brandColor: true },
              },
            },
          },
        },
      },
    },
  });
}

function buildCardParams(
  link: NonNullable<Awaited<ReturnType<typeof fetchLinkCardData>>>,
  opts: { showPin: boolean; customMessage?: string },
  baseUrl: string
) {
  const studio = link.event.user.studioProfile;
  return {
    galleryUrl: `${baseUrl}/share/${link.slug}`,
    eventTitle: link.event.name,
    studioName: studio?.studioName ?? "PhotoHouse",
    studioLogoS3Key: studio?.logoS3Key ?? undefined,
    brandColor: studio?.brandColor ?? "#4f46e5",
    showPin: opts.showPin && link.accessType === "PIN",
    pin: link.pinPlain ?? undefined,
    customMessage: opts.customMessage?.trim() || undefined,
  };
}

async function uploadToS3(key: string, buf: Buffer) {
  await getS3().send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: key,
      Body: buf,
      ContentType: "image/png",
    })
  );
}

export async function generateQRCardForDownload(
  sharedLinkId: string,
  opts: { showPin: boolean; customMessage?: string },
  baseUrl: string
): Promise<{ data: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await fetchLinkCardData(sharedLinkId, session.user.id);
  if (!link) return { error: "Link not found." };

  try {
    const params = buildCardParams(link, opts, baseUrl);
    const buf = await generateQRCard(params);
    await uploadToS3(`qr-cards/${sharedLinkId}.png`, buf);
    return { data: buf.toString("base64") };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function generateA4SheetForDownload(
  sharedLinkId: string,
  opts: { showPin: boolean; customMessage?: string },
  baseUrl: string
): Promise<{ data: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await fetchLinkCardData(sharedLinkId, session.user.id);
  if (!link) return { error: "Link not found." };

  try {
    const params = buildCardParams(link, opts, baseUrl);
    const buf = await generateA4Sheet([params, params, params, params, params, params]);
    await uploadToS3(`qr-cards/${sharedLinkId}-a4.png`, buf);
    return { data: buf.toString("base64") };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function generateQROnlyForDownload(
  sharedLinkId: string,
  baseUrl: string
): Promise<{ data: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await db.sharedLink.findFirst({
    where: { id: sharedLinkId, event: { userId: session.user.id } },
    select: { slug: true },
  });
  if (!link) return { error: "Link not found." };

  try {
    const buf = await generateQRCode(`${baseUrl}/share/${link.slug}`, {
      size: 600,
      margin: 2,
    });
    return { data: buf.toString("base64") };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
