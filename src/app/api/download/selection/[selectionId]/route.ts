import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyWatermark } from "@/lib/watermark";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable, PassThrough } from "stream";
import type { Readable as S3Readable } from "stream";
import archiver from "archiver";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function safeSegment(str: string): string {
  return str
    .replace(/[^a-z0-9\s\-]/gi, "")
    .trim()
    .replace(/\s+/g, "-") || "files";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ selectionId: string }> }
) {
  const { selectionId } = await params;

  // 1. Authenticate — must be a logged-in photographer
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Load the selection with ownership path: PhotoSelection → SharedLink → Event → User
  const selection = await db.photoSelection.findUnique({
    where: { id: selectionId },
    include: {
      sharedLink: {
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
      },
      selectedPhotos: {
        include: {
          photo: { select: { id: true, s3Key: true, filename: true, groupId: true } },
        },
      },
    },
  });

  if (!selection) {
    return NextResponse.json({ error: "Selection not found" }, { status: 404 });
  }

  // 3. Verify ownership — the event must belong to the authenticated photographer
  const event = selection.sharedLink.event;
  if (event.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bucket = process.env.AWS_S3_BUCKET_NAME!;
  const plan = event.user.subscription?.planTier ?? "FREE";
  const applyWm = plan !== "FREE";
  const sp = event.user.studioProfile;

  const watermarkProfile = applyWm && sp
    ? {
        studioName: sp.studioName,
        logoS3Key: sp.logoS3Key,
        watermarkEnabled: sp.watermarkEnabled,
        watermarkPosition: sp.watermarkPosition,
        watermarkOpacity: sp.watermarkOpacity,
      }
    : null;

  // 4. Build subfolder map — organize by group when the event has any groups
  const groups = await db.photoGroup.findMany({
    where: { eventId: event.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const useSubfolders = groups.length > 0;
  const groupFolderMap = new Map(groups.map((g) => [g.id, safeSegment(g.name)]));

  // 5. Build ZIP filename
  const zipName = `${safeSegment(selection.customerName)}-selections-${safeSegment(event.name)}.zip`;

  // 6. Stream ZIP: archiver → PassThrough → Web ReadableStream
  const passThrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("error", (err) => {
    console.error("[download-selection] archiver error", err);
    passThrough.destroy(err);
  });

  archive.pipe(passThrough);

  // Fetch, watermark, and append each selected photo asynchronously
  (async () => {
    for (const { photo } of selection.selectedPhotos) {
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

        if (watermarkProfile) {
          try {
            buffer = (await applyWatermark(buffer, watermarkProfile)) as Buffer;
          } catch (err) {
            console.error("[download-selection] watermark failed for", photo.s3Key, err);
          }
        }

        const entryName = useSubfolders
          ? `${photo.groupId ? (groupFolderMap.get(photo.groupId) ?? "Ungrouped") : "Ungrouped"}/${photo.filename}`
          : photo.filename;

        archive.append(buffer, { name: entryName });
      } catch (err) {
        console.error("[download-selection] failed to fetch", photo.s3Key, err);
      }
    }
    await archive.finalize();
  })();

  const webStream = Readable.toWeb(passThrough) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-store",
    },
  });
}
