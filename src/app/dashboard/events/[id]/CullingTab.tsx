"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  triggerManualCulling,
  getCullingProgress,
  setCullDecision,
  bulkApplyAutoSuggestions,
} from "./actions";
import { CullingSettingsModal, type CullingSettings } from "./CullingSettingsModal";
import { IconCheck, IconX, IconAI, IconSearch, IconTarget, IconEye, IconStar, ICON_SM, ICON_MD, ICON_COLOR } from "@/components/ui/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CullPhotoData = {
  id: string;
  thumbnailUrl: string;
  cullStatus: "PENDING" | "KEEP" | "REJECT" | "UNSURE";
  autoSuggestion: "KEEP" | "REJECT" | "REVIEW" | null;
  autoSuggestionReason: string | null;
  sharpnessScore: number | null;
  blinkProbability: number | null;
  aestheticScore: number | null;
  facesDetected: number;
  burstClusterId: string | null;
  isBestInBurst: boolean;
  photographerOverride: boolean;
};

export type BurstClusterData = {
  id: string;
  photoCount: number;
  bestPhotoId: string | null;
  photos: Array<{ id: string; thumbnailUrl: string; isBestInBurst: boolean }>;
};

export type CullingJobData = {
  id: string;
  status: string;
  totalPhotos: number;
  processedPhotos: number;
  createdAt: string;
  completedAt: string | null;
} | null;

export type CullingTabProps = {
  eventId: string;
  photos: CullPhotoData[];
  burstClusters: BurstClusterData[];
  initialJob: CullingJobData;
  plan: "FREE" | "PRO" | "STUDIO";
  cullingSettings: CullingSettings;
};

