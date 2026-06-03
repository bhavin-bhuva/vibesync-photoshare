"use server";

import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { CullStatus, Prisma } from "@/generated/prisma/client";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireEventOwner(
  eventId: string
): Promise<{ error: string } | { userId: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true, userId: true },
  });
  if (!event) return { error: "Event not found." };
  return { userId: event.userId };
}

// ─── 1. updateCullStatus ──────────────────────────────────────────────────────

export async function updateCullStatus(
  photoId: string,
  status: CullStatus
): Promise<{
  error?: string;
  score?: {
    photoId: string;
    cullStatus: CullStatus;
    photographerOverride: boolean;
    autoSuggestion: string | null;
    autoSuggestionReason: string | null;
  };
}> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const photo = await db.photo.findFirst({
    where: { id: photoId, event: { userId: session.user.id } },
    select: { id: true, eventId: true },
  });
  if (!photo) return { error: "Photo not found." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score = await (db.photoCullScore.upsert as any)({
    where: { photoId },
    create: {
      photoId,
      eventId: photo.eventId,
      cullStatus: status,
      photographerOverride: true,
    },
    update: {
      cullStatus: status,
      photographerOverride: true,
    },
    select: {
      photoId: true,
      cullStatus: true,
      photographerOverride: true,
      autoSuggestion: true,
      autoSuggestionReason: true,
    },
  });

  return { score };
}

// ─── 2. bulkUpdateCullStatus ──────────────────────────────────────────────────

type BulkFilter = "all_keep" | "all_reject" | "suggestion_keep" | "suggestion_reject";

export async function bulkUpdateCullStatus(
  eventId: string,
  filter: BulkFilter,
  status: CullStatus
): Promise<{ error?: string; updated?: number }> {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  let where: Prisma.PhotoCullScoreWhereInput;
  switch (filter) {
    case "all_keep":
      where = { eventId, cullStatus: "KEEP", photographerOverride: true };
      break;
    case "all_reject":
      where = { eventId, cullStatus: "REJECT", photographerOverride: true };
      break;
    case "suggestion_keep":
      where = { eventId, autoSuggestion: "KEEP", photographerOverride: false };
      break;
    case "suggestion_reject":
      where = { eventId, autoSuggestion: "REJECT", photographerOverride: false };
      break;
  }

  const result = await db.photoCullScore.updateMany({
    where,
    data: { cullStatus: status, photographerOverride: true },
  });

  return { updated: result.count };
}

// ─── 3. acceptBurstBest ───────────────────────────────────────────────────────

export async function acceptBurstBest(
  clusterId: string
): Promise<{ error?: string; kept?: number; rejected?: number }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const cluster = await db.burstCluster.findUnique({
    where: { id: clusterId },
    select: { eventId: true, event: { select: { userId: true } } },
  });
  if (!cluster || cluster.event.userId !== session.user.id) {
    return { error: "Cluster not found." };
  }

  const [keepResult, rejectResult] = await Promise.all([
    db.photoCullScore.updateMany({
      where: { burstClusterId: clusterId, isBestInBurst: true },
      data: { cullStatus: "KEEP", photographerOverride: true },
    }),
    db.photoCullScore.updateMany({
      where: { burstClusterId: clusterId, isBestInBurst: false },
      data: { cullStatus: "REJECT", photographerOverride: true },
    }),
  ]);

  return { kept: keepResult.count, rejected: rejectResult.count };
}

// ─── 4. getCullingStats ───────────────────────────────────────────────────────

