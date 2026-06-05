"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventGallery, type UpdateEventGalleryData, type CustomThemeInput } from "@/app/dashboard/events/[id]/settings/actions";
import { previewGalleryExperience } from "@/app/dashboard/events/[id]/shared-links/customise/actions";
import { THEME_ACCESS, ANIMATION_ACCESS, type PlanTier } from "@/lib/plans";
import { useSettingsContext } from "@/components/settings/SettingsContext";
import { IconFilmstrip, ICON_MD } from "@/components/ui/icons";
import { buildCustomTheme, themeToCssVars } from "@/lib/gallery-theme";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventForGallery = {
  id: string;
  theme: string;
  customThemeData: CustomThemeInput | null;
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
  welcomeHeroPhotoId: string | null;
  introAnimation: string;
  showPhotoCount: boolean;
  showEventDate: boolean;
  galleryTitle: string | null;
  gallerySubtitle: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const THEMES = [
  { id: "minimal",   name: "Minimal",   bg: "#ffffff", text: "#18181b", accent: "#71717a", pro: false,
    desc: "Clean white, classic typography" },
  { id: "dark",      name: "Dark",      bg: "#18181b", text: "#fafafa", accent: "#a1a1aa", pro: false,
    desc: "Moody black, modern feel" },
  { id: "cinematic", name: "Cinematic", bg: "#1c1917", text: "#fef3c7", accent: "#d97706", pro: true,
    desc: "Warm dark, cinematic serif" },
  { id: "warm",      name: "Warm",      bg: "#fdf8f0", text: "#78350f", accent: "#c2410c", pro: true,
    desc: "Creamy warm, editorial" },
  { id: "custom",    name: "Custom",    bg: "#1a1a1a", text: "#f5f5f5", accent: "#6366f1", pro: true,
    desc: "Build your own look" },
] as const;

const DEFAULT_CUSTOM_THEME: CustomThemeInput = {
  bg:      '#1A1A1A',
  surface: '#242424',
  text:    '#F5F5F5',
  accent:  '#6366F1',
};

const HEX_RE = /^#[0-9a-fA-F]{0,6}$/;

function hexToRgbLocal(hex: string): { r: number; g: number; b: number } | null {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

function contrastRatio(hex1: string, hex2: string): number {
  function lum(hex: string) {
    const rgb = hexToRgbLocal(hex);
    if (!rgb) return 0;
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const l1 = lum(hex1), l2 = lum(hex2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getContrastTextLocal(hex: string): string {
  const rgb = hexToRgbLocal(hex);
  if (!rgb) return '#FFFFFF';
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 > 0.5 ? '#0A0A0A' : '#FFFFFF';
}

const ANIMATIONS = [
  { id: "none",       label: "None",        desc: "Photos appear instantly",                         pro: false,
    icon: "▪" },
  { id: "fade",       label: "Fade",        desc: "Photos gently fade into view",                    pro: false,
    icon: "◎" },
  { id: "reveal",     label: "Reveal",      desc: "Photos slide in from the edges",                  pro: true,
    icon: "↑" },
  { id: "typewriter", label: "Typewriter",  desc: "Your welcome message types itself out",           pro: true,
    icon: "⌨" },
  { id: "filmstrip",  label: "Filmstrip",   desc: "A cinematic scroll plays before the gallery",     pro: true,
    icon: "" },
] as const;

// ─── LockIcon ─────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={`h-5 w-9 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
        {/* Toggle knob — intentionally white on all themes */}
        <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </div>
      <div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        {description && <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{description}</p>}
      </div>
    </label>
  );
}

// ─── WelcomePreview (mini phone frame) ───────────────────────────────────────

function WelcomePreview({
  welcomeMessage,
  heroPhotoUrl,
  brandColor,
  theme,
  studioName,
}: {
  welcomeMessage: string;
  heroPhotoUrl: string | null;
  brandColor: string;
  theme: string;
  studioName: string;
}) {
  const isDark = theme === "dark" || theme === "cinematic";
  const isWarm = theme === "warm";
  const bg = isDark ? "#0a0a0a" : isWarm ? "#fdf8f0" : "#ffffff";
  const textColor = isDark || !!heroPhotoUrl ? "#ffffff" : isWarm ? "#2c1810" : "#0a0a0a";
  const muted = isDark || !!heroPhotoUrl ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.45)";

  // Container: 120px wide, phone aspect ~2:1 height
  const PHONE_W = 120;
  const PHONE_H = 213;
  const INNER_W = 360;
  const INNER_H = 640;
  const scale = PHONE_W / INNER_W;

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Preview</p>
      <div
        style={{
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: 14,
          border: "2px solid",
          borderColor: "var(--tw-border-opacity, rgba(0,0,0,0.15))",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        }}
        className="border-zinc-200 dark:border-zinc-700"
      >
        {/* Scaled inner */}
        <div
          style={{
            width: INNER_W,
            height: INNER_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
            background: heroPhotoUrl ? "transparent" : bg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "80px 32px 60px",
          }}
        >
          {/* Hero photo */}
          {heroPhotoUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroPhotoUrl}
                alt=""
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "cover",
                }}
              />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%)",
              }} />
            </>
          )}

          {/* Studio initials */}
          <div
            style={{
              position: "relative", zIndex: 1,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: brandColor, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "#fff",
            }}>
              {studioName.slice(0, 2).toUpperCase()}
            </div>
            <p style={{ color: muted, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>
              {studioName}
            </p>
          </div>

          {/* Welcome message */}
          <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: "90%" }}>
            {welcomeMessage ? (
              <p style={{
                color: textColor,
                fontSize: 20,
                lineHeight: 1.6,
                fontFamily: theme === "cinematic" || theme === "warm"
                  ? "'Playfair Display', Georgia, serif"
                  : "system-ui, sans-serif",
              }}>
                {welcomeMessage}
              </p>
            ) : (
              <p style={{ color: muted, fontSize: 16 }}>Welcome message appears here</p>
            )}
          </div>

          {/* CTA button */}
          <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ height: 1, width: 48, background: brandColor }} />
            <div style={{
              background: brandColor, color: "#fff",
              borderRadius: 9999, padding: "12px 32px",
              fontSize: 14, fontWeight: 600,
            }}>
              View Your Photos
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Welcome screen</p>
    </div>
  );
}

