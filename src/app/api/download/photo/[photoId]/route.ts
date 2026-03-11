import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import { db } from "@/lib/db";
import { verifyShareToken } from "@/lib/share-token";
import { applyWatermark } from "@/lib/watermark";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const { photoId } = await params;
  const slug = req.nextUrl.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  // ── Verify share cookie ────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Load photo + photographer profile ──────────────────────────────────────
  const photo = await db.photo.findFirst({
    where: {
      id: photoId,
      event: { sharedLinks: { some: { slug } } },
    },
    select: {
      s3Key: true,
      filename: true,
      event: {
        select: {
          sharedLinks: {
            where: { slug },
            select: { expiresAt: true },
          },
          user: {
            select: {
              subscription: { select: { planTier: true } },
              studioProfile: {
                select: {
                  studioName: true,
                  logoS3Key: true,
                  watermarkEnabled: true,
                  watermarkPosition: true,
                  watermarkOpacity: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // Check link expiry
  const link = photo.event.sharedLinks[0];
  if (link?.expiresAt && new Date() > link.expiresAt) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  // ── Fetch photo from S3 ────────────────────────────────────────────────────
  const { Body } = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: photo.s3Key,
    })
  );

  if (!Body) {
    return NextResponse.json({ error: "Photo unavailable" }, { status: 502 });
  }

  let buffer = await streamToBuffer(Body as Readable);

  // ── Apply watermark for PRO / STUDIO plans ─────────────────────────────────
  const plan = photo.event.user.subscription?.planTier ?? "FREE";
  const studioProfile = photo.event.user.studioProfile;

  if (plan !== "FREE" && studioProfile) {
    try {
      buffer = await applyWatermark(buffer, {
        studioName: studioProfile.studioName,
        logoS3Key: studioProfile.logoS3Key,
        watermarkEnabled: studioProfile.watermarkEnabled,
        watermarkPosition: studioProfile.watermarkPosition,
        watermarkOpacity: studioProfile.watermarkOpacity,
      });
    } catch (err) {
      // Watermark failure should not block the download
      console.error("[download-photo] watermark error", err);
    }
  }

  // ── Respond ────────────────────────────────────────────────────────────────
  const safeFilename = encodeURIComponent(photo.filename);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
