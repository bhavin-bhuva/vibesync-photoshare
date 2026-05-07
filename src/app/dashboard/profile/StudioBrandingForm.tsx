"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateStudioProfileAction, updateWatermarkSettingsAction, saveLogoKeyAction } from "./actions";
import { getPresignedLogoUploadUrl } from "@/lib/s3";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

type WatermarkPosition = "BOTTOM_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_CENTER";

// ─── Shared input class ───────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 sm:text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-600";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

// ─── Brand color swatches ─────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#18181b", // zinc-900
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
];

function BrandColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const t = useT();
  const s = t.profile.studio;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Field label={s.brandColorLabel}>
      {/* Preset swatches */}
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-10 w-10 rounded-lg transition-all ${
              color === c
                ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-800"
                : "ring-1 ring-zinc-200 hover:ring-zinc-400 dark:ring-zinc-600"
            }`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>

      {/* Custom hex + color picker */}
      <div className="flex items-center gap-3">
        <div
          className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-600"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer border-0 p-0 opacity-0"
          />
          <div className="h-full w-full rounded-lg" style={{ backgroundColor: color }} />
        </div>
        <input
          type="text"
          value={color}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
          }}
          placeholder="#18181b"
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 font-mono text-base text-zinc-700 sm:text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
        />
      </div>
    </Field>
  );
}

// ─── Logo upload ──────────────────────────────────────────────────────────────

function LogoUpload({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const t = useT();
  const s = t.profile.studio;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState("");

  const displayUrl = previewUrl ?? currentLogoUrl;

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError(s.logoInvalidFile);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    setError("");

    try {
      const presigned = await getPresignedLogoUploadUrl(file.name, file.type);
      if ("error" in presigned) throw new Error(presigned.error);

      const res = await fetch(presigned.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);

      const saved = await saveLogoKeyAction(presigned.key);
      if ("error" in saved) throw new Error(saved.error);

      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      {/* Preview */}
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-700 dark:ring-zinc-600 sm:h-20 sm:w-20">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt="Studio logo" className="h-full w-full object-cover" style={{ maxWidth: 200 }} />
        ) : (
          <svg className="h-8 w-8 text-zinc-300 dark:text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
            <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
          </svg>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
            </svg>
          </div>
        )}
      </div>

      {/* Upload actions */}
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {uploading ? s.logoUploading : displayUrl ? s.logoChange : s.logoUpload}
        </button>
        <p className="text-xs text-zinc-400">{s.logoHint}</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}

// ─── Watermark preview ────────────────────────────────────────────────────────

function WatermarkPreview({
  studioName,
  logoUrl,
  position,
  opacity,
  enabled,
}: {
  studioName: string;
  logoUrl: string | null;
  position: WatermarkPosition;
  opacity: number;
  enabled: boolean;
}) {
  const t = useT();
  const wm = t.profile.watermark;

  const positionCls =
    position === "BOTTOM_LEFT"   ? "bottom-3 left-3 items-start"  :
    position === "BOTTOM_CENTER" ? "bottom-3 left-1/2 -translate-x-1/2 items-center" :
                                   "bottom-3 right-3 items-end";

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{wm.previewLabel}</p>
      <div className="relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-zinc-400 to-zinc-600" style={{ aspectRatio: "16/9" }}>
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <svg className="h-16 w-16 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
            <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
          </svg>
        </div>

        {enabled && (
          <div
            className={`absolute flex flex-col ${positionCls}`}
            style={{ opacity: opacity / 100 }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={wm.previewAlt}
                className="h-10 w-10 rounded object-contain drop-shadow-lg"
              />
            ) : (
              <p className="text-sm font-bold text-white drop-shadow-lg">
                {studioName || "Studio Name"}
              </p>
            )}
          </div>
        )}

        {!enabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/40 px-3 py-1 text-xs text-white/70">
              Watermark off
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Position button ──────────────────────────────────────────────────────────

function PositionButton({
  pos,
  active,
  disabled,
  label,
  onClick,
}: {
  pos: WatermarkPosition;
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const dotPos =
    pos === "BOTTOM_LEFT"   ? "items-end justify-start"   :
    pos === "BOTTOM_CENTER" ? "items-end justify-center"  :
                              "items-end justify-end";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-zinc-900 bg-zinc-50 dark:border-zinc-300 dark:bg-zinc-700/60"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-700/20 dark:hover:border-zinc-500"
      }`}
    >
      {/* Mini preview */}
      <div className={`flex h-10 w-full rounded-lg bg-zinc-200 dark:bg-zinc-600 ${dotPos} p-1.5`}>
        <div className={`h-2.5 w-2.5 rounded-full ${active ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-400 dark:bg-zinc-400"}`} />
      </div>
      <span className={`text-xs font-medium leading-tight text-center ${
        active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
      }`}>
        {label}
      </span>
    </button>
  );
}

// ─── Watermark settings form ──────────────────────────────────────────────────

