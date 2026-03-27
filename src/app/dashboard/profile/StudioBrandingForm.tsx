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
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-600";

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
      // 1. Get presigned PUT URL
      const presigned = await getPresignedLogoUploadUrl(file.name, file.type);
      if ("error" in presigned) throw new Error(presigned.error);

      // 2. PUT to S3
      const res = await fetch(presigned.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);

      // 3. Save key to DB
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
    <div className="flex items-center gap-5">
      {/* Preview circle */}
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-700 dark:ring-zinc-600">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt="Studio logo" className="h-full w-full object-cover" />
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

      {/* Upload info */}
      <div className="space-y-2">
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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-zinc-400 to-zinc-600" style={{ aspectRatio: "16/9" }}>
        {/* Fake photo texture */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <svg className="h-16 w-16 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
            <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
          </svg>
        </div>

        {/* Watermark overlay */}
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
      {/* Live preview */}
      <WatermarkPreview
        studioName={profile.studioName}
        logoUrl={profile.logoUrl}
        position={position}
        opacity={opacity}
        enabled={enabled}
      />

      <form action={formAction} className="space-y-5">
        {/* Hidden fields carry the React-controlled values */}
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

        {/* Position picker */}
        <Field label={wm.positionLabel}>
          <div className="flex flex-col gap-2">
            {POSITIONS.map((pos) => (
              <label
                key={pos}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  !enabled ? "cursor-not-allowed opacity-40" : ""
                } ${
                  position === pos
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-400 dark:bg-zinc-700/60"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700/20 dark:hover:border-zinc-500 dark:hover:bg-zinc-700/40"
                }`}
              >
                <input
                  type="radio"
                  name="watermarkPositionRadio"
                  value={pos}
                  checked={position === pos}
                  disabled={!enabled}
                  onChange={() => setPosition(pos)}
                  className="h-4 w-4 shrink-0 accent-zinc-900 dark:accent-zinc-200"
                />
                <span className={`text-sm font-medium ${
                  position === pos
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}>
                  {wm.positions[pos]}
                </span>
              </label>
            ))}
          </div>
        </Field>

        {/* Opacity slider */}
        <Field label={`${wm.opacityLabel} — ${wm.opacityValue(opacity)}`}>
          <input
            type="range"
            min={10}
            max={80}
            step={5}
            value={opacity}
            disabled={!enabled}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full accent-zinc-900 disabled:opacity-40 dark:accent-zinc-50"
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

        <div className="flex items-center justify-end gap-3">
          {state && "success" in state && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.profile.saved}</span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? t.profile.saving : wm.saveButton}
          </button>
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
      {/* Logo */}
      <Field label={s.logoLabel}>
        <LogoUpload currentLogoUrl={profile.logoUrl} />
      </Field>

      <div className="border-t border-zinc-100 dark:border-zinc-700" />

      {/* Text fields */}
      <form action={formAction} className="space-y-5">
        {/* Hidden color value so it submits with the form */}
        <input type="hidden" name="brandColor" value={color} />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={s.studioNameLabel}>
            <input type="text" name="studioName" defaultValue={profile.studioName}
              placeholder={s.studioNamePlaceholder} required className={inputCls} />
          </Field>

          <Field label={s.taglineLabel}>
            <input type="text" name="tagline" defaultValue={profile.tagline ?? ""}
              placeholder={s.taglinePlaceholder} className={inputCls} />
          </Field>

          <Field label={s.websiteLabel}>
            <input type="url" name="website" defaultValue={profile.website ?? ""}
              placeholder={s.websitePlaceholder} className={inputCls} />
          </Field>

          <Field label={s.phoneLabel}>
            <input type="tel" name="phone" defaultValue={profile.phone ?? ""}
              placeholder={s.phonePlaceholder} className={inputCls} />
          </Field>
        </div>

        <Field label={s.addressLabel}>
          <input type="text" name="address" defaultValue={profile.address ?? ""}
            placeholder={s.addressPlaceholder} className={inputCls} />
        </Field>

        {/* Brand color */}
        <Field label={s.brandColorLabel}>
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-600">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer border-0 p-0 opacity-0"
              />
              <div className="h-full w-full rounded-lg" style={{ backgroundColor: color }} />
            </div>
            <span
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
              onClick={() => {
                const el = document.querySelector('input[type="color"]') as HTMLInputElement;
                el?.click();
              }}
            >
              {color}
            </span>
          </div>
        </Field>

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {state.error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          {state && "success" in state && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.profile.saved}</span>
          )}
          <button type="submit" disabled={pending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
            {pending ? t.profile.saving : s.saveButton}
          </button>
        </div>
      </form>
    </div>
  );
}