export async function getCullingStats(eventId: string): Promise<{
  error?: string;
  stats?: {
    total: number;
    keep: number;
    reject: number;
    review: number;
    pending: number;
    byReason: {
      eyesClosed: number;
      blurry: number;
      duplicate: number;
      lowAesthetic: number;
    };
    burstClusters: number;
    lastCulledAt: string | null;
    jobStatus: string | null;
    jobProgress: { processed: number; total: number } | null;
  };
}> {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  const [
    totalPhotos,
    overrideCounts,
    suggestionCounts,
    reasonCounts,
    burstClusters,
    latestJob,
    event,
  ] = await Promise.all([
    db.photo.count({ where: { eventId } }),
    // Photographer-locked decisions
    db.photoCullScore.groupBy({
      by: ["cullStatus"],
      where: { eventId, photographerOverride: true },
      _count: { _all: true },
    }),
    // AI suggestions not yet overridden
    db.photoCullScore.groupBy({
      by: ["autoSuggestion"],
      where: { eventId, photographerOverride: false, autoSuggestion: { not: null } },
      _count: { _all: true },
    }),
    // Reason breakdown
    db.photoCullScore.groupBy({
      by: ["autoSuggestionReason"],
      where: { eventId, autoSuggestionReason: { not: null } },
      _count: { _all: true },
    }),
    db.burstCluster.count({ where: { eventId } }),
    db.cullingJob.findFirst({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      select: { status: true, processedPhotos: true, totalPhotos: true },
    }),
    db.event.findFirst({
      where: { id: eventId },
      select: { lastCulledAt: true },
    }),
  ]);

  function countOverride(s: CullStatus) {
    return (
      overrideCounts.find((r) => r.cullStatus === s)?._count._all ?? 0
    );
  }
  function countSuggestion(s: string) {
    return (
      suggestionCounts.find((r) => r.autoSuggestion === s)?._count._all ?? 0
    );
  }
  function countReason(reason: string) {
    return (
      reasonCounts.find((r) => r.autoSuggestionReason === reason)?._count._all ?? 0
    );
  }

  const keep   = countOverride("KEEP")   + countSuggestion("KEEP");
  const reject = countOverride("REJECT") + countSuggestion("REJECT");
  const review = countOverride("UNSURE") + countSuggestion("REVIEW");
  const pending = Math.max(0, totalPhotos - keep - reject - review);

  return {
    stats: {
      total: totalPhotos,
      keep,
      reject,
      review,
      pending,
      byReason: {
        eyesClosed:   countReason("Eyes closed"),
        blurry:       countReason("Out of focus") + countReason("Slightly soft"),
        duplicate:    countReason("Burst duplicate"),
        lowAesthetic: countReason("Low aesthetic"),
      },
      burstClusters,
      lastCulledAt: event?.lastCulledAt?.toISOString() ?? null,
      jobStatus: latestJob?.status ?? null,
      jobProgress:
        latestJob &&
        (latestJob.status === "RUNNING" || latestJob.status === "PENDING")
          ? { processed: latestJob.processedPhotos, total: latestJob.totalPhotos }
          : null,
    },
  };
}

// ─── 5. exportCullResults ─────────────────────────────────────────────────────

export async function exportCullResults(
  eventId: string,
  format: "json" | "csv"
): Promise<{ error?: string; data?: string; filename?: string }> {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { name: true },
  });

  const scores = await db.photoCullScore.findMany({
    where: { eventId },
    orderBy: { processedAt: "asc" },
    select: {
      cullStatus: true,
      autoSuggestion: true,
      autoSuggestionReason: true,
      sharpnessScore: true,
      blinkProbability: true,
      aestheticScore: true,
      photographerOverride: true,
      photo: { select: { filename: true } },
    },
  });

  const slug = (event?.name ?? eventId).replace(/[^a-z0-9]/gi, "_").toLowerCase();

  if (format === "json") {
    const data = JSON.stringify(
      scores.map((s) => ({
        filename: s.photo.filename,
        sharpness: s.sharpnessScore,
        blink_probability: s.blinkProbability,
        aesthetic_score: s.aestheticScore,
        auto_suggestion: s.autoSuggestion,
        photographer_decision: s.photographerOverride ? s.cullStatus : null,
        reason: s.autoSuggestionReason,
      })),
      null,
      2
    );
    return { data, filename: `cull_${slug}.json` };
  }

  // CSV
  function csvCell(v: unknown): string {
    if (v == null) return "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }

  const header =
    "filename,sharpness,blink_prob,aesthetic,auto_suggestion,photographer_decision,reason";
  const rows = scores.map((s) =>
    [
      s.photo.filename,
      s.sharpnessScore?.toFixed(4) ?? "",
      s.blinkProbability?.toFixed(4) ?? "",
      s.aestheticScore?.toFixed(2) ?? "",
      s.autoSuggestion ?? "",
      s.photographerOverride ? s.cullStatus : "",
      s.autoSuggestionReason ?? "",
    ]
      .map(csvCell)
      .join(",")
  );

  return {
    data: [header, ...rows].join("\n"),
    filename: `cull_${slug}.csv`,
  };
}

// ─── 6. resetCulling ──────────────────────────────────────────────────────────

export async function resetCulling(
  eventId: string
): Promise<{ error?: string; reset?: number }> {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  const result = await db.photoCullScore.updateMany({
    where: { eventId },
    data: { cullStatus: "PENDING", photographerOverride: false },
  });

  return { reset: result.count };
}
