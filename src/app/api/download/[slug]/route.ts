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

function safeSegment(s: string): string {
  return s.replace(/[^a-z0-9\s\-]/gi, "").trim().replace(/\s+/g, "-") || "photos";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const groupId = req.nextUrl.searchParams.get("group");

  // ── Verify share cookie ──────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Load link + event (photos queried separately below) ─────────────────
  const link = await db.sharedLink.findUnique({
    where: { slug },
    include: {
      event: {
        include: {
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

  const plan = link.event.user.subscription?.planTier ?? "FREE";
  if (plan === "FREE") {
    return NextResponse.json({ error: "ZIP download requires a Pro or Studio plan" }, { status: 403 });
  }

  const { event } = link;
  const bucket = process.env.AWS_S3_BUCKET_NAME!;

  // ── Resolve group name when filtering by group ───────────────────────────
  let groupName: string | null = null;
  if (groupId) {
    const group = await db.photoGroup.findFirst({
      where: { id: groupId, eventId: event.id },
      select: { name: true },
    });
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    groupName = group.name;
  }

  // ── Fetch photos ─────────────────────────────────────────────────────────
  const photos = await db.photo.findMany({
    where: {
      eventId: event.id,
      ...(groupId ? { groupId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, s3Key: true, filename: true, groupId: true },
  });

  // ── Build subfolder map for "all photos" downloads ───────────────────────
  // Only relevant when downloading everything (no group filter).
  // If the event has any groups, photos are placed in named subfolders;
  // ungrouped photos go into an "Ungrouped" folder.
  let groupFolderMap = new Map<string, string>();
  let useSubfolders = false;
  if (!groupId) {
    const groups = await db.photoGroup.findMany({
      where: { eventId: event.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });
    if (groups.length > 0) {
      useSubfolders = true;
      groupFolderMap = new Map(groups.map((g) => [g.id, safeSegment(g.name)]));
    }
  }

  // ── ZIP filename ─────────────────────────────────────────────────────────
  const zipName = groupName
    ? `${safeSegment(event.name)}-${safeSegment(groupName)}`
    : safeSegment(event.name);

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

  (async () => {
    for (const photo of photos) {
      try {
        const { Body } = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: photo.s3Key })
        );
        if (!Body) continue;

        const chunks: Buffer[] = [];
        for await (const chunk of Body as S3Readable) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        let buffer: Buffer = Buffer.concat(chunks) as Buffer;

        if (watermark) {
          try {
            buffer = (await applyWatermark(buffer, watermark)) as Buffer;
          } catch (err) {
            console.error("[download-zip] watermark failed for", photo.s3Key, err);
          }
        }

        // Flat structure for single-group downloads; subfolders for all-photos
        const entryName = useSubfolders
          ? `${photo.groupId ? (groupFolderMap.get(photo.groupId) ?? "Ungrouped") : "Ungrouped"}/${photo.filename}`
          : photo.filename;

        archive.append(buffer, { name: entryName });
      } catch (err) {
        console.error("[download-zip] failed to fetch", photo.s3Key, err);
      }
    }
    await archive.finalize();
  })();

  const webStream = Readable.toWeb(passThrough) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}.zip"`,
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-store",
    },
  });
}
