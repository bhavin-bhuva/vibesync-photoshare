"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveEventWatermark, type EventWatermarkData } from "@/app/dashboard/events/[id]/settings/actions";
import { useSettingsContext } from "@/components/settings/SettingsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatermarkSectionProps {
  eventId: string;
  plan: "FREE" | "PRO" | "STUDIO";
  // Event-level override
  watermarkOverride: boolean;
  watermarkEnabled: boolean;
  watermarkSource: string;
  watermarkPosition: string;
  watermarkOpacity: number;
  // Studio defaults
  studioWatermarkEnabled: boolean;
  studioWatermarkPosition: string;
  studioWatermarkOpacity: number;
  studioName: string;
  studioLogoUrl: string | null;
  // Preview photo
  firstPhotoUrl: string | null;
}

// ─── Position grid ────────────────────────────────────────────────────────────

const POSITIONS = [
  ["TOP_LEFT",     "TOP_CENTER",    "TOP_RIGHT"],
  ["MIDDLE_LEFT",  "CENTER",        "MIDDLE_RIGHT"],
  ["BOTTOM_LEFT",  "BOTTOM_CENTER", "BOTTOM_RIGHT"],
] as const;

type PositionId = typeof POSITIONS[number][number];

const POSITION_ICONS: Record<PositionId, string> = {
  TOP_LEFT: "↖", TOP_CENTER: "↑", TOP_RIGHT: "↗",
  MIDDLE_LEFT: "←", CENTER: "·", MIDDLE_RIGHT: "→",
  BOTTOM_LEFT: "↙", BOTTOM_CENTER: "↓", BOTTOM_RIGHT: "↘",
};

// CSS position style for preview overlay
function positionStyle(pos: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    TOP_LEFT:      { top: "8%",  left: "8%" },
    TOP_CENTER:    { top: "8%",  left: "50%", transform: "translateX(-50%)" },
    TOP_RIGHT:     { top: "8%",  right: "8%" },
    MIDDLE_LEFT:   { top: "50%", left: "8%",  transform: "translateY(-50%)" },
    CENTER:        { top: "50%", left: "50%", transform: "translate(-50%,-50%)" },
    MIDDLE_RIGHT:  { top: "50%", right: "8%", transform: "translateY(-50%)" },
    BOTTOM_LEFT:   { bottom: "8%", left: "8%" },
    BOTTOM_CENTER: { bottom: "8%", left: "50%", transform: "translateX(-50%)" },
    BOTTOM_RIGHT:  { bottom: "8%", right: "8%" },
  };
  return map[pos] ?? map.BOTTOM_RIGHT;
}