type FilterType =
  | "all"
  | "keep"
  | "review"
  | "reject"
  | "pending"
  | "blinks"
  | "duplicates"
  | "soft_focus";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveStatus(
  photo: CullPhotoData
): "KEEP" | "REJECT" | "REVIEW" | "PENDING" {
  if (photo.photographerOverride) {
    if (photo.cullStatus === "KEEP") return "KEEP";
    if (photo.cullStatus === "REJECT") return "REJECT";
    return "REVIEW";
  }
  if (photo.autoSuggestion === "KEEP") return "KEEP";
  if (photo.autoSuggestion === "REJECT") return "REJECT";
  if (photo.autoSuggestion === "REVIEW") return "REVIEW";
  return "PENDING";
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.toISOString();
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
      <div
        className={`h-1.5 rounded-full ${color}`}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

type LightboxProps = {
  photo: CullPhotoData;
  idxDisplay: string;
  onClose: () => void;
  onNavigate: (dir: -1 | 1) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onDecision: (photoId: string, s: "KEEP" | "REJECT" | "UNSURE") => Promise<void>;
};

function CullLightbox({
  photo,
  idxDisplay,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
  onDecision,
}: LightboxProps) {
  const [deciding, setDeciding] = useState(false);
  const status = effectiveStatus(photo);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      if (deciding) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onNavigate(-1);
      else if (e.key === "ArrowRight") onNavigate(1);
      else if (e.key === "k" || e.key === "K") await go("KEEP");
      else if (e.key === "u" || e.key === "U") await go("UNSURE");
      else if (e.key === "r" || e.key === "R") await go("REJECT");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deciding, photo.id, onClose, onNavigate]);

  async function go(s: "KEEP" | "REJECT" | "UNSURE") {
    setDeciding(true);
    await onDecision(photo.id, s);
    setDeciding(false);
  }

  const eyeLabel =
    photo.blinkProbability == null
      ? null
      : photo.blinkProbability < 0.15
      ? "Eyes Open"
      : photo.blinkProbability < 0.45
      ? "Possibly Blinking"
      : "Eyes Closed";

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── Image area ── */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {hasPrev && (
          <button
            onClick={() => onNavigate(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(1)}
            className="absolute right-[289px] top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.thumbnailUrl} alt="" className="max-h-full max-w-full object-contain" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          {idxDisplay}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Photo Analysis</h3>

        {/* Current status */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Status:</span>
          {status === "KEEP" && <span className="flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white"><IconCheck size={ICON_SM} aria-hidden="true" />Keep</span>}
          {status === "REJECT" && <span className="flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white"><IconX size={ICON_SM} aria-hidden="true" />Reject</span>}
          {status === "REVIEW" && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">? Review</span>}
          {status === "PENDING" && <span className="rounded-full bg-zinc-600 px-2 py-0.5 text-xs font-bold text-white">Pending</span>}
          {photo.photographerOverride && (
            <span className="text-[10px] text-zinc-500">your decision</span>
          )}
        </div>

        {/* Scores */}
        <div className="space-y-3">
          {photo.sharpnessScore != null && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-zinc-400">Sharpness</span>
                <span className="tabular-nums text-zinc-200">{photo.sharpnessScore.toFixed(2)}</span>
              </div>
              <ScoreBar value={photo.sharpnessScore} color="bg-sky-400" />
            </div>
          )}
          {photo.blinkProbability != null && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-zinc-400">Blink Risk</span>
                <span className="tabular-nums text-zinc-200">
                  {photo.blinkProbability.toFixed(2)}
                  {eyeLabel && <span className="ml-1 text-zinc-500 text-[10px]">{eyeLabel}</span>}
                </span>
              </div>
              <ScoreBar value={photo.blinkProbability} color="bg-orange-400" />
            </div>
          )}
          {photo.aestheticScore != null && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-zinc-400">Aesthetic</span>
                <span className="tabular-nums text-zinc-200">{photo.aestheticScore.toFixed(1)}/10</span>
              </div>
              <ScoreBar value={photo.aestheticScore} max={10} color="bg-purple-400" />
            </div>
          )}
          {photo.facesDetected > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Faces</span>
              <span className="text-zinc-200">{photo.facesDetected}</span>
            </div>
          )}
          {photo.isBestInBurst && (
            <p className="flex items-center gap-1 text-xs text-amber-400"><IconStar size={ICON_SM} aria-hidden="true" />Best in burst</p>
          )}
        </div>

        {/* AI suggestion */}
        {photo.autoSuggestion && !photo.photographerOverride && (
          <div className="rounded-lg bg-zinc-800 p-3">
            <p className="mb-1.5 text-xs font-medium text-zinc-300">AI Suggests</p>
            <div className="flex items-center gap-2">
              {photo.autoSuggestion === "KEEP" && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400"><IconCheck size={ICON_SM} aria-hidden="true" />Keep</span>}
              {photo.autoSuggestion === "REJECT" && <span className="flex items-center gap-1 text-xs font-semibold text-red-400"><IconX size={ICON_SM} aria-hidden="true" />Reject</span>}
              {photo.autoSuggestion === "REVIEW" && <span className="text-xs font-semibold text-orange-400">? Review</span>}
              {photo.autoSuggestionReason && (
                <span className="text-xs text-zinc-400">"{photo.autoSuggestionReason}"</span>
              )}
            </div>
          </div>
        )}

        {/* Decision buttons */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-300">Your Decision</p>
          <div className="flex flex-col gap-2">
            {(
              [
                { s: "KEEP" as const, label: <span className="flex items-center justify-center gap-1.5"><IconCheck size={ICON_SM} aria-hidden="true" />Keep</span>, active: "bg-emerald-600 text-white", idle: "hover:bg-emerald-900 hover:text-emerald-300" },
                { s: "UNSURE" as const, label: "? Unsure", active: "bg-amber-600 text-white", idle: "hover:bg-amber-900 hover:text-amber-300" },
                { s: "REJECT" as const, label: <span className="flex items-center justify-center gap-1.5"><IconX size={ICON_SM} aria-hidden="true" />Reject</span>, active: "bg-red-600 text-white", idle: "hover:bg-red-900 hover:text-red-300" },
              ]
            ).map(({ s, label, active, idle }) => (
              <button
                key={s}
                onClick={() => go(s)}
                disabled={deciding}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none disabled:opacity-40 ${
                  photo.photographerOverride && photo.cullStatus === s
                    ? active
                    : `bg-zinc-800 text-zinc-300 ${idle}`
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto text-[10px] text-zinc-600">
          <p>K keep · U unsure · R reject</p>
          <p>← → navigate · Esc close</p>
        </div>
      </div>
    </div>
  );
}

// ─── CullingTab ───────────────────────────────────────────────────────────────

export function CullingTab({
  eventId,
  photos: initialPhotos,
  burstClusters,
  initialJob,
  plan,
  cullingSettings: initialSettings,
}: CullingTabProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [filter, setFilter] = useState<FilterType>("all");
  const [job, setJob] = useState(initialJob);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [runningCull, setRunningCull] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<"KEEP" | "REJECT" | null>(null);
  const [burstOpen, setBurstOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(initialSettings);

  function handleSettingsChange(updated: Partial<CullingSettings>) {
    setSettings((prev) => ({ ...prev, ...updated }));
  }

  // Stats
  const stats = useMemo(() => {
    let keep = 0, review = 0, reject = 0, pending = 0;
    for (const p of photos) {
      const s = effectiveStatus(p);
      if (s === "KEEP") keep++;
      else if (s === "REVIEW") review++;
      else if (s === "REJECT") reject++;
      else pending++;
    }
    return { keep, review, reject, pending };
  }, [photos]);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    switch (filter) {
      case "keep":       return photos.filter((p) => effectiveStatus(p) === "KEEP");
      case "review":     return photos.filter((p) => effectiveStatus(p) === "REVIEW");
      case "reject":     return photos.filter((p) => effectiveStatus(p) === "REJECT");
      case "pending":    return photos.filter((p) => effectiveStatus(p) === "PENDING");
      case "blinks":     return photos.filter((p) => (p.blinkProbability ?? 0) > 0.45);
      case "duplicates": return photos.filter((p) => !!p.burstClusterId && !p.isBestInBurst);
      case "soft_focus": return photos.filter((p) => p.sharpnessScore != null && p.sharpnessScore < 0.35);
      default:           return photos;
    }
  }, [photos, filter]);

  // Lightbox photo + index
  const lightboxIdx = lightboxId ? filteredPhotos.findIndex((p) => p.id === lightboxId) : -1;
  const lightboxPhoto = lightboxIdx >= 0 ? filteredPhotos[lightboxIdx] : null;

  // Close lightbox if photo left the filtered set
  useEffect(() => {
    if (lightboxId && lightboxIdx < 0) setLightboxId(null);
  }, [lightboxId, lightboxIdx]);

  // Poll when job active
  const isJobActive = job?.status === "RUNNING" || job?.status === "PENDING";
  useEffect(() => {
    if (!isJobActive) return;
    const timer = setInterval(async () => {
      const { job: updated } = await getCullingProgress(eventId);
      if (!updated) return;
      setJob({
        id: updated.id,
        status: updated.status,
        totalPhotos: updated.totalPhotos,
        processedPhotos: updated.processedPhotos,
        createdAt: toIso(updated.startedAt) ?? new Date().toISOString(),
        completedAt: toIso(updated.completedAt),
      });
      if (updated.status === "DONE" || updated.status === "FAILED") {
        clearInterval(timer);
        router.refresh();
      }
    }, 2000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobActive, eventId]);

  // Decision handler
  const handleDecision = useCallback(
    async (photoId: string, cullStatus: "KEEP" | "REJECT" | "UNSURE") => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...p, cullStatus, photographerOverride: true } : p
        )
      );
      await setCullDecision(photoId, cullStatus);
    },
    []
  );

  // Lightbox navigation
  const handleNavigate = useCallback(
    (dir: -1 | 1) => {
      if (lightboxIdx < 0) return;
      const next = filteredPhotos[lightboxIdx + dir];
      if (next) setLightboxId(next.id);
    },
    [lightboxIdx, filteredPhotos]
  );

  async function handleRunCulling() {
    setRunningCull(true);
    const { jobId, error } = await triggerManualCulling(eventId);
    if (error) {
      alert(error);
    } else if (jobId) {
      setJob({
        id: jobId,
        status: "PENDING",
        totalPhotos: photos.length,
        processedPhotos: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
    }
    setRunningCull(false);
  }

  async function handleBulkApply(autoSuggestion: "KEEP" | "REJECT") {
    setBulkLoading(autoSuggestion);
    await bulkApplyAutoSuggestions(eventId, autoSuggestion);
    setPhotos((prev) =>
      prev.map((p) =>
        !p.photographerOverride && p.autoSuggestion === autoSuggestion
          ? { ...p, cullStatus: autoSuggestion, photographerOverride: true }
          : p
      )
    );
    setBulkLoading(null);
  }

  async function handleBurstAction(cluster: BurstClusterData, action: "keep_best" | "keep_all") {
    const decisions = cluster.photos.map((cp) => ({
      id: cp.id,
      status: (action === "keep_best" ? (cp.isBestInBurst ? "KEEP" : "REJECT") : "KEEP") as "KEEP" | "REJECT",
    }));
    setPhotos((prev) =>
      prev.map((p) => {
        const d = decisions.find((d) => d.id === p.id);
        return d ? { ...p, cullStatus: d.status, photographerOverride: true } : p;
      })
    );
    await Promise.all(decisions.map((d) => setCullDecision(d.id, d.status)));
  }

  const noScores = photos.every((p) => !p.autoSuggestion && !p.photographerOverride);
  const lastRun = job?.completedAt ?? (!isJobActive ? (job?.createdAt ?? null) : null);

  const filterTabs = [
    { f: "all" as FilterType,        label: "All",        count: photos.length },
    { f: "keep" as FilterType,       label: "Keep",       count: stats.keep },
    { f: "review" as FilterType,     label: "Review",     count: stats.review },
    { f: "reject" as FilterType,     label: "Reject",     count: stats.reject },
    { f: "pending" as FilterType,    label: "Pending",    count: stats.pending },
    { f: "blinks" as FilterType,     label: "Blinks",     count: photos.filter((p) => (p.blinkProbability ?? 0) > 0.45).length },
    { f: "duplicates" as FilterType, label: "Duplicates", count: photos.filter((p) => !!p.burstClusterId && !p.isBestInBurst).length },
    { f: "soft_focus" as FilterType, label: "Soft Focus", count: photos.filter((p) => p.sharpnessScore != null && p.sharpnessScore < 0.35).length },
  ];

  return (
    <div className="space-y-4">

      {/* ── Progress bar ── */}
      {isJobActive && job && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-blue-800 dark:text-blue-200">Analyzing photos…</span>
            <span className="tabular-nums text-blue-600 dark:text-blue-400">
              {job.processedPhotos} / {job.totalPhotos}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-500"
              style={{
                width:
                  job.totalPhotos > 0
                    ? `${(job.processedPhotos / job.totalPhotos) * 100}%`
                    : "5%",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Stats pills ── */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { label: <span className="flex items-center gap-1"><IconCheck size={ICON_SM} className={ICON_COLOR.success} aria-hidden="true" />Keep</span>,    f: "keep" as FilterType,    count: stats.keep,    color: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800" },
            { label: "? Review",  f: "review" as FilterType,  count: stats.review,  color: "bg-orange-100 text-orange-800 ring-1 ring-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-800" },
            { label: <span className="flex items-center gap-1"><IconX size={ICON_SM} className={ICON_COLOR.destructive} aria-hidden="true" />Reject</span>,  f: "reject" as FilterType,  count: stats.reject,  color: "bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-800" },
            { label: "Pending",   f: "pending" as FilterType, count: stats.pending, color: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700" },
          ]
        ).map(({ label, f, count, color }) => (
          <button
            key={f}
            onClick={() => setFilter(filter === f ? "all" : f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity focus:outline-none ${color} ${filter === f ? "ring-2 ring-offset-1" : "opacity-80 hover:opacity-100"}`}
          >
            {label}: <span className="font-bold">{count}</span>
          </button>
        ))}
      </div>

      {/* ── FREE upgrade prompt ── */}
      {plan === "FREE" && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/50 py-16 text-center dark:border-amber-800 dark:bg-amber-950/20">
          <div className="mb-3 text-zinc-400 dark:text-zinc-500"><IconAI size={ICON_MD} aria-hidden="true" /></div>
          <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            AI Culling requires PRO or STUDIO
          </h3>
          <p className="mb-5 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            Automatically sort photos by sharpness, blink detection, aesthetic score, and burst deduplication.
          </p>
          <a
            href="/pricing"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            View Plans →
          </a>
        </div>
      )}

      {plan !== "FREE" && (
      <>

      {/* ── Bulk action bar ── */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/95">
        <button
          onClick={() => handleBulkApply("KEEP")}
          disabled={bulkLoading !== null || stats.keep === 0}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40 focus:outline-none"
        >
          {bulkLoading === "KEEP" ? <Spinner /> : <IconCheck size={ICON_SM} aria-hidden="true" />} Accept all KEEPs
        </button>
        <button
          onClick={() => handleBulkApply("REJECT")}
          disabled={bulkLoading !== null || stats.reject === 0}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40 focus:outline-none"
        >
          {bulkLoading === "REJECT" ? <Spinner /> : <IconX size={ICON_SM} aria-hidden="true" />} Reject all REJECTs
        </button>
        <div className="flex-1" />
        <button
          onClick={handleRunCulling}
          disabled={runningCull || isJobActive}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 focus:outline-none"
        >
          {runningCull || isJobActive ? (
            <Spinner className="border-zinc-400" />
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
            </svg>
          )}
          Run Culling Analysis
        </button>
        {lastRun && (
          <span className="text-xs text-zinc-400">Last run: {timeAgo(lastRun)}</span>
        )}
        {/* Settings gear */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center rounded-lg border border-zinc-300 bg-white p-1.5 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 focus:outline-none"
          aria-label="Culling settings"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* ── Empty state ── */}
      {noScores && !isJobActive && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 py-20 text-center dark:border-zinc-700">
          <div className="mb-4 text-zinc-400 dark:text-zinc-500"><IconSearch size={ICON_MD} aria-hidden="true" /></div>
          <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No culling analysis yet
          </h3>
          <p className="mb-5 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            Run culling to automatically sort photos by sharpness, blink detection, and aesthetic score.
          </p>
          <button
            onClick={handleRunCulling}
            disabled={runningCull}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 focus:outline-none"
          >
            Run Culling Analysis
          </button>
        </div>
      )}

      {/* ── Filter sub-tabs + grid ── */}
      {!noScores && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {filterTabs.map(({ f, label, count }) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none ${
                  filter === f
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      filter === f
                        ? "bg-white/20 text-white dark:bg-black/20 dark:text-zinc-900"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Photo grid */}
          {filteredPhotos.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-400">No photos match this filter.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredPhotos.map((photo) => {
                const s = effectiveStatus(photo);
                const reason = photo.photographerOverride ? null : photo.autoSuggestionReason;
                return (
                  <div
                    key={photo.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setLightboxId(photo.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setLightboxId(photo.id);
                      }
                    }}
                    className="group relative cursor-pointer overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-700"
                  >
                    <div className="aspect-[3/2]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    {/* Score row — top, visible on hover */}
                    <div className="absolute inset-x-0 top-0 flex justify-center gap-2 bg-black/50 px-2 py-1 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {photo.sharpnessScore != null && <span className="flex items-center gap-0.5"><IconTarget size={ICON_MD} aria-hidden="true" />{photo.sharpnessScore.toFixed(2)}</span>}
                      {photo.blinkProbability != null && <span className="flex items-center gap-0.5"><IconEye size={ICON_MD} aria-hidden="true" />{photo.blinkProbability.toFixed(2)}</span>}
                      {photo.aestheticScore != null && <span className="flex items-center gap-0.5"><IconStar size={ICON_MD} aria-hidden="true" />{photo.aestheticScore.toFixed(1)}</span>}
                    </div>
                    {/* Status badge — bottom overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-4">
                      <div className="flex flex-col items-center gap-0.5">
                        {s === "KEEP"    && <span className="flex items-center gap-0.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white"><IconCheck size={ICON_SM} aria-hidden="true" />Keep</span>}
                        {s === "REJECT"  && <span className="flex items-center gap-0.5 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white"><IconX size={ICON_SM} aria-hidden="true" />Reject</span>}
                        {s === "REVIEW"  && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">? Review</span>}
                        {s === "PENDING" && <span className="rounded-full bg-zinc-500/80 px-2 py-0.5 text-[10px] font-bold text-white">Analyzing…</span>}
                        {reason && <span className="text-[9px] text-zinc-300">{reason}</span>}
                      </div>
                    </div>
                    {/* Best-in-burst star */}
                    {photo.isBestInBurst && (
                      <div className="absolute right-1.5 top-1.5 text-amber-400"><IconStar size={ICON_SM} aria-hidden="true" /></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Burst clusters ── */}
          {burstClusters.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setBurstOpen(!burstOpen)}
                className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 focus:outline-none"
              >
                <span>Burst Groups ({burstClusters.length} found)</span>
                <svg
                  className={`h-4 w-4 text-zinc-400 transition-transform ${burstOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {burstOpen && (
                <div className="mt-2 space-y-3">
                  {burstClusters.map((cluster) => (
                    <div
                      key={cluster.id}
                      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {cluster.photoCount} similar shots
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleBurstAction(cluster, "keep_best")}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus:outline-none"
                          >
                            Keep Best Only
                          </button>
                          <button
                            onClick={() => handleBurstAction(cluster, "keep_all")}
                            className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700 focus:outline-none"
                          >
                            Keep All
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {cluster.photos.map((cp) => (
                          <div key={cp.id} className="relative shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={cp.thumbnailUrl}
                              alt=""
                              className="h-20 w-20 rounded-lg object-cover"
                            />
                            {cp.isBestInBurst && (
                              <div className="absolute right-0.5 top-0.5 text-amber-400"><IconStar size={ICON_SM} aria-hidden="true" /></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Lightbox portal ── */}
      {lightboxPhoto &&
        typeof document !== "undefined" &&
        createPortal(
          <CullLightbox
            photo={lightboxPhoto}
            idxDisplay={`${lightboxIdx + 1} / ${filteredPhotos.length}`}
            hasPrev={lightboxIdx > 0}
            hasNext={lightboxIdx < filteredPhotos.length - 1}
            onClose={() => setLightboxId(null)}
            onNavigate={handleNavigate}
            onDecision={handleDecision}
          />,
          document.body
        )}

      {/* ── Settings modal ── */}
      {settingsOpen && (
        <CullingSettingsModal
          eventId={eventId}
          settings={settings}
          plan={plan}
          onSettingsChange={handleSettingsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      </>
      )}
    </div>
  );
}

function Spinner({ className = "border-white" }: { className?: string }) {
  return (
    <span
      className={`h-3.5 w-3.5 animate-spin rounded-full border border-t-transparent ${className}`}
    />
  );
}