// ─── CustomThemeBuilder ───────────────────────────────────────────────────────

interface ColorRowProps {
  label: string;
  sublabel?: string;
  field: keyof CustomThemeInput;
  value: string;
  onChange: (field: keyof CustomThemeInput, val: string) => void;
  extra?: React.ReactNode;
}

function ColorRow({ label, sublabel, field, value, onChange, extra }: ColorRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-zinc-100 dark:border-zinc-700/60 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
        {sublabel && <p className="text-xs text-zinc-400 dark:text-zinc-500">{sublabel}</p>}
        {extra}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="color"
          value={value.length === 7 ? value : '#000000'}
          onChange={e => onChange(field, e.target.value)}
          className="w-10 h-10 rounded-lg cursor-pointer border border-zinc-200 dark:border-zinc-600"
          style={{ padding: '2px' }}
        />
        <input
          type="text"
          value={value}
          onChange={e => {
            if (HEX_RE.test(e.target.value)) onChange(field, e.target.value);
          }}
          className="font-mono text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 w-28 text-zinc-900 dark:text-zinc-100"
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function CustomThemeBuilder({
  value,
  onChange,
  brandColor,
}: {
  value: CustomThemeInput;
  onChange: (v: CustomThemeInput) => void;
  brandColor: string;
}) {
  function setField(field: keyof CustomThemeInput, val: string) {
    onChange({ ...value, [field]: val });
  }

  // Contrast checks (only when hex is complete)
  const isComplete = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex);
  const textOnBgRatio      = isComplete(value.text) && isComplete(value.bg)      ? contrastRatio(value.text, value.bg) : null;
  const textOnSurfaceRatio = isComplete(value.text) && isComplete(value.surface) ? contrastRatio(value.text, value.surface) : null;
  const accentTextColor    = isComplete(value.accent) ? getContrastTextLocal(value.accent) : '#FFFFFF';
  const accentTextRatio    = isComplete(value.accent) ? contrastRatio(accentTextColor, value.accent) : null;

  const warnings: string[] = [];
  if (textOnBgRatio !== null && textOnBgRatio < 3)      warnings.push('Text on background has low contrast');
  if (textOnSurfaceRatio !== null && textOnSurfaceRatio < 3) warnings.push('Text on surface has low contrast');
  if (accentTextRatio !== null && accentTextRatio < 3)  warnings.push('Button text on accent color has low contrast');

  // Live preview tokens
  const previewTokens = isComplete(value.bg) && isComplete(value.surface) && isComplete(value.text) && isComplete(value.accent)
    ? buildCustomTheme(value)
    : null;
  const previewVars = previewTokens ? themeToCssVars(previewTokens) : {};

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40 space-y-4">
      <div>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Custom Theme</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Build your own gallery look</p>
      </div>

      {/* Color pickers */}
      <div>
        <ColorRow
          label="Background"
          field="bg"
          value={value.bg}
          onChange={setField}
        />
        <ColorRow
          label="Surface"
          sublabel="Cards, modals, sheets"
          field="surface"
          value={value.surface}
          onChange={setField}
        />
        <ColorRow
          label="Text"
          field="text"
          value={value.text}
          onChange={setField}
        />
        <ColorRow
          label="Accent"
          sublabel="Buttons, highlights"
          field="accent"
          value={value.accent}
          onChange={setField}
          extra={
            <button
              type="button"
              className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              onClick={() => setField('accent', brandColor)}
            >
              Use studio brand color
            </button>
          }
        />
      </div>

      {/* Contrast warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 space-y-1">
          {warnings.map(w => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-400">⚠ {w} — text may be hard to read</p>
          ))}
        </div>
      )}

      {/* Live preview */}
      {previewTokens && (
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Preview</p>
          <div
            style={{
              ...previewVars,
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid var(--g-border)',
            }}
          >
            <div style={{ backgroundColor: 'var(--g-bg)', padding: '12px' }}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-2">
                <div style={{ width: 80, height: 8, borderRadius: 4, backgroundColor: 'var(--g-text)', opacity: 0.8 }} />
                <div style={{ width: 48, height: 24, borderRadius: 6, backgroundColor: 'var(--g-accent)' }} />
              </div>
              {/* Photo grid mockup */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{
                    aspectRatio: '1',
                    borderRadius: '4px',
                    backgroundColor: 'var(--g-surface)',
                    border: '1px solid var(--g-border)',
                  }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GalleryCustomisationSection({
  event,
  plan,
  brandColor,
  eventPhotos,
  eventTitle,
  studioName,
  firstLinkId,
}: {
  event: EventForGallery;
  plan: "FREE" | "PRO" | "STUDIO";
  brandColor: string;
  eventPhotos: { id: string; thumbnailUrl: string }[];
  eventTitle: string;
  studioName: string;
  firstLinkId: string | null;
}) {
  const router = useRouter();
  // Form state
  const [theme, setTheme] = useState(event.theme);
  const [customTheme, setCustomTheme] = useState<CustomThemeInput>(
    event.customThemeData ?? { ...DEFAULT_CUSTOM_THEME, accent: brandColor || DEFAULT_CUSTOM_THEME.accent }
  );
  const [welcomeEnabled, setWelcomeEnabled] = useState(event.welcomeEnabled);
  const [welcomeMessage, setWelcomeMessage] = useState(event.welcomeMessage ?? "");
  const [heroPhotoId, setHeroPhotoId] = useState<string | null>(event.welcomeHeroPhotoId);
  const [introAnimation, setIntroAnimation] = useState(event.introAnimation);
  const [showPhotoCount, setShowPhotoCount] = useState(event.showPhotoCount);
  const [showEventDate, setShowEventDate] = useState(event.showEventDate);
  const [galleryTitle, setGalleryTitle] = useState(event.galleryTitle ?? "");
  const [gallerySubtitle, setGallerySubtitle] = useState(event.gallerySubtitle ?? "");

  // Origin tracking for dirty state
  const [origTheme, setOrigTheme] = useState(event.theme);
  const [origCustomTheme, setOrigCustomTheme] = useState<CustomThemeInput>(
    event.customThemeData ?? { ...DEFAULT_CUSTOM_THEME, accent: brandColor || DEFAULT_CUSTOM_THEME.accent }
  );
  const [origWelcomeEnabled, setOrigWelcomeEnabled] = useState(event.welcomeEnabled);
  const [origWelcomeMessage, setOrigWelcomeMessage] = useState(event.welcomeMessage ?? "");
  const [origHeroPhotoId, setOrigHeroPhotoId] = useState<string | null>(event.welcomeHeroPhotoId);
  const [origIntroAnimation, setOrigIntroAnimation] = useState(event.introAnimation);
  const [origShowPhotoCount, setOrigShowPhotoCount] = useState(event.showPhotoCount);
  const [origShowEventDate, setOrigShowEventDate] = useState(event.showEventDate);
  const [origGalleryTitle, setOrigGalleryTitle] = useState(event.galleryTitle ?? "");
  const [origGallerySubtitle, setOrigGallerySubtitle] = useState(event.gallerySubtitle ?? "");

  const customThemeDirty = theme === 'custom' && (
    customTheme.bg !== origCustomTheme.bg ||
    customTheme.surface !== origCustomTheme.surface ||
    customTheme.text !== origCustomTheme.text ||
    customTheme.accent !== origCustomTheme.accent
  );

  const isDirty =
    theme !== origTheme ||
    customThemeDirty ||
    welcomeEnabled !== origWelcomeEnabled ||
    welcomeMessage !== origWelcomeMessage ||
    heroPhotoId !== origHeroPhotoId ||
    introAnimation !== origIntroAnimation ||
    showPhotoCount !== origShowPhotoCount ||
    showEventDate !== origShowEventDate ||
    galleryTitle !== origGalleryTitle ||
    gallerySubtitle !== origGallerySubtitle;

  const { setDirty, showToast } = useSettingsContext();

  // Report dirty state to shell
  useEffect(() => {
    setDirty("gallery", isDirty, "Gallery Customisation");
    return () => setDirty("gallery", false);
  }, [isDirty, setDirty]);

  const [isPending, startTransition] = useTransition();
  const [savedStatus, setSavedStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const heroPhoto = heroPhotoId ? eventPhotos.find((p) => p.id === heroPhotoId) : null;

  function handleSave() {
    if (!isDirty || isPending) return;
    setError(null);

    startTransition(async () => {
      const data: UpdateEventGalleryData = {
        theme,
        customThemeData: theme === 'custom' ? customTheme : null,
        welcomeEnabled,
        welcomeMessage: welcomeMessage.trim() || null,
        welcomeHeroPhotoId: heroPhotoId,
        introAnimation,
        showPhotoCount,
        showEventDate,
        galleryTitle: galleryTitle.trim() || null,
        gallerySubtitle: gallerySubtitle.trim() || null,
      };

      const result = await updateEventGallery(event.id, data);
      if (result.error) { setError(result.error); return; }

      // Update origins
      setOrigTheme(theme);
      if (theme === 'custom') setOrigCustomTheme(customTheme);
      setOrigWelcomeEnabled(welcomeEnabled);
      setOrigWelcomeMessage(welcomeMessage.trim());
      setOrigHeroPhotoId(heroPhotoId);
      setOrigIntroAnimation(introAnimation);
      setOrigShowPhotoCount(showPhotoCount);
      setOrigShowEventDate(showEventDate);
      setOrigGalleryTitle(galleryTitle.trim());
      setOrigGallerySubtitle(gallerySubtitle.trim());

      setSavedStatus("saved");
      router.refresh();
      showToast("Gallery settings saved");
      setTimeout(() => setSavedStatus("idle"), 2000);
    });
  }

  async function handlePreview() {
    if (!firstLinkId) return;
    setPreviewing(true);
    const result = await previewGalleryExperience(firstLinkId);
    setPreviewing(false);
    if ("error" in result) { setError(result.error); return; }
    window.open(result.previewUrl, "_blank", "noopener,noreferrer");
  }

  const availableThemes = THEME_ACCESS[plan as PlanTier];
  const availableAnimations = ANIMATION_ACCESS[plan as PlanTier];

  return (
    <div className="space-y-8">

      {/* ── 1. Theme ── */}
      <div>
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Theme</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => {
            const locked = !availableThemes.includes(t.id);
            const selected = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (locked) { setUpgradeNotice(true); return; }
                  setUpgradeNotice(false);
                  setTheme(t.id);
                }}
                className={`relative flex flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-all ${
                  selected
                    ? "border-indigo-500 shadow-sm"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                } ${locked ? "opacity-60" : ""}`}
              >
                {/* Color swatch */}
                <div className="flex h-10 w-full overflow-hidden rounded-lg" style={{ background: t.bg }}>
                  <div className="flex-1" style={{ background: t.bg }} />
                  <div className="w-1/4" style={{ background: t.text + "40" }} />
                  <div className="w-1/6 rounded-r-lg" style={{ background: t.accent }} />
                </div>
                <div className="w-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t.name}</span>
                    <div className="flex items-center gap-1">
                      {locked && <LockIcon />}
                      {selected && !locked && (
                        <svg className="h-3 w-3 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
        {upgradeNotice && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Cinematic, Warm, and Custom themes require PRO or STUDIO.{" "}
            <a href="/pricing" target="_blank" className="underline">View plans →</a>
          </p>
        )}

        {/* ── Custom theme builder ── */}
        {theme === 'custom' && (
          <CustomThemeBuilder
            value={customTheme}
            onChange={setCustomTheme}
            brandColor={brandColor}
          />
        )}
      </div>

      {/* ── 2. Welcome Screen ── */}
      <div>
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Welcome Screen</p>
        <div className="space-y-4">
          <Toggle
            checked={welcomeEnabled}
            onChange={setWelcomeEnabled}
            label="Enable welcome screen"
            description="Show a personalised message before the gallery loads"
          />

          {welcomeEnabled && (
            <div className="ml-0 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* Left: controls */}
                <div className="flex-1 space-y-4">
                  {/* Hero photo picker */}
                  {eventPhotos.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Hero photo <span className="font-normal text-zinc-400">(optional)</span>
                      </p>
                      <div className="grid grid-cols-6 gap-1.5">
                        {/* "None" option */}
                        <button
                          type="button"
                          onClick={() => setHeroPhotoId(null)}
                          className={`relative aspect-square overflow-hidden rounded-md border-2 transition-all ${
                            !heroPhotoId
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                              : "border-zinc-200 bg-zinc-100 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800"
                          }`}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-400 dark:text-zinc-500">
                            None
                          </span>
                        </button>

                        {eventPhotos.slice(0, 11).map((p) => {
                          const sel = heroPhotoId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setHeroPhotoId(sel ? null : p.id)}
                              className={`relative aspect-square overflow-hidden rounded-md border-2 transition-all ${
                                sel ? "border-indigo-500" : "border-transparent hover:border-zinc-300"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                              {sel && (
                                <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/30">
                                  <svg className="h-4 w-4 text-white drop-shadow" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Welcome message */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Welcome message
                      </label>
                      <span className={`text-[10px] ${welcomeMessage.length > 180 ? "text-amber-500" : "text-zinc-400"}`}>
                        {welcomeMessage.length}/200
                      </span>
                    </div>
                    <textarea
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value.slice(0, 200))}
                      placeholder="Write a personal message to your clients…"
                      rows={3}
                      className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                    />
                  </div>
                </div>

                {/* Right: live preview */}
                <WelcomePreview
                  welcomeMessage={welcomeMessage}
                  heroPhotoUrl={heroPhoto?.thumbnailUrl ?? null}
                  brandColor={brandColor}
                  theme={theme}
                  studioName={studioName}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Intro Animation ── */}
      <div>
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Intro Animation</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ANIMATIONS.map((a) => {
            const locked = !availableAnimations.includes(a.id);
            const selected = introAnimation === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  if (locked) { setUpgradeNotice(true); return; }
                  setUpgradeNotice(false);
                  setIntroAnimation(a.id);
                }}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                  selected
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                } ${locked ? "opacity-60" : ""}`}
              >
                {/* Icon area */}
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${
                    selected ? "bg-indigo-100 dark:bg-indigo-900/40" : "bg-zinc-100 dark:bg-zinc-800"
                  }`}
                >
                  {a.id === "filmstrip" ? <IconFilmstrip size={ICON_MD} className="text-current" aria-hidden="true" /> : a.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{a.label}</span>
                    {locked && <LockIcon />}
                    {selected && !locked && (
                      <svg className="h-3.5 w-3.5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500 leading-tight">{a.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
        {upgradeNotice && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Reveal, Typewriter, and Filmstrip require PRO or STUDIO.{" "}
            <a href="/pricing" target="_blank" className="underline">View plans →</a>
          </p>
        )}
      </div>

      {/* ── 4. Gallery Display ── */}
      <div>
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Gallery Display</p>
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Gallery title <span className="font-normal text-zinc-400">(default: event name)</span>
              </label>
              <input
                type="text"
                value={galleryTitle}
                onChange={(e) => setGalleryTitle(e.target.value)}
                placeholder={eventTitle}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Gallery subtitle</label>
              <input
                type="text"
                value={gallerySubtitle}
                onChange={(e) => setGallerySubtitle(e.target.value)}
                placeholder="Optional subtitle"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <Toggle
              checked={showPhotoCount}
              onChange={setShowPhotoCount}
              label="Show photo count"
            />
            <Toggle
              checked={showEventDate}
              onChange={setShowEventDate}
              label="Show event date"
            />
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-col gap-3 sm:flex-row">
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
            "Save Gallery Settings"
          )}
        </button>

        {/* ── 5. Preview ── */}
        <button
          type="button"
          onClick={handlePreview}
          disabled={!firstLinkId || previewing}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 sm:w-auto"
          title={!firstLinkId ? "Create a shared link first to preview" : undefined}
        >
          {previewing ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41Z" clipRule="evenodd" />
            </svg>
          )}
          Preview Gallery Experience
        </button>
      </div>

      {!firstLinkId && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Create a shared link to enable the gallery preview.
        </p>
      )}
    </div>
  );
}
