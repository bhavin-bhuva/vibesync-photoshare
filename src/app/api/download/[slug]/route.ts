import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Readable, PassThrough } from "stream";
import archiver from "archiver";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable as S3Readable } from "stream";
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // ── Verify share cookie ──────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Load event + photos ──────────────────────────────────────────────────
  const link = await db.sharedLink.findUnique({
    where: { slug },
    include: {
      event: {
        include: {
          photos: { orderBy: { createdAt: "desc" } },
          user: {
            include: {
              subscription: true,
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

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (link.expiresAt && new Date() > link.expiresAt) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  // ZIP download is a paid feature
  const plan = link.event.user.subscription?.planTier ?? "FREE";
  if (plan === "FREE") {
    return NextResponse.json({ error: "ZIP download requires a Pro or Studio plan" }, { status: 403 });
  }

  const { event } = link;
  const bucket = process.env.AWS_S3_BUCKET_NAME!;

  // ── Safe filename for the ZIP ────────────────────────────────────────────
  const safeName = event.name
    .replace(/[^a-z0-9\s\-_]/gi, "")
    .trim()
    .replace(/\s+/g, "_") || "photos";

  // ── Stream ZIP via archiver → PassThrough → Web ReadableStream ───────────
  const passThrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("error", (err) => {
    console.error("[download-zip] archiver error", err);
    passThrough.destroy(err);
  });

  archive.pipe(passThrough);

  const sp = event.user.studioProfile;
  const watermark = sp
    ? {
        studioName: sp.studioName,
        logoS3Key: sp.logoS3Key,
        watermarkEnabled: sp.watermarkEnabled,
        watermarkPosition: sp.watermarkPosition,
        watermarkOpacity: sp.watermarkOpacity,
      }
    : null;

  // Fetch, optionally watermark, then append each photo as a buffer
  (async () => {
    for (const photo of event.photos) {
      try {
        const { Body } = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: photo.s3Key })
        );
        if (!Body) continue;

        // Buffer the S3 stream
        const chunks: Buffer[] = [];
        for await (const chunk of Body as S3Readable) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        let buffer: Buffer = Buffer.concat(chunks) as Buffer;

        // Apply watermark for paid plans
        if (watermark) {
          try {
            buffer = await applyWatermark(buffer, watermark) as Buffer;
          } catch (err) {
            console.error("[download-zip] watermark failed for", photo.s3Key, err);
            // keep the original buffer if watermarking fails
          }
        }

        archive.append(buffer, { name: photo.filename });
      } catch (err) {
        console.error("[download-zip] failed to fetch", photo.s3Key, err);
      }
    }
    await archive.finalize();
  })();

  // Convert Node.js PassThrough to a Web ReadableStream
  const webStream = Readable.toWeb(passThrough) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-store",
    },
  });
}
