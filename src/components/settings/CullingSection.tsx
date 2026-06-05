"use client";

import { createPortal } from "react-dom";
import { startTransition, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  triggerManualCulling,
  getCullingProgress,
  updateCullingSettings,
} from "@/app/dashboard/events/[id]/actions";
import { resetCulling } from "@/app/dashboard/events/[id]/culling/actions";
import { useSettingsContext } from "@/components/settings/SettingsContext";
import { IconCheck, IconX, ICON_SM } from "@/components/ui/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CullJobSummary = {
  status: string;
  processedPhotos: number;
  totalPhotos: number;
  completedAt: string | null;
} | null;

export type CullStats = {
  keep: number;
  review: number;
  reject: number;
  pending: number;
};

export interface CullingSectionProps {
  eventId: string;
  cullingEnabled: boolean;
  autoCullOnUpload: boolean;
  cullingSensitivity: string;
  stats: CullStats;
  lastJob: CullJobSummary;
  lastCulledAt: string | null;
  plan: "FREE" | "PRO" | "STUDIO";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | Date | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hour${Math.floor(diff / 3_600_000) !== 1 ? "s" : ""} ago`;
  return `${Math.floor(diff / 86_400_000)} day${Math.floor(diff / 86_400_000) !== 1 ? "s" : ""} ago`;
}

const ACTIVE_STATUSES = new Set(["PENDING", "RUNNING"]);

const SENSITIVITY_LABELS: Record<string, { label: string; desc: string }> = {
  low:    { label: "Low",    desc: "Only flag very obvious issues" },
  medium: { label: "Medium", desc: "Balanced — recommended" },
  high:   { label: "High",   desc: "Flag anything uncertain" },
};

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <div className={`h-5 w-9 rounded-full transition-colors ${checked && !disabled ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
        {/* Toggle knob — intentionally white on all themes */}
        <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform ${checked && !disabled ? "translate-x-4" : "translate-x-0"}`} />
      </div>
      <div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        {description && <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{description}</p>}
      </div>
    </label>
  );
}

// ─── ResetConfirmDialog ───────────────────────────────────────────────────────

function ResetConfirmDialog({
  onConfirm,
  onCancel,
  busy,
  resetCount,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  resetCount: number | null;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
        <div className="p-6">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Reset All Decisions?
          </h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            All {resetCount !== null ? resetCount : ""} photo cull statuses will be reset to pending.
            AI suggestions are not affected.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
          >
            {busy && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
              </svg>
            )}
            Reset All
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CullingSection({
  eventId,
  cullingEnabled: initialEnabled,
  autoCullOnUpload: initialAutoCull,
  cullingSensitivity: initialSensitivity,
  stats,
  lastJob: initialJob,
  lastCulledAt,
  plan,
}: CullingSectionProps) {
  const router = useRouter();
  const { showToast } = useSettingsContext();
  const isStudio = plan === "STUDIO";

  const [enabled, setEnabled] = useState(initialEnabled);
  const [autoCull, setAutoCull] = useState(initialAutoCull);
  const [sensitivity, setSensitivity] = useState(initialSensitivity || "medium");
  const [job, setJob] = useState<CullJobSummary>(initialJob);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [running, startRunTransition] = useTransition();
  const [resetting, startResetTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();

  const isJobRunning = job ? ACTIVE_STATUSES.has(job.status) : false;

  // Poll while job is active
  useEffect(() => {
    if (!isJobRunning) return;
    const id = setInterval(async () => {
      const { job: latest } = await getCullingProgress(eventId);
      startTransition(() => setJob(latest ? {
        status: latest.status,
        processedPhotos: latest.processedPhotos,
        totalPhotos: latest.totalPhotos,
        completedAt: latest.completedAt?.toISOString?.() ?? String(latest.completedAt ?? ""),
      } : null));
      if (latest && !ACTIVE_STATUSES.has(latest.status)) {
        clearInterval(id);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isJobRunning, eventId, router]);

  function handleToggleEnabled(v: boolean) {
    setEnabled(v);
    startSaveTransition(async () => {
      await updateCullingSettings(eventId, { cullingEnabled: v });
      showToast(v ? "AI Culling enabled" : "AI Culling disabled");
      router.refresh();
    });
  }

  function handleToggleAutoCull(v: boolean) {
    setAutoCull(v);
    startSaveTransition(async () => {
      await updateCullingSettings(eventId, { autoCullOnUpload: v });
      showToast(v ? "Auto-analyze enabled" : "Auto-analyze disabled");
    });
  }

  function handleSensitivityChange(s: string) {
    setSensitivity(s);
    startSaveTransition(async () => {
      await updateCullingSettings(eventId, { cullingSensitivity: s });
      showToast("Sensitivity updated");
    });
  }

  function handleRunCulling() {
    setError(null);
    startRunTransition(async () => {
      const result = await triggerManualCulling(eventId);
      if (result.error === "PLAN_LIMIT") {
        setError(`Culling is not available on the ${plan} plan.`);
        return;
      }
      if (result.error) { setError(result.error); return; }
      const { job: latest } = await getCullingProgress(eventId);
      startTransition(() => setJob(latest ? {
        status: latest.status,
        processedPhotos: latest.processedPhotos,
        totalPhotos: latest.totalPhotos,
        completedAt: latest.completedAt?.toISOString?.() ?? String(latest.completedAt ?? ""),
      } : null));
    });
  }

  function handleReset() {
    startResetTransition(async () => {
      await resetCulling(eventId);
      setShowResetDialog(false);
      router.refresh();
    });
  }

  const progress = isJobRunning && job && job.totalPhotos > 0
    ? Math.round((job.processedPhotos / job.totalPhotos) * 100)
    : null;

  const lastRun = timeAgo(lastCulledAt ?? (job?.completedAt ?? null));
  const totalDecisions = stats.keep + stats.review + stats.reject + stats.pending;
  const sensitivityInfo = SENSITIVITY_LABELS[sensitivity] ?? SENSITIVITY_LABELS.medium;

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <Toggle
        checked={enabled}
        onChange={handleToggleEnabled}
        disabled={saving}
        label="Enable AI Culling"
        description="Automatically analyze photos for sharpness, blink detection, and aesthetic quality."
      />

      {enabled && (
        <>
          {/* Auto-cull on upload */}
          <Toggle
            checked={autoCull}
            onChange={handleToggleAutoCull}
            disabled={saving}
            label="Auto-analyze on upload"
            description="Analyze each photo as it uploads"
          />

          {/* Sensitivity (STUDIO only) */}
          <div className={!isStudio ? "opacity-60" : ""}>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Sensitivity</p>
              {!isStudio && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  STUDIO
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => isStudio && handleSensitivityChange(s)}
                  disabled={!isStudio || saving}
                  className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all ${
                    sensitivity === s
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
                  } disabled:cursor-not-allowed`}
                >
                  {SENSITIVITY_LABELS[s].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
              {sensitivityInfo.desc}
            </p>
          </div>

          {/* Stats */}
          {totalDecisions > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Keep",    count: stats.keep,    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20",  icon: <IconCheck size={ICON_SM} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> },
                { label: "Review",  count: stats.review,  color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-50 dark:bg-amber-950/20",       icon: <span className="text-sm font-bold text-amber-600 dark:text-amber-400">?</span> },
                { label: "Reject",  count: stats.reject,  color: "text-red-600 dark:text-red-400",        bg: "bg-red-50 dark:bg-red-950/20",           icon: <IconX size={ICON_SM} className="text-red-600 dark:text-red-400" aria-hidden="true" /> },
                { label: "Pending", count: stats.pending, color: "text-zinc-500 dark:text-zinc-400",      bg: "bg-zinc-50 dark:bg-zinc-800/60",         icon: <span className="text-sm text-zinc-500 dark:text-zinc-400">○</span> },
              ].map(({ label, count, color, bg, icon }) => (
                <div key={label} className={`flex flex-col items-center rounded-xl ${bg} px-3 py-3`}>
                  <div className="flex items-center gap-1.5">
                    {icon}
                    <span className={`text-xl font-bold ${color}`}>{count}</span>
                  </div>
                  <span className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Progress */}
          {isJobRunning && job && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Analyzing photos…</span>
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

          {/* Run / View actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRunCulling}
              disabled={running || isJobRunning}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {(running || isJobRunning) ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.908a.75.75 0 0 1 .766.027l3.5 2.25a.75.75 0 0 1 0 1.262l-3.5 2.25A.75.75 0 0 1 8 12.25v-4.5a.75.75 0 0 1 .39-.658Z" clipRule="evenodd" />
                </svg>
              )}
              {isJobRunning ? "Analyzing…" : "Run Culling Analysis Now"}
            </button>

            {lastRun && !isJobRunning && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">Last run: {lastRun}</span>
            )}

            <Link
              href={`/dashboard/events/${eventId}?tab=culling`}
              className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              View Culling Results
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Reset decisions */}
      {enabled && totalDecisions > 0 && (
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Reset All Decisions</p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                Resets all photographer cull decisions back to pending.
              </p>
            </div>
            <button
              onClick={() => setShowResetDialog(true)}
              disabled={resetting || isJobRunning}
              className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Reset All Decisions
            </button>
          </div>
        </div>
      )}

      {/* Reset confirm dialog */}
      {showResetDialog && (
        <ResetConfirmDialog
          onConfirm={handleReset}
          onCancel={() => setShowResetDialog(false)}
          busy={resetting}
          resetCount={totalDecisions}
        />
      )}
    </div>
  );
}
