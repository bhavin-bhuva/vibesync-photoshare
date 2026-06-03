"use client";

import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { updateCullingSettings } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CullingSettings = {
  cullingEnabled: boolean;
  autoCullOnUpload: boolean;
  cullingSensitivity: string;
  rejectBurstDups: boolean;
};

type Plan = "FREE" | "PRO" | "STUDIO";

export type CullingSettingsModalProps = {
  eventId: string;
  settings: CullingSettings;
  plan: Plan;
  onSettingsChange: (updated: Partial<CullingSettings>) => void;
  onClose: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PlanBadge({ tier }: { tier: "PRO" | "STUDIO" }) {
  return (
    <span
      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        tier === "STUDIO"
          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
          : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
      }`}
    >
      {tier}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const SENSITIVITY_LABELS: Record<string, { label: string; desc: string }> = {
  low:    { label: "Low",    desc: "Only flag obvious blinks and blurry shots" },
  medium: { label: "Medium", desc: "Standard thresholds (recommended)" },
  high:   { label: "High",   desc: "Flag anything uncertain, prefer fewer keepers" },
};

// ─── CullingSettingsModal ─────────────────────────────────────────────────────

export function CullingSettingsModal({
  eventId,
  settings,
  plan,
  onSettingsChange,
  onClose,
}: CullingSettingsModalProps) {
  const [saving, setSaving] = useState<string | null>(null);

  async function handleToggle(key: keyof CullingSettings, value: boolean | string) {
    setSaving(key);
    onSettingsChange({ [key]: value });
    await updateCullingSettings(eventId, { [key]: value });
    setSaving(null);
  }

  const isStudio = plan === "STUDIO";
  const isPro    = plan === "PRO" || plan === "STUDIO";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            AI Culling Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 focus:outline-none"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* FREE upgrade prompt */}
        {!isPro && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              AI Culling requires PRO or STUDIO
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Upgrade to automatically sort photos by sharpness, blink detection, and aesthetics.
            </p>
            <a
              href="/pricing"
              className="mt-3 inline-block rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              View Plans →
            </a>
          </div>
        )}

        <div className="space-y-5">
          {/* Enable culling */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Enable AI Culling
                {!isPro && <PlanBadge tier="PRO" />}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Show the Culling tab and enable analysis for this event
              </p>
            </div>
            <Toggle
              checked={settings.cullingEnabled}
              onChange={(v) => handleToggle("cullingEnabled", v)}
              disabled={!isPro || saving === "cullingEnabled"}
            />
          </div>

          {/* Auto-cull on upload */}
          <div className={`flex items-center justify-between gap-4 ${!settings.cullingEnabled ? "opacity-40" : ""}`}>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Auto-cull on upload
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Analyze each photo immediately after upload
              </p>
            </div>
            <Toggle
              checked={settings.autoCullOnUpload}
              onChange={(v) => handleToggle("autoCullOnUpload", v)}
              disabled={!isPro || !settings.cullingEnabled || saving === "autoCullOnUpload"}
            />
          </div>

          {/* Sensitivity */}
          <div className={!settings.cullingEnabled ? "opacity-40" : ""}>
            <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Sensitivity
              {!isStudio && <PlanBadge tier="STUDIO" />}
            </p>
            <div className="space-y-2">
              {(["low", "medium", "high"] as const).map((level) => {
                const { label, desc } = SENSITIVITY_LABELS[level];
                const active = settings.cullingSensitivity === level;
                return (
                  <button
                    key={level}
                    disabled={!isStudio || !settings.cullingEnabled}
                    onClick={() => isStudio && settings.cullingEnabled && handleToggle("cullingSensitivity", level)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="w-14 shrink-0 text-xs font-semibold">{label}</span>
                    <span className="text-xs opacity-80">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reject burst duplicates */}
          <div className={`flex items-center justify-between gap-4 ${!settings.cullingEnabled ? "opacity-40" : ""}`}>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Auto-reject burst duplicates
                {!isStudio && <PlanBadge tier="STUDIO" />}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Automatically reject all but the best shot in each burst group
              </p>
            </div>
            <Toggle
              checked={settings.rejectBurstDups}
              onChange={(v) => handleToggle("rejectBurstDups", v)}
              disabled={!isStudio || !settings.cullingEnabled || saving === "rejectBurstDups"}
            />
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-400">
          Changes save automatically
        </p>
      </div>
    </div>,
    document.body
  );
}
