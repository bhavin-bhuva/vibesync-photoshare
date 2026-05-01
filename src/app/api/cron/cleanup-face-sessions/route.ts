import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;
const S3_BATCH = 1000; // S3 DeleteObjects max per request

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Find expired sessions ─────────────────────────────────────────────────────
  const now = new Date();
  const expired = await db.faceSearchSession.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, selfieS3Key: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ deleted: 0, s3Deleted: 0, s3Errors: 0 });
  }

  // ── Delete selfie S3 objects in batches of 1000 ───────────────────────────────
  const s3Keys = expired
    .map((s) => s.selfieS3Key)
    .filter((k): k is string => !!k);

  let s3Deleted = 0;
  let s3Errors = 0;

  for (let i = 0; i < s3Keys.length; i += S3_BATCH) {
    const batch = s3Keys.slice(i, i + S3_BATCH);
    try {
      const res = await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: false,
          },
        })
      );
      s3Deleted += res.Deleted?.length ?? 0;
      s3Errors  += res.Errors?.length  ?? 0;

      if (res.Errors?.length) {
        console.error(
          "[cleanup-face-sessions] S3 delete errors:",
          res.Errors.map((e) => `${e.Key}: ${e.Message}`).join(", ")
        );
      }
    } catch (err) {
      console.error("[cleanup-face-sessions] S3 batch delete failed:", err);
      s3Errors += batch.length;
    }
  }

  // ── Delete DB records ─────────────────────────────────────────────────────────
  const { count: dbDeleted } = await db.faceSearchSession.deleteMany({
    where: { id: { in: expired.map((s) => s.id) } },
  });

  console.log(
    `[cleanup-face-sessions] deleted ${dbDeleted} sessions, ` +
    `${s3Deleted} S3 objects removed, ${s3Errors} S3 errors`
  );

  return NextResponse.json({ deleted: dbDeleted, s3Deleted, s3Errors });
}

// Also support GET for Vercel Cron (which sends GET by default)
export async function GET(req: NextRequest) {
  return POST(req);
}