export function WatermarkSettings({
  profile,
}: {
  profile: Pick<StudioProfileData, "watermarkEnabled" | "watermarkPosition" | "watermarkOpacity" | "logoUrl" | "studioName">;
}) {
  const t = useT();
  const wm = t.profile.watermark;
  const [state, formAction, pending] = useActionState(updateWatermarkSettingsAction, null);
  const [enabled,  setEnabled]  = useState(profile.watermarkEnabled);
  const [position, setPosition] = useState<WatermarkPosition>(profile.watermarkPosition);
  const [opacity,  setOpacity]  = useState(profile.watermarkOpacity);

  const POSITIONS: WatermarkPosition[] = ["BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT"];

  return (
    <div className="space-y-6">
      {/* Live preview — full width */}
      <WatermarkPreview
        studioName={profile.studioName}
        logoUrl={profile.logoUrl}
        position={position}
        opacity={opacity}
        enabled={enabled}
      />

      <form id="watermark-form" action={formAction} className="space-y-5">
        <input type="hidden" name="watermarkEnabled"  value={String(enabled)} />
        <input type="hidden" name="watermarkPosition" value={position} />
        <input type="hidden" name="watermarkOpacity"  value={String(opacity)} />

        {/* Enable toggle */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative mt-0.5 h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              enabled ? "bg-zinc-900 dark:bg-zinc-50" : "bg-zinc-300 dark:bg-zinc-600"
            }`}
          >
            <span
              className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
                enabled ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{wm.enabledLabel}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{wm.enabledHint}</p>
          </div>
        </div>

        {/* Position — 3 large buttons in a row */}
        <Field label={wm.positionLabel}>
          <div className="flex gap-2">
            {POSITIONS.map((pos) => (
              <PositionButton
                key={pos}
                pos={pos}
                active={position === pos}
                disabled={!enabled}
                label={wm.positions[pos]}
                onClick={() => setPosition(pos)}
              />
            ))}
          </div>
        </Field>

        {/* Opacity slider — large thumb */}
        <Field label={`${wm.opacityLabel} — ${wm.opacityValue(opacity)}`}>
          <input
            type="range"
            min={10}
            max={80}
            step={5}
            value={opacity}
            disabled={!enabled}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full cursor-pointer accent-zinc-900 disabled:opacity-40 dark:accent-zinc-50"
            style={{ height: 24 }}
          />
          <div className="mt-1 flex justify-between text-xs text-zinc-400">
            <span>10%</span>
            <span>80%</span>
          </div>
        </Field>

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {state.error}
          </p>
        )}

        {/* Sticky save bar on mobile */}
        <div
          className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t border-zinc-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/95 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:dark:bg-transparent"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {state && "success" in state && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.profile.saved}</span>
            )}
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:flex-none sm:py-2"
            >
              {pending ? t.profile.saving : wm.saveButton}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Studio branding form ─────────────────────────────────────────────────────

export interface StudioProfileData {
  studioName:        string;
  tagline:           string | null;
  website:           string | null;
  phone:             string | null;
  address:           string | null;
  brandColor:        string | null;
  logoUrl:           string | null;
  watermarkEnabled:  boolean;
  watermarkPosition: WatermarkPosition;
  watermarkOpacity:  number;
}

export function StudioBrandingForm({ profile }: { profile: StudioProfileData }) {
  const t = useT();
  const s = t.profile.studio;
  const [state, formAction, pending] = useActionState(updateStudioProfileAction, null);
  const [color, setColor] = useState(profile.brandColor ?? "#18181b");

  return (
    <div className="space-y-6">
      {/* Logo — centered on mobile */}
      <Field label={s.logoLabel}>
        <LogoUpload currentLogoUrl={profile.logoUrl} />
      </Field>

      <div className="border-t border-zinc-100 dark:border-zinc-700" />

      <form id="studio-branding-form" action={formAction} className="space-y-5">
        <input type="hidden" name="brandColor" value={color} />

        {/* Studio name — full width */}
        <Field label={s.studioNameLabel}>
          <input type="text" name="studioName" defaultValue={profile.studioName}
            placeholder={s.studioNamePlaceholder} required className={inputCls} />
        </Field>

        {/* Tagline — full width */}
        <Field label={s.taglineLabel}>
          <input type="text" name="tagline" defaultValue={profile.tagline ?? ""}
            placeholder={s.taglinePlaceholder} className={inputCls} />
        </Field>

        {/* Website + Phone — 2-col on desktop */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={s.websiteLabel}>
            <input type="url" name="website" defaultValue={profile.website ?? ""}
              placeholder={s.websitePlaceholder} className={inputCls} />
          </Field>

          <Field label={s.phoneLabel}>
            <input type="tel" name="phone" defaultValue={profile.phone ?? ""}
              placeholder={s.phonePlaceholder} className={inputCls} />
          </Field>
        </div>

        {/* Address — full width */}
        <Field label={s.addressLabel}>
          <input type="text" name="address" defaultValue={profile.address ?? ""}
            placeholder={s.addressPlaceholder} className={inputCls} />
        </Field>

        {/* Brand color with swatches */}
        <BrandColorPicker color={color} onChange={setColor} />

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {state.error}
          </p>
        )}

        {/* Sticky save bar on mobile */}
        <div
          className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t border-zinc-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/95 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:dark:bg-transparent"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {state && "success" in state && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.profile.saved}</span>
            )}
            <button type="submit" disabled={pending}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:flex-none sm:py-2">
              {pending ? t.profile.saving : s.saveButton}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