function positionLabel(pos: string): string {
  return pos.replace("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WatermarkSection({
  eventId,
  plan,
  watermarkOverride: initialOverride,
  watermarkEnabled: initialEnabled,
  watermarkSource: initialSource,
  watermarkPosition: initialPosition,
  watermarkOpacity: initialOpacity,
  studioWatermarkEnabled,
  studioWatermarkPosition,
  studioWatermarkOpacity,
  studioName,
  studioLogoUrl,
  firstPhotoUrl,
}: WatermarkSectionProps) {
  const router = useRouter();
  const isPro = plan === "PRO" || plan === "STUDIO";

  const [override, setOverride] = useState(initialOverride);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [source, setSource] = useState(initialSource);
  const [position, setPosition] = useState(initialPosition);
  const [opacity, setOpacity] = useState(initialOpacity);

  const [origOverride] = useState(initialOverride);
  const [origEnabled] = useState(initialEnabled);
  const [origSource] = useState(initialSource);
  const [origPosition] = useState(initialPosition);
  const [origOpacity] = useState(initialOpacity);

  const { setDirty, showToast } = useSettingsContext();
  const [isPending, startTransition] = useTransition();
  const [savedStatus, setSavedStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    override !== origOverride ||
    enabled !== origEnabled ||
    source !== origSource ||
    position !== origPosition ||
    opacity !== origOpacity;

  useEffect(() => {
    setDirty("watermark", isDirty, "Watermark");
    return () => setDirty("watermark", false);
  }, [isDirty, setDirty]);

  function handleSave() {
    if (!isDirty || isPending) return;
    setError(null);
    const data: EventWatermarkData = { watermarkOverride: override, watermarkEnabled: enabled, watermarkSource: source, watermarkPosition: position, watermarkOpacity: opacity };
    startTransition(async () => {
      const result = await saveEventWatermark(eventId, data);
      if (result.error) { setError(result.error); return; }
      setSavedStatus("saved");
      router.refresh();
      showToast("Watermark settings saved");
      setTimeout(() => setSavedStatus("idle"), 2000);
    });
  }

  // What to display in preview
  const activeEnabled = override ? enabled : studioWatermarkEnabled;
  const activeSource = override ? source : "name";
  const activePosition = override ? position : studioWatermarkPosition;
  const activeOpacity = override ? opacity : studioWatermarkOpacity;

  const watermarkText = studioName || "Studio";

  return (
    <div className="space-y-6">
      {/* PRO gate notice */}
      {!isPro && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/20">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Watermarks are applied to downloads on PRO and STUDIO plans.{" "}
            <a href="/pricing" target="_blank" className="underline">Upgrade →</a>
          </p>
        </div>
      )}

      {/* Override toggle */}
      <label className="flex cursor-pointer items-start gap-3">
        <div className="relative mt-0.5 shrink-0">
          <input type="checkbox" className="sr-only" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          <div className={`h-5 w-9 rounded-full transition-colors ${override ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
          {/* Toggle knob — intentionally white on all themes */}
          <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform ${override ? "translate-x-4" : "translate-x-0"}`} />
        </div>
        <div>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Use custom watermark for this event
          </span>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Override your studio default settings
          </p>
        </div>
      </label>

      {/* Studio defaults (read-only when not overriding) */}
      {!override && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/40">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Studio default</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {studioWatermarkEnabled
              ? `${studioName} watermark · ${positionLabel(studioWatermarkPosition)} · ${studioWatermarkOpacity}% opacity`
              : "Watermarks disabled"}
          </p>
          <Link
            href="/dashboard/profile"
            className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Edit Studio Defaults
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      )}

      {/* Override controls */}
      {override && (
        <div className="space-y-6">
          {/* Enable watermark toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative shrink-0">
              <input type="checkbox" className="sr-only" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <div className={`h-5 w-9 rounded-full transition-colors ${enabled ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
              {/* Toggle knob — intentionally white on all themes */}
              <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Apply watermark</span>
          </label>

          {enabled && (
            <>
              {/* Source */}
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Source</p>
                <div className="flex gap-2">
                  {(["logo", "name", "none"] as const).map((s) => {
                    const labels = { logo: "Studio Logo", name: "Studio Name", none: "None" };
                    const disabled = s === "logo" && !studioLogoUrl;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => !disabled && setSource(s)}
                        disabled={disabled}
                        title={disabled ? "No logo uploaded in studio profile" : undefined}
                        className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all ${
                          source === s
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400"
                            : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {labels[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Position picker */}
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Position</p>
                <div className="inline-grid grid-cols-3 gap-1.5">
                  {POSITIONS.map((row) =>
                    row.map((pos) => {
                      const active = position === pos;
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setPosition(pos)}
                          aria-label={positionLabel(pos)}
                          className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg font-medium transition-all ${
                            active
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {POSITION_ICONS[pos]}
                        </button>
                      );
                    })
                  )}
                </div>
                <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">{positionLabel(position)}</p>
              </div>

              {/* Opacity slider */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Opacity</p>
                  <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{opacity}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={5}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                  <span>10%</span>
                  <span>80%</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Live preview */}
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</p>
        <div
          className="relative overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800"
          style={{ height: 200 }}
        >
          {firstPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firstPhotoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <svg className="h-12 w-12 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          )}

          {/* Watermark overlay */}
          {activeEnabled && activeSource !== "none" && (
            <div
              className="absolute pointer-events-none select-none"
              style={{
                ...positionStyle(activePosition),
                position: "absolute",
                opacity: activeOpacity / 100,
              }}
            >
              {activeSource === "logo" && studioLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={studioLogoUrl}
                  alt=""
                  style={{ maxHeight: 32, maxWidth: 120, filter: "brightness(0) invert(1) drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
                />
              ) : (
                <span
                  className="whitespace-nowrap text-white drop-shadow"
                  style={{ fontSize: 14, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.7)", letterSpacing: "0.05em" }}
                >
                  {watermarkText}
                </span>
              )}
            </div>
          )}

          {!activeEnabled && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
                No watermark
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!isDirty || isPending}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {isPending ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
            </svg>
            Saving…
          </>
        ) : savedStatus === "saved" ? (
          <>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
            Saved
          </>
        ) : (
          "Save Watermark Settings"
        )}
      </button>
    </div>
  );
}
