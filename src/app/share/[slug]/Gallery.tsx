"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { submitPhotoSelectionAction } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GalleryPhoto {
  id: string;
  filename: string;
  size: number;
  thumbnailUrl: string | null; // grid cards — resized preview (~800 px)
  signedUrl: string | null;    // lightbox — large preview (~1920 px), not original
}

type GalleryMode = "view" | "select";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
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
const HEIGHTS = [180, 240, 200, 260, 160, 220, 290, 195, 250, 175, 235, 215];

function cardGradient(id: string) { return GRADIENTS[id.charCodeAt(0) % GRADIENTS.length]; }
function cardHeight(id: string)   { return HEIGHTS[id.charCodeAt(id.length - 1) % HEIGHTS.length]; }

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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  photos, index, slug, onClose, onGo,
}: {
  photos: GalleryPhoto[];
  index: number;
  slug: string;
  onClose: () => void;
  onGo: (i: number) => void;
}) {
  const t = useT();
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => { setDownloadError(""); }, [index]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const prev = useCallback(() => { if (hasPrev) onGo(index - 1); }, [hasPrev, index, onGo]);
  const next = useCallback(() => { if (hasNext) onGo(index + 1); }, [hasNext, index, onGo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex shrink-0 items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-[3rem] text-sm tabular-nums text-white/50">
          {t.lightbox.counter(index + 1, photos.length)}
        </span>
        <p className="mx-4 max-w-xs truncate text-center text-sm font-medium text-white/80">{photo.filename}</p>
        <button onClick={onClose} aria-label={t.lightbox.closeAriaLabel} className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
          <XIcon />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={prev} disabled={!hasPrev} aria-label={t.lightbox.prevAriaLabel} className="absolute left-3 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20 sm:left-5">
          <ChevronLeftIcon />
        </button>
        <div className="flex max-h-full max-w-full items-center justify-center px-16 py-2">
          {photo.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={photo.signedUrl} alt={photo.filename} className="max-h-[calc(100vh-10rem)] max-w-full rounded-lg object-contain shadow-2xl" draggable={false} />
          ) : (
            <div className={`h-64 w-96 max-w-full rounded-lg bg-gradient-to-br ${cardGradient(photo.id)} flex items-center justify-center`}>
              <svg className="h-16 w-16 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          )}
        </div>
        <button onClick={next} disabled={!hasNext} aria-label={t.lightbox.nextAriaLabel} className="absolute right-3 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20 sm:right-5">
          <ChevronRightIcon />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-between px-6 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-white/40">{formatBytes(photo.size)}</span>
        <div className="flex flex-col items-end gap-1">
          <button onClick={handleDownload} disabled={downloading} className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:opacity-60">
            {downloading ? <SpinnerIcon /> : <DownloadIcon />}
            {downloading ? t.common.downloadPreparing : t.common.download}
          </button>
          {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}
        </div>
      </div>

      <p className="shrink-0 pb-3 text-center text-[11px] text-white/20">{t.lightbox.hint}</p>
    </div>,
    document.body
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo, slug, selectMode, isSelected, onToggle, onOpen,
}: {
  photo: GalleryPhoto;
  slug: string;
  selectMode: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const h = cardHeight(photo.id);
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

  const handleClick = selectMode ? onToggle : onOpen;
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") handleClick();
  };

  return (
    <div
      className={`group overflow-hidden rounded-xl bg-white ring-2 transition-shadow dark:bg-zinc-800 ${
        isSelected
          ? "ring-blue-500 shadow-lg shadow-blue-500/20"
          : "ring-zinc-200 hover:shadow-lg dark:ring-zinc-700 dark:hover:shadow-zinc-900/50"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        className={`relative block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
          selectMode ? "cursor-pointer" : "cursor-zoom-in"
        }`}
        style={{ height: h }}
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
              className={`absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-150 ${
                isSelected
                  ? "border-blue-500 bg-blue-500"
                  : "border-white/80 bg-black/20 opacity-0 group-hover:opacity-100"
              }`}
            >
              {isSelected && <CheckIcon className="h-3.5 w-3.5 text-white" />}
            </div>
          </div>
        )}

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
      </div>

      {/* Metadata */}
      <div className="px-3 py-2.5">
        <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{photo.filename}</p>
        <span className="text-xs text-zinc-400">{formatBytes(photo.size)}</span>
        {downloadError && <p className="mt-1 text-xs text-red-500">{downloadError}</p>}
      </div>
    </div>
  );
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

export function Gallery({
  photos, slug, sharedLinkId, zipAllowed,
}: {
  photos: GalleryPhoto[];
  slug: string;
  sharedLinkId: string;
  zipAllowed: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<GalleryMode>("view");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [showZipPrompt, setShowZipPrompt] = useState(false);

  // Form fields for submission
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // submitted: persisted in sessionStorage so it survives a page refresh
  const [submitted, setSubmitted] = useState(false);

  // Hydrate state from storage on mount (client-only)
  useEffect(() => {
    setSelectedIds(loadSavedIds(slug));
    if (wasSubmitted(slug)) setSubmitted(true);
  }, [slug]);

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
    setLightboxIndex(null); // close lightbox when switching
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

  async function handleSubmit() {
    setSubmitError("");
    if (!customerName.trim()) { setSubmitError(t.gallery.errorNoName); return; }
    if (selectedIds.size === 0) { setSubmitError(t.gallery.errorNoPhotos); return; }
    setSubmitting(true);
    const result = await submitPhotoSelectionAction(
      slug,
      sharedLinkId,
      [...selectedIds].map((photoId) => ({ photoId, note: "" })),
      customerName,
      customerEmail,
      customerNote
    );
    setSubmitting(false);
    if ("error" in result) { setSubmitError(result.error); return; }
    // Clear selection from localStorage, mark submitted in sessionStorage
    saveIds(slug, new Set());
    markSubmitted(slug);
    setSelectedIds(new Set());
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

  // ── Full-screen thank-you state ──────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <svg className="h-10 w-10 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div className="max-w-sm">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {t.gallery.thankYouTitle}
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t.gallery.thankYouSubtitle}
          </p>
        </div>
        <button
          onClick={() => { clearSubmitted(slug); setSubmitted(false); setMode("view"); }}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {t.gallery.browseGallery}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ── Mode toggle + Download All bar ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {/* Mode pills */}
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
          {/* Select Photos hidden once submitted this session */}
          {!submitted && (
            <button
              onClick={() => switchMode("select")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
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
        </div>

        {/* Download All — only in view mode */}
        {mode === "view" && (
          <button
            onClick={handleDownloadAll}
            disabled={zipping}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
        )}

        {/* Clear selection — only in select mode */}
        {mode === "select" && selectedIds.size > 0 && (
          <button
            onClick={() => { setSelectedIds(new Set()); saveIds(slug, new Set()); }}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {t.gallery.clearSelection}
          </button>
        )}
      </div>

      {/* ZIP upgrade prompt */}
      {showZipPrompt && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
      <div style={{ columns: "3 240px", gap: "14px" }}>
        {photos.map((photo, i) => (
          <div key={photo.id} style={{ breakInside: "avoid", marginBottom: 14 }}>
            <PhotoCard
              photo={photo}
              slug={slug}
              selectMode={mode === "select"}
              isSelected={selectedIds.has(photo.id)}
              onToggle={() => toggleSelect(photo.id)}
              onOpen={() => setLightboxIndex(i)}
            />
          </div>
        ))}
      </div>

      {/* Lightbox (view mode only) */}
      {lightboxIndex !== null && mode === "view" && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          slug={slug}
          onClose={() => setLightboxIndex(null)}
          onGo={setLightboxIndex}
        />
      )}

      {/* ── Sticky selection bar (select mode) ── */}
      {mode === "select" && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95">
          <div className="mx-auto max-w-3xl px-4 py-4">

            {/* Count row */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {selectedIds.size === 0
                  ? t.gallery.noPhotosSelected
                  : t.gallery.photosSelected(selectedIds.size)}
              </p>
              {submitError && (
                <p className="text-xs text-red-500">{submitError}</p>
              )}
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t.gallery.nameLabel} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t.gallery.namePlaceholder}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
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
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t.gallery.noteLabel} <span className="text-zinc-400">({t.common.optional})</span>
                </label>
                <input
                  type="text"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder={t.gallery.notePlaceholder}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
                />
              </div>
            </div>

            {/* Submit button */}
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting || selectedIds.size === 0}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                {submitting ? t.gallery.submitting : t.gallery.submitButton}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
