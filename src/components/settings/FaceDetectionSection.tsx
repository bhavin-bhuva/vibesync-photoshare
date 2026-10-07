"use client";

import { createPortal } from "react-dom";
import { startTransition, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  enableFaceIndexingAction,
  deleteEventFaceDataAction,
} from "@/app/dashboard/events/[id]/actions";
import { getIndexingJobProgress } from "@/app/dashboard/events/[id]/faces/actions";
import { useSettingsContext } from "@/components/settings/SettingsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FaceJobSummary = {
  status: string;
  processedPhotos: number;
  totalPhotos: number;
  completedAt: string | null;
} | null;

export interface FaceDetectionSectionProps {
  eventId: string;
  faceIndexingEnabled: boolean;
  clusterCount: number;
  totalFaces: number;
  photosAnalyzed: number;
  lastClusteredAt: string | null;
  lastJob: FaceJobSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RawJob = { status: string; processedPhotos: number; totalPhotos: number; completedAt: Date | string | null } | null;
function normalizeJob(j: RawJob): FaceJobSummary {
  if (!j) return null;
  return {
    status: String(j.status),
    processedPhotos: j.processedPhotos,
    totalPhotos: j.totalPhotos,
    completedAt: j.completedAt instanceof Date ? j.completedAt.toISOString() : (j.completedAt ?? null),
  };
}

function timeAgo(iso: string | Date | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hour${Math.floor(diff / 3_600_000) !== 1 ? "s" : ""} ago`;
  return `${Math.floor(diff / 86_400_000)} day${Math.floor(diff / 86_400_000) !== 1 ? "s" : ""} ago`;
}

const ACTIVE_STATUSES = new Set(["PENDING", "RUNNING", "CLUSTERING"]);

// ─── DeleteConfirmDialog ──────────────────────────────────────────────────────

function DeleteConfirmDialog({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [typed, setTyped] = useState("");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
        <div className="p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
            <svg className="h-5 w-5 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Delete All Face Data?
          </h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This will permanently delete all face data for this event including people groupings.
            Photos will not be deleted.
          </p>

          <div className="mt-5">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Type <span className="font-mono font-bold text-red-600 dark:text-red-400">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              placeholder="DELETE"
              autoFocus
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== "DELETE" || busy}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
              </svg>
            )}
            Delete All Face Data
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FaceDetectionSection({
  eventId,
  faceIndexingEnabled: initialEnabled,
  clusterCount,
  totalFaces,
  photosAnalyzed,
  lastClusteredAt,
  lastJob: initialJob,
}: FaceDetectionSectionProps) {
  const router = useRouter();
  const { showToast } = useSettingsContext();

  const [enabled, setEnabled] = useState(initialEnabled);
  const [job, setJob] = useState<FaceJobSummary>(initialJob);
  const [enabling, startEnableTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = job ? ACTIVE_STATUSES.has(job.status) : false;

  // Poll while job is active
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(async () => {
      const { job: latest } = await getIndexingJobProgress(eventId);
      startTransition(() => setJob(normalizeJob(latest ?? null)));
      if (latest && !ACTIVE_STATUSES.has(latest.status)) {
        clearInterval(id);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isRunning, eventId, router]);

  function handleEnable() {
    setError(null);
    startEnableTransition(async () => {
      const result = await enableFaceIndexingAction(eventId);
      if (result.error) { setError(result.error); return; }
      setEnabled(true);
      const { job: latest } = await getIndexingJobProgress(eventId);
      startTransition(() => setJob(normalizeJob(latest ?? null)));
      showToast("Face detection enabled");
      router.refresh();
    });
  }

  function handleRescan() {
    setError(null);
    startEnableTransition(async () => {
      const result = await enableFaceIndexingAction(eventId);
      if (result.error) { setError(result.error); return; }
      const { job: latest } = await getIndexingJobProgress(eventId);
      startTransition(() => setJob(normalizeJob(latest ?? null)));
      showToast("Face scan started");
    });
  }

  function handleDelete() {
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteEventFaceDataAction(eventId);
      setShowDeleteDialog(false);
      if (result.error) { setError(result.error); return; }
      setEnabled(false);
      setJob(null);
      showToast("Face data deleted");
      router.refresh();
    });
  }

  const progress = isRunning && job && job.totalPhotos > 0
    ? Math.round((job.processedPhotos / job.totalPhotos) * 100)
    : null;

  const lastScan = timeAgo(lastClusteredAt ?? (job?.completedAt ?? null));

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <label className="flex cursor-pointer items-start gap-3">
        <div className="relative mt-0.5 shrink-0">
          <input
            type="checkbox"
            className="sr-only"
            checked={enabled}
            disabled={enabling}
            onChange={() => { if (!enabled) handleEnable(); }}
          />
          <div className={`h-5 w-9 rounded-full transition-colors ${enabled && !enabling ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
          {/* Toggle knob — intentionally white on all themes */}
          <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform ${enabled && !enabling ? "translate-x-4" : "translate-x-0"}`} />
        </div>
        <div>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Enable Face Detection
          </span>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            When enabled, PhotoHouse automatically detects and groups faces in your uploaded photos.
          </p>
        </div>
      </label>

      {/* Stats (when enabled) */}
      {enabled && clusterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/40">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {clusterCount} {clusterCount === 1 ? "person" : "people"} detected
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span className="text-zinc-500 dark:text-zinc-400">{photosAnalyzed} photos analyzed</span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span className="text-zinc-500 dark:text-zinc-400">{totalFaces} faces found</span>
        </div>
      )}

      {/* Progress bar */}
      {isRunning && job && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {job.status === "CLUSTERING" ? "Clustering faces…" : "Analyzing photos…"}
            </span>
            <span>{job.processedPhotos} / {job.totalPhotos}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-500 dark:bg-indigo-500"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      {enabled && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRescan}
            disabled={enabling || isRunning}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {enabling || isRunning ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Z" clipRule="evenodd" />
                <path d="M1.23 7.303a7 7 0 0 1 11.712-3.138l.31.31V2.243a.75.75 0 0 1 1.5 0v4.243a.75.75 0 0 1-.75.75H9.759a.75.75 0 0 1 0-1.5h2.433l-.312-.311A5.5 5.5 0 0 0 2.68 7.693a.75.75 0 0 1-1.45-.39Z" />
              </svg>
            )}
            Re-scan All Photos
          </button>

          {lastScan && !isRunning && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Last scanned: {lastScan}
            </span>
          )}
        </div>
      )}

      {/* Privacy callout */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
        </svg>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Customer selfies are automatically deleted after 24 hours and never shared with third parties.
        </p>
      </div>

      {/* Delete face data */}
      {enabled && (
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Delete Face Data</p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                Permanently remove all face detections and person groups for this event.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleting || isRunning}
              className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Delete All Face Data
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Delete confirm dialog */}
      {showDeleteDialog && (
        <DeleteConfirmDialog
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          busy={deleting}
        />
      )}
    </div>
  );
}
