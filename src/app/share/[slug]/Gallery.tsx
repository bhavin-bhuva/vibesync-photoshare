"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GridDensityControl, type GridDensity, useGridDensity } from "@/components/GridDensityControl";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { submitPhotoSelectionAction } from "./actions";
import { FindMyPhotosModal } from "./FindMyPhotosModal";
import { useInfoPanelState } from "@/hooks/useInfoPanelState";
import { LightboxInfoPanel } from "@/components/LightboxInfoPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GalleryPhoto {
  id: string;
  filename: string;
  size: number;
  createdAt: Date;
  groupId: string | null;
  width?: number | null;
  height?: number | null;
  exifCameraMake?: string | null;
  exifCameraModel?: string | null;
  exifFocalLength?: number | null;
  exifAperture?: number | null;
  exifShutterSpeed?: string | null;
  exifIso?: number | null;
  exifShootDate?: Date | null;
  thumbnailUrl: string | null; // grid cards — resized preview (~800 px)
  signedUrl: string | null;    // lightbox — large preview (~1920 px), not original
}

export interface GalleryGroup {
  id: string;
  name: string;
  color: string | null;
  photoCount: number;
}

type GalleryMode = "view" | "select";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const GRADIENTS = [
  "from-rose-300 to-orange-200",
  "from-sky-300 to-blue-200",
  "from-violet-300 to-purple-200",
  "from-emerald-300 to-teal-200",
  "from-amber-300 to-yellow-200",
  "from-pink-300 to-rose-200",
  "from-indigo-300 to-blue-200",
  "from-cyan-300 to-sky-200",
];
function cardGradient(id: string) { return GRADIENTS[id.charCodeAt(0) % GRADIENTS.length]; }

function selectionKey(slug: string)  { return `selection-${slug}`; }
function submittedKey(slug: string)  { return `submitted-${slug}`; }

function loadSavedIds(slug: string): Set<string> {
  try {
    const raw = localStorage.getItem(selectionKey(slug));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveIds(slug: string, ids: Set<string>) {
  try {
    localStorage.setItem(selectionKey(slug), JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

function wasSubmitted(slug: string): boolean {
  try { return sessionStorage.getItem(submittedKey(slug)) === "1"; }
  catch { return false; }
}

function markSubmitted(slug: string) {
  try { sessionStorage.setItem(submittedKey(slug), "1"); }
  catch { /* ignore */ }
}

function clearSubmitted(slug: string) {
  try { sessionStorage.removeItem(submittedKey(slug)); }
  catch { /* ignore */ }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4 animate-spin"} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Download helper ──────────────────────────────────────────────────────────

async function triggerDownload(slug: string, photoId: string, filename: string) {
  const res = await fetch(
    `/api/download/photo/${encodeURIComponent(photoId)}?slug=${encodeURIComponent(slug)}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Download failed.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Group filter bar ─────────────────────────────────────────────────────────

function GroupFilterBar({
  groups,
  activeGroupId,
  totalCount,
  onSelect,
  density,
  onDensityChange,
}: {
  groups: GalleryGroup[];
  activeGroupId: string | null;
  totalCount: number;
  onSelect: (groupId: string | null) => void;
  density: GridDensity;
  onDensityChange: (d: GridDensity) => void;
}) {
  const displayCount = activeGroupId
    ? (groups.find((g) => g.id === activeGroupId)?.photoCount ?? 0)
    : totalCount;

  return (
    <div className="mb-6">
      {/* Pills + density control row */}
      <div className="flex items-center gap-2">
      {/* Scrollable pill row — hide scrollbar on all browsers */}
      <div
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {/* All Photos */}
        <button
          onClick={() => onSelect(null)}
          className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 ${
            activeGroupId === null
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-600 dark:bg-transparent dark:text-zinc-400 dark:hover:border-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <span aria-hidden="true" className="text-[10px] leading-none">✦</span>
          All Photos
        </button>

        {/* Group pills */}
        {groups.map((group) => {
          const isActive = activeGroupId === group.id;
          const color = group.color ?? "#6366f1";
          return (
            <button
              key={group.id}
              onClick={() => onSelect(group.id)}
              style={
                isActive
                  ? { borderColor: color, backgroundColor: color, color: "#fff" }
                  : { borderColor: color, color }
              }
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-2 bg-white px-4 py-1.5 text-sm font-medium transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-transparent"
            >
              {group.name}
            </button>
          );
        })}
      </div>{/* end scrollable pills */}

        {/* Density control — fixed right */}
        <div className="shrink-0 pb-1">
          <GridDensityControl
            value={density}
            onChange={onDensityChange}
            hideMobile={["comfortable"]}
          />
        </div>
      </div>{/* end pills + density row */}

      {/* Photo count */}
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {displayCount.toLocaleString()} {displayCount === 1 ? "photo" : "photos"}
      </p>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  photos, index, slug, onClose, onGo, brandColor, group,
}: {
  photos: GalleryPhoto[];
  index: number;
  slug: string;
  onClose: () => void;
  onGo: (i: number) => void;
  brandColor?: string | null;
  group?: { name: string; color?: string | null } | null;
}) {
  const t = useT();
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [showInfo, toggleInfo] = useInfoPanelState();
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const swipeStart = useRef({ x: 0, y: 0 });
  const swipeActive = useRef(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const prev = useCallback(() => { if (hasPrev) { setDownloadError(""); onGo(index - 1); } }, [hasPrev, index, onGo]);
  const next = useCallback(() => { if (hasNext) { setDownloadError(""); onGo(index + 1); } }, [hasNext, index, onGo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  async function handleDownload(e?: React.MouseEvent) {
    e?.stopPropagation();
    setDownloading(true);
    setDownloadError("");
    try {
      await triggerDownload(slug, photo.id, photo.filename);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  function handleSwipeStart(e: React.PointerEvent) {
    if (!e.isPrimary) return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
    swipeActive.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleSwipeMove(e: React.PointerEvent) {
    if (!swipeActive.current || !e.isPrimary) return;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeOffset({ x: dx, y: 0 });
    } else if (dy > 0) {
      setSwipeOffset({ x: 0, y: dy });
    }
  }

  function handleSwipeEnd(e: React.PointerEvent) {
    if (!swipeActive.current || !e.isPrimary) return;
    swipeActive.current = false;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    setSwipeOffset({ x: 0, y: 0 });
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 10 && absDy < 10) return;
    if (absDx > 50 && absDx > absDy) { if (dx < 0) next(); else prev(); return; }
    if (dy > 80 && absDy > absDx) onClose();
  }

  const infoBtnStyle = showInfo
    ? (brandColor ? { backgroundColor: brandColor } : { backgroundColor: "rgba(255,255,255,0.15)" })
    : undefined;
  const infoBtnCls = `flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${
    showInfo ? "text-white" : "text-white/50 hover:bg-white/10 hover:text-white"
  }`;

  return createPortal(
    <div className="fixed inset-0 z-70 flex flex-col bg-black">

      {/* ── Mobile top bar ── */}
      <div
        className="flex shrink-0 items-center sm:hidden"
        style={{ height: "calc(56px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      >
        <div className="flex w-full items-center px-3">
          <button onClick={onClose} aria-label={t.lightbox.closeAriaLabel} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10">
            <XIcon />
          </button>
          <span className="flex-1 text-center text-sm tabular-nums text-white/70">
            {t.lightbox.counter(index + 1, photos.length)}
          </span>
          <button
            onClick={toggleInfo}
            title={showInfo ? "Hide details" : "Show details"}
            aria-label={showInfo ? "Hide details" : "Show details"}
            aria-pressed={showInfo}
            style={infoBtnStyle}
            className={infoBtnCls}
          >
            <InfoIcon />
          </button>
          <button
            onClick={() => handleDownload()}
            disabled={downloading}
            aria-label={t.common.download}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-50"
          >
            {downloading ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Desktop top bar ── */}
      <div className="hidden shrink-0 items-center justify-between px-4 py-3 sm:flex">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="shrink-0 tabular-nums text-white/50">
            {t.lightbox.counter(index + 1, photos.length)}
          </span>
          {group && (
            <>
              <span className="select-none text-white/30" aria-hidden="true">·</span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: group.color ?? "#6366f1" }}
                />
                <span className="truncate text-white/70">{group.name}</span>
              </span>
            </>
          )}
          <span className="select-none text-white/30" aria-hidden="true">·</span>
          <span className="shrink-0 text-white/50">
            {formatShortDate(photo.exifShootDate ?? photo.createdAt)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={toggleInfo}
            title={showInfo ? "Hide details" : "Show details"}
            aria-label={showInfo ? "Hide details" : "Show details"}
            aria-pressed={showInfo}
            style={infoBtnStyle}
            className={infoBtnCls}
          >
            <InfoIcon />
          </button>
          <button
            onClick={() => handleDownload()}
            disabled={downloading}
            aria-label={t.common.download}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {downloading ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
          </button>
          <button onClick={onClose} aria-label={t.lightbox.closeAriaLabel} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <XIcon />
          </button>
        </div>
      </div>

      {/* ── Main content area ── */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">

        {/* Image + swipe area */}
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center sm:px-16 sm:py-2"
          onPointerDown={handleSwipeStart}
          onPointerMove={handleSwipeMove}
          onPointerUp={handleSwipeEnd}
          onPointerCancel={() => { swipeActive.current = false; setSwipeOffset({ x: 0, y: 0 }); }}
        >
          <button onClick={prev} disabled={!hasPrev} aria-label={t.lightbox.prevAriaLabel} className="absolute left-5 z-10 hidden rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20 sm:block">
            <ChevronLeftIcon />
          </button>

          {photo.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.signedUrl}
              alt={photo.filename}
              className="max-h-full max-w-full object-contain sm:max-h-[calc(100vh-10rem)] sm:rounded-lg sm:shadow-2xl"
              draggable={false}
              style={{
                transform: `translate(${swipeOffset.x}px, ${swipeOffset.y}px)`,
                touchAction: "pinch-zoom",
                userSelect: "none",
              }}
            />
          ) : (
            <div className={`flex h-64 w-96 max-w-full items-center justify-center rounded-lg bg-gradient-to-br ${cardGradient(photo.id)}`}>
              <svg className="h-16 w-16 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          )}

          <button onClick={next} disabled={!hasNext} aria-label={t.lightbox.nextAriaLabel} className="absolute right-5 z-10 hidden rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20 sm:block">
            <ChevronRightIcon />
          </button>
        </div>

        {/* Mobile info panel — slides up from bottom */}
        <div
          className="shrink-0 overflow-hidden sm:hidden"
          style={{
            height: showInfo ? "40vh" : 0,
            transition: "height 200ms ease-out",
          }}
        >
          <div
            className="overflow-y-auto"
            style={{
              height: "40vh",
              transform: showInfo ? "translateY(0)" : "translateY(100%)",
              transition: "transform 200ms ease-out",
            }}
          >
            <LightboxInfoPanel
              filename={photo.filename}
              size={photo.size}
              createdAt={photo.createdAt}
              width={photo.width}
              height={photo.height}
              group={group}
              exifData={{
                cameraMake: photo.exifCameraMake,
                cameraModel: photo.exifCameraModel,
                focalLength: photo.exifFocalLength,
                aperture: photo.exifAperture,
                shutterSpeed: photo.exifShutterSpeed,
                iso: photo.exifIso,
              }}
              onDownload={() => handleDownload()}
              downloading={downloading}
            />
          </div>
        </div>

        {/* Desktop info panel — slides in from right */}
        <div
          className="hidden shrink-0 overflow-hidden border-l border-white/10 sm:block"
          style={{
            width: showInfo ? 260 : 0,
            transition: "width 200ms ease-out",
          }}
        >
          <div
            className="h-full overflow-y-auto"
            style={{
              width: 260,
              minWidth: 260,
              transform: showInfo ? "translateX(0)" : "translateX(260px)",
              transition: "transform 200ms ease-out",
            }}
          >
            <LightboxInfoPanel
              filename={photo.filename}
              size={photo.size}
              createdAt={photo.createdAt}
              width={photo.width}
              height={photo.height}
              group={group}
              exifData={{
                cameraMake: photo.exifCameraMake,
                cameraModel: photo.exifCameraModel,
                focalLength: photo.exifFocalLength,
                aperture: photo.exifAperture,
                shutterSpeed: photo.exifShutterSpeed,
                iso: photo.exifIso,
              }}
              onDownload={() => handleDownload()}
              downloading={downloading}
            />
          </div>
        </div>

      </div>

      {/* ── Desktop footer ── */}
      <div className="hidden shrink-0 items-center gap-3 px-6 py-3 sm:flex">
        {!showInfo && <span className="text-xs text-white/40">{formatBytes(photo.size)}</span>}
        {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}
      </div>
      <p className="hidden shrink-0 pb-3 text-center text-[11px] text-white/20 sm:block">{t.lightbox.hint}</p>

      {/* ── Mobile download error ── */}
      {downloadError && (
        <p className="shrink-0 bg-red-900/90 px-4 py-2 text-center text-xs text-red-200 sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {downloadError}
        </p>
      )}
    </div>,
    document.body
  );
}

// ─── Grid density classes ─────────────────────────────────────────────────────

const GRID_CLASSES: Record<GridDensity, string> = {
  comfortable: "grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2",
  default:     "grid gap-1 grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-[14px]",
  compact:     "grid gap-1 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  dense:       "grid gap-px grid-cols-3 sm:grid-cols-4 lg:grid-cols-6",
};

// ─── Group dot ────────────────────────────────────────────────────────────────

function GroupDot({ color, name }: { color: string; name: string }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="group/dot absolute bottom-2 left-2 z-10" role="tooltip" aria-label={name}>
      <div
        className="h-2 w-2 rounded-full shadow ring-1 ring-black/20"
        style={{ backgroundColor: color }}
      />
      {/* CSS tooltip — desktop only, no tooltip on mobile */}
      <div className="pointer-events-none absolute bottom-full left-0 mb-1 hidden whitespace-nowrap rounded-lg bg-zinc-900/90 px-2 py-1 text-xs text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover/dot:opacity-100 dark:bg-zinc-700/90 sm:block">
        {name}
      </div>
    </div>
  );
}

// ─── New badge ────────────────────────────────────────────────────────────────

function NewBadge({ createdAt }: { createdAt: Date }) {
  const isNew = Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;
  if (!isNew) return null;
  return (
    <div className="absolute right-1.5 top-1.5 z-10 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      New
    </div>
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo, slug, selectMode, isSelected, hasNote, onToggle, onOpen, onOpenNote,
  groupColor, groupName,
}: {
  photo: GalleryPhoto;
  slug: string;
  selectMode: boolean;
  isSelected: boolean;
  hasNote: boolean;
  groupColor: string | null;
  groupName: string | null;
  onToggle: () => void;
  onOpen: () => void;
  onOpenNote: () => void;
}) {
  const t = useT();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const gradient = cardGradient(photo.id);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(true);
    setDownloadError("");
    try {
      await triggerDownload(slug, photo.id, photo.filename);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  // In select mode: tapping a selected photo opens the note sheet; unselected → select
  const handleClick = selectMode ? (isSelected ? onOpenNote : onToggle) : onOpen;
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") handleClick();
  };

  return (
    <div
      className={`group overflow-hidden rounded-[4px] bg-zinc-100 ring-2 transition-shadow dark:bg-zinc-800 ${
        isSelected
          ? "ring-blue-500 shadow-lg shadow-blue-500/20"
          : "ring-zinc-200 hover:shadow-lg dark:ring-zinc-700 dark:hover:shadow-zinc-900/50"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        className={`relative block aspect-square w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
          selectMode ? "cursor-pointer" : "cursor-zoom-in"
        }`}
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-label={
          selectMode
            ? t.gallery.selectAriaLabel(isSelected, photo.filename)
            : t.photoGrid.previewAriaLabel(photo.filename)
        }
        aria-pressed={selectMode ? isSelected : undefined}
      >
        {photo.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.thumbnailUrl}
            alt={photo.filename}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <svg className="h-12 w-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          </div>
        )}

        {/* Select mode: checkbox overlay */}
        {selectMode && (
          <div className={`absolute inset-0 transition-colors duration-150 ${isSelected ? "bg-blue-500/10" : "bg-transparent group-hover:bg-black/10"}`}>
            <div
              className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-150 ${
                isSelected
                  ? "border-blue-500 bg-blue-500 opacity-100"
                  : "border-white/80 bg-black/20 opacity-0 group-hover:opacity-100"
              }`}
            >
              {isSelected && <CheckIcon className="h-3.5 w-3.5 text-white" />}
            </div>
            {/* Note indicator dot */}
            {isSelected && hasNote && (
              <div className="absolute bottom-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Zm3 1a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H5Zm0 4a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H5Z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* Group color dot */}
        {groupColor && groupName && (
          <GroupDot color={groupColor} name={groupName} />
        )}

        {/* New badge */}
        <NewBadge createdAt={photo.createdAt} />

        {/* View mode: hover download overlay */}
        {!selectMode && (
          <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/50 via-transparent to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              onClick={handleDownload}
              disabled={downloading}
              aria-label={t.gallery.downloadAriaLabel(photo.filename)}
              className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm backdrop-blur-sm transition-all hover:bg-white disabled:opacity-60"
            >
              {downloading ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <DownloadIcon className="h-3.5 w-3.5" />}
              {downloading ? t.common.downloadPreparing : t.common.download}
            </button>
          </div>
        )}

        {/* Download error overlay */}
        {downloadError && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-red-600/90 px-2 py-1 text-center text-[10px] text-white">
            {downloadError}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

export function Gallery({
  photos, slug, sharedLinkId, zipAllowed, faceSearchEnabled,
  groups = [],
  eventName = "",
  brandColor = null,
  serverDefaultDensity = "default",
}: {
  photos: GalleryPhoto[];
  slug: string;
  sharedLinkId: string;
  zipAllowed: boolean;
  faceSearchEnabled: boolean;
  groups?: GalleryGroup[];
  eventName?: string;
  brandColor?: string | null;
  serverDefaultDensity?: string;
}) {
  const t = useT();
  const [mode, setMode] = useState<GalleryMode>("view");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [zippingGroup, setZippingGroup] = useState(false);
  const [showZipPrompt, setShowZipPrompt] = useState(false);
  // Face search
  const [showFaceSearch, setShowFaceSearch] = useState(false);
  const [matchedPhotoIds, setMatchedPhotoIds] = useState<string[] | null>(null);
  // Group filter
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // Grid density — localStorage per gallery, falls back to photographer's server default
  const [density, setDensity] = useGridDensity(
    `grid-density-gallery-${slug}`,
    (serverDefaultDensity as GridDensity) ?? "default"
  );

  // Per-photo notes
  const [photoNotes, setPhotoNotes] = useState<Map<string, string>>(new Map());
  const [noteSheetPhotoId, setNoteSheetPhotoId] = useState<string | null>(null);
  const [noteSheetDraft, setNoteSheetDraft] = useState("");

  // Submission bar collapsed/expanded
  const [barExpanded, setBarExpanded] = useState(false);

  // Form fields for submission
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Hydrate state from storage + URL hash on mount (client-only)
  useEffect(() => {
    setSelectedIds(loadSavedIds(slug));
    if (wasSubmitted(slug)) setSubmitted(true);
    // Restore group filter from URL hash
    const hash = window.location.hash.slice(1);
    if (hash && groups.some((g) => g.id === hash)) {
      setActiveGroupId(hash);
    }
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIds(slug, next);
      return next;
    });
  }

  function switchMode(next: GalleryMode) {
    setMode(next);
    setLightboxIndex(null);
    setBarExpanded(false);
  }

  function handleGroupSelect(groupId: string | null) {
    setActiveGroupId(groupId);
    setLightboxIndex(null);
    // Update URL hash without triggering browser anchor scroll
    const newUrl =
      window.location.pathname +
      window.location.search +
      (groupId ? `#${groupId}` : "");
    history.replaceState(null, "", newUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDownloadAll() {
    if (!zipAllowed) { setShowZipPrompt(true); return; }
    setZipping(true);
    try {
      const res = await fetch(`/api/download/${slug}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setZipping(false);
    }
  }

  async function handleDownloadGroup(groupId: string) {
    if (!zipAllowed) { setShowZipPrompt(true); return; }
    setZippingGroup(true);
    try {
      const res = await fetch(`/api/download/${slug}?group=${encodeURIComponent(groupId)}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const group = groups.find((g) => g.id === groupId);
      const safe = (s: string) =>
        s.replace(/[^a-z0-9\s]/gi, "").trim().replace(/\s+/g, "-") || "photos";
      a.download = group
        ? `${safe(eventName)}-${safe(group.name)}.zip`
        : `${slug}-group.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setZippingGroup(false);
    }
  }

  async function handleSubmit() {
    setSubmitError("");
    if (!customerName.trim()) { setSubmitError(t.gallery.errorNoName); return; }
    if (selectedIds.size === 0) { setSubmitError(t.gallery.errorNoPhotos); return; }
    setSubmitting(true);
    const result = await submitPhotoSelectionAction(
      slug,
      sharedLinkId,
      [...selectedIds].map((photoId) => ({ photoId, note: photoNotes.get(photoId) ?? "" })),
      customerName,
      customerEmail,
      customerNote
    );
    setSubmitting(false);
    if ("error" in result) { setSubmitError(result.error); return; }
    saveIds(slug, new Set());
    markSubmitted(slug);
    setSelectedIds(new Set());
    setPhotoNotes(new Map());
    setBarExpanded(false);
    setSubmitted(true);
    setMode("view");
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-20 text-center dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-4xl">📷</p>
        <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.sharePage.noPhotos}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 px-4 py-20 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <svg className="h-16 w-16 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {t.gallery.thankYouTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {t.gallery.thankYouSubtitle}
          </p>
        </div>
        <button
          onClick={() => { clearSubmitted(slug); setSubmitted(false); setMode("view"); }}
          className="w-full max-w-xs rounded-lg border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {t.gallery.browseGallery}
        </button>
      </div>
    );
  }

  // Derived display list: group filter → face search filter (both can stack)
  const groupFilteredPhotos =
    activeGroupId !== null
      ? photos.filter((p) => p.groupId === activeGroupId)
      : photos;

  const displayPhotos =
    matchedPhotoIds !== null
      ? groupFilteredPhotos.filter((p) => matchedPhotoIds.includes(p.id))
      : groupFilteredPhotos;

  // Only show the filter bar when there are 2+ visible groups with photos
  const showGroupFilter = groups.length >= 2;
  const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null;

  return (
    <>
      {/* ── Face-search filter badge ── */}
      {matchedPhotoIds !== null && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 pl-3 pr-1.5 py-1 dark:bg-blue-950/60">
          <svg className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            {t.faceSearch.filteredBanner(matchedPhotoIds.length)}
          </span>
          <button
            onClick={() => setMatchedPhotoIds(null)}
            aria-label={t.faceSearch.clearFilter}
            className="flex h-5 w-5 items-center justify-center rounded-full text-blue-500 transition-colors hover:bg-blue-200 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900 dark:hover:text-blue-200"
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1.72 1.72a.75.75 0 0 1 1.06 0L6 4.94l3.22-3.22a.75.75 0 0 1 1.06 1.06L7.06 6l3.22 3.22a.75.75 0 0 1-1.06 1.06L6 7.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L4.94 6 1.72 2.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Group filter bar ── */}
      {showGroupFilter && (
        <GroupFilterBar
          groups={groups}
          activeGroupId={activeGroupId}
          totalCount={photos.length}
          onSelect={handleGroupSelect}
          density={density}
          onDensityChange={setDensity}
        />
      )}

      {/* ── Mode toggle + Download buttons bar ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Left: Mode pills + density control (density only shown here when no group filter bar) */}
        <div className="flex items-center gap-2 self-start">
        {/* Mode pills — desktop: shows both View/Select; mobile: only View pill (Select is FAB) */}
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800">
          <button
            onClick={() => switchMode("view")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "view"
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            }`}
          >
            {t.gallery.modeView}
          </button>
          {!submitted && (
            <button
              onClick={() => switchMode("select")}
              className={`hidden rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:block ${
                mode === "select"
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              {t.gallery.modeSelect}
              {selectedIds.size > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                  {selectedIds.size}
                </span>
              )}
            </button>
          )}
        </div>{/* end mode pills */}

          {/* Density control — only shown here when no group filter bar */}
          {!showGroupFilter && (
            <GridDensityControl
              value={density}
              onChange={setDensity}
              hideMobile={["comfortable"]}
            />
          )}
        </div>{/* end left: mode pills + density */}

        {/* Right-side action buttons (view mode) */}
        {mode === "view" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Find My Photos — desktop only; mobile uses FAB */}
            {faceSearchEnabled && (
              <button
                onClick={() => setShowFaceSearch(true)}
                className="hidden min-h-[48px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:flex sm:min-h-0"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                </svg>
                {t.faceSearch.buttonLabel}
              </button>
            )}

            {/* Download Group (only when a group filter is active) */}
            {activeGroup && (
              <button
                onClick={() => handleDownloadGroup(activeGroup.id)}
                disabled={zippingGroup}
                style={
                  zippingGroup
                    ? undefined
                    : { borderColor: activeGroup.color ?? "#6366f1", color: activeGroup.color ?? "#6366f1" }
                }
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border-2 bg-white px-4 py-2 text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-60 dark:bg-transparent sm:min-h-0"
              >
                {zippingGroup ? (
                  <><SpinnerIcon className="h-4 w-4 animate-spin" />{t.sharePage.downloadAllPreparing}</>
                ) : (
                  <>
                    <DownloadIcon className="h-4 w-4" />
                    Download {activeGroup.name}
                    <span className="text-xs opacity-70">
                      ({activeGroup.photoCount.toLocaleString()})
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Download All */}
            <button
              onClick={handleDownloadAll}
              disabled={zipping}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:min-h-0"
            >
              {zipping ? (
                <><SpinnerIcon className="h-4 w-4 animate-spin" />{t.sharePage.downloadAllPreparing}</>
              ) : (
                <>
                  {!zipAllowed && (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                    </svg>
                  )}
                  {zipAllowed && <DownloadIcon className="h-4 w-4" />}
                  {t.sharePage.downloadAll}
                </>
              )}
            </button>
          </div>
        )}

        {/* Clear selection (select mode) */}
        {mode === "select" && selectedIds.size > 0 && (
          <button
            onClick={() => { setSelectedIds(new Set()); saveIds(slug, new Set()); }}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {t.gallery.clearSelection}
          </button>
        )}
      </div>

      {/* ── Find My Photos FAB (mobile only, bottom-right) ── */}
      {faceSearchEnabled && mode === "view" && (
        <button
          onClick={() => setShowFaceSearch(true)}
          aria-label={t.faceSearch.buttonLabel}
          style={{
            backgroundColor: brandColor ?? "#2563eb",
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            right: "16px",
          }}
          className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-opacity hover:opacity-90 sm:hidden"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
          </svg>
        </button>
      )}

      {/* ── Select Photos FAB (mobile only, bottom-left) ── */}
      {!submitted && mode === "view" && (
        <button
          onClick={() => switchMode("select")}
          aria-label={t.gallery.modeSelect}
          style={{ bottom: "calc(16px + env(safe-area-inset-bottom))", left: "16px" }}
          className="fixed z-30 flex h-14 items-center gap-2 rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90 dark:bg-zinc-50 dark:text-zinc-900 sm:hidden"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
          {t.gallery.modeSelect}
          {selectedIds.size > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
              {selectedIds.size}
            </span>
          )}
        </button>
      )}

      {/* ZIP upgrade prompt */}
      {showZipPrompt && createPortal(
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowZipPrompt(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl dark:bg-zinc-800">
            <p className="text-2xl">🔒</p>
            <h2 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">{t.dashboard.upgrade.zipTitle}</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{t.dashboard.upgrade.zipBody}</p>
            <button onClick={() => setShowZipPrompt(false)} className="mt-6 w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700">
              {t.common.close}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Photo grid */}
      {displayPhotos.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-800">
          {matchedPhotoIds !== null ? (
            <>
              <p className="text-3xl">🔍</p>
              <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No matching photos found</p>
              <button
                onClick={() => setMatchedPhotoIds(null)}
                className="mt-3 text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                {t.faceSearch.viewAll}
              </button>
            </>
          ) : (
            <>
              <p className="text-3xl">📂</p>
              <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No photos in {activeGroup?.name ?? "this group"}
              </p>
              <button
                onClick={() => handleGroupSelect(null)}
                className="mt-3 text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
              >
                View all photos
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={GRID_CLASSES[density]}>
          {displayPhotos.map((photo, i) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              slug={slug}
              selectMode={mode === "select"}
              isSelected={selectedIds.has(photo.id)}
              hasNote={photoNotes.has(photo.id) && (photoNotes.get(photo.id) ?? "").length > 0}
              groupColor={photo.groupId ? (groupMap.get(photo.groupId)?.color ?? null) : null}
              groupName={photo.groupId ? (groupMap.get(photo.groupId)?.name ?? null) : null}
              onToggle={() => toggleSelect(photo.id)}
              onOpen={() => setLightboxIndex(i)}
              onOpenNote={() => {
                setNoteSheetPhotoId(photo.id);
                setNoteSheetDraft(photoNotes.get(photo.id) ?? "");
              }}
            />
          ))}
        </div>
      )}

      {/* Lightbox (view mode only) — indexes into displayPhotos */}
      {lightboxIndex !== null && mode === "view" && (
        <Lightbox
          photos={displayPhotos}
          index={lightboxIndex}
          slug={slug}
          onClose={() => setLightboxIndex(null)}
          onGo={setLightboxIndex}
          brandColor={brandColor}
          group={displayPhotos[lightboxIndex]?.groupId
            ? (groupMap.get(displayPhotos[lightboxIndex]!.groupId!) ?? null)
            : null}
        />
      )}

      {/* Find My Photos modal */}
      {showFaceSearch && (
        <FindMyPhotosModal
          slug={slug}
          totalPhotos={photos.length}
          onFilter={(ids) => setMatchedPhotoIds(ids)}
          onClose={() => setShowFaceSearch(false)}
        />
      )}

      {/* Sticky selection bar (select mode) */}
      {mode === "select" && createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto max-w-3xl px-4">
            {/* ── Collapsed bar: count + submit button ── */}
            {!barExpanded && (
              <div className="flex items-center gap-3 py-3">
                <button
                  onClick={() => setBarExpanded(true)}
                  className="flex-1 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {selectedIds.size === 0
                    ? t.gallery.noPhotosSelected
                    : t.gallery.photosSelected(selectedIds.size)}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || selectedIds.size === 0}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:hidden"
                >
                  {submitting && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                  {submitting ? t.gallery.submitting : t.gallery.submitButton}
                </button>
                {/* Desktop: show expand button */}
                <button
                  onClick={() => setBarExpanded(true)}
                  className="hidden rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:block"
                >
                  Add details
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || selectedIds.size === 0}
                  className="hidden items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:flex"
                >
                  {submitting && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                  {submitting ? t.gallery.submitting : t.gallery.submitButton}
                </button>
              </div>
            )}

            {/* ── Expanded bar: full inputs ── */}
            {barExpanded && (
              <div className="py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {selectedIds.size === 0
                      ? t.gallery.noPhotosSelected
                      : t.gallery.photosSelected(selectedIds.size)}
                  </p>
                  <button
                    onClick={() => setBarExpanded(false)}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    Collapse
                  </button>
                </div>

                {submitError && (
                  <p className="mb-2 text-xs text-red-500">{submitError}</p>
                )}

                <div className="flex flex-col gap-2 sm:grid sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {t.gallery.nameLabel} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={t.gallery.namePlaceholder}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {t.gallery.emailLabel} <span className="text-zinc-400">({t.common.optional})</span>
                    </label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder={t.gallery.emailPlaceholder}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {t.gallery.noteLabel} <span className="text-zinc-400">({t.common.optional})</span>
                    </label>
                    <div className="relative">
                      <textarea
                        value={customerNote}
                        onChange={(e) => setCustomerNote(e.target.value.slice(0, 300))}
                        placeholder={t.gallery.notePlaceholder}
                        rows={2}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                      />
                      <span className="absolute bottom-1.5 right-2 text-[10px] text-zinc-400">
                        {customerNote.length}/300
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || selectedIds.size === 0}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:ml-auto sm:w-auto sm:px-6"
                >
                  {submitting && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                  {submitting ? t.gallery.submitting : t.gallery.submitButton}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Per-photo note bottom sheet */}
      {noteSheetPhotoId !== null && createPortal(
        <div
          className="fixed inset-0 z-60 flex items-end sm:items-center sm:justify-center"
          onClick={() => setNoteSheetPhotoId(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full rounded-t-2xl bg-white px-4 pb-6 pt-5 shadow-2xl dark:bg-zinc-800 sm:max-w-sm sm:rounded-2xl"
            style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t.gallery.addPhotoNote}
            </p>
            <textarea
              value={noteSheetDraft}
              onChange={(e) => setNoteSheetDraft(e.target.value.slice(0, 200))}
              placeholder={t.gallery.notePlaceholder}
              rows={3}
              style={{ height: 100 }}
              className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500"
            />
            <p className="mb-4 mt-1 text-right text-[10px] text-zinc-400">{noteSheetDraft.length}/200</p>
            <button
              onClick={() => {
                const pid = noteSheetPhotoId;
                setPhotoNotes((prev) => {
                  const next = new Map(prev);
                  if (noteSheetDraft.trim()) next.set(pid, noteSheetDraft.trim());
                  else next.delete(pid);
                  return next;
                });
                setNoteSheetPhotoId(null);
              }}
              className="mb-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              {t.gallery.saveNote}
            </button>
            <button
              onClick={() => {
                const pid = noteSheetPhotoId;
                toggleSelect(pid);
                setPhotoNotes((prev) => { const next = new Map(prev); next.delete(pid); return next; });
                setNoteSheetPhotoId(null);
              }}
              className="w-full text-center text-sm font-medium text-red-500 hover:text-red-600"
            >
              {t.gallery.removeSelection}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
