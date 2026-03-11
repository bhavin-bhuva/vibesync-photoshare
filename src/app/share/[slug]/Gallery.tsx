"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GalleryPhoto {
  id: string;
  filename: string;
  size: number;
  signedUrl: string | null;
}

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

function cardGradient(id: string) {
  return GRADIENTS[id.charCodeAt(0) % GRADIENTS.length];
}
function cardHeight(id: string) {
  return HEIGHTS[id.charCodeAt(id.length - 1) % HEIGHTS.length];
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

// ─── Shared download logic ────────────────────────────────────────────────────

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
  photos,
  index,
  slug,
  onClose,
  onGo,
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

  // Reset error when photo changes
  useEffect(() => { setDownloadError(""); }, [index]);

  // Lock body scroll while lightbox is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const prev = useCallback(() => { if (hasPrev) onGo(index - 1); }, [hasPrev, index, onGo]);
  const next = useCallback(() => { if (hasNext) onGo(index + 1); }, [hasNext, index, onGo]);

  // Keyboard navigation
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
    // Backdrop — click to close
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* ── Top bar ── */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Counter */}
        <span className="min-w-[3rem] text-sm tabular-nums text-white/50">
          {t.lightbox.counter(index + 1, photos.length)}
        </span>

        {/* Filename */}
        <p className="mx-4 max-w-xs truncate text-center text-sm font-medium text-white/80">
          {photo.filename}
        </p>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label={t.lightbox.closeAriaLabel}
          className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <XIcon />
        </button>
      </div>

      {/* ── Image area ── */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous */}
        <button
          onClick={prev}
          disabled={!hasPrev}
          aria-label={t.lightbox.prevAriaLabel}
          className="absolute left-3 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20 sm:left-5"
        >
          <ChevronLeftIcon />
        </button>

        {/* Image */}
        <div className="flex max-h-full max-w-full items-center justify-center px-16 py-2">
          {photo.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.signedUrl}
              alt={photo.filename}
              className="max-h-[calc(100vh-10rem)] max-w-full rounded-lg object-contain shadow-2xl"
              draggable={false}
            />
          ) : (
            <div
              className={`h-64 w-96 max-w-full rounded-lg bg-gradient-to-br ${cardGradient(photo.id)} flex items-center justify-center`}
            >
              <svg className="h-16 w-16 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          )}
        </div>

        {/* Next */}
        <button
          onClick={next}
          disabled={!hasNext}
          aria-label={t.lightbox.nextAriaLabel}
          className="absolute right-3 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20 sm:right-5"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* ── Bottom bar ── */}
      <div
        className="flex shrink-0 items-center justify-between px-6 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-white/40">{formatBytes(photo.size)}</span>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:opacity-60"
          >
            {downloading ? <SpinnerIcon /> : <DownloadIcon />}
            {downloading ? t.common.downloadPreparing : t.common.download}
          </button>
          {downloadError && (
            <p className="text-xs text-red-400">{downloadError}</p>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      <p className="shrink-0 pb-3 text-center text-[11px] text-white/20">
        {t.lightbox.hint}
      </p>
    </div>,
    document.body
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  slug,
  onOpen,
}: {
  photo: GalleryPhoto;
  slug: string;
  onOpen: () => void;
}) {
  const t = useT();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const h = cardHeight(photo.id);
  const gradient = cardGradient(photo.id);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation(); // prevent opening the lightbox
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

  return (
    <div className="group overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 transition-shadow hover:shadow-lg dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:shadow-zinc-900/50">
      {/* Image / placeholder — entire area opens lightbox */}
      {/* div instead of button because it contains interactive children (download button) */}
      <div
        role="button"
        tabIndex={0}
        className="relative block w-full cursor-zoom-in overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
        style={{ height: h }}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
        aria-label={t.photoGrid.previewAriaLabel(photo.filename)}
      >
        {photo.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.signedUrl}
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

        {/* Hover overlay — download button */}
        <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/50 via-transparent to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            onClick={handleDownload}
            disabled={downloading}
            aria-label={`Download ${photo.filename}`}
            className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm backdrop-blur-sm transition-all hover:bg-white disabled:opacity-60"
          >
            {downloading ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <DownloadIcon className="h-3.5 w-3.5" />}
            {downloading ? t.common.downloadPreparing : t.common.download}
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="px-3 py-2.5">
        <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {photo.filename}
        </p>
        <span className="text-xs text-zinc-400">{formatBytes(photo.size)}</span>
        {downloadError && (
          <p className="mt-1 text-xs text-red-500">{downloadError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Gallery grid ─────────────────────────────────────────────────────────────

export function Gallery({ photos, slug, zipAllowed }: { photos: GalleryPhoto[]; slug: string; zipAllowed: boolean }) {
  const t = useT();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [showZipPrompt, setShowZipPrompt] = useState(false);

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

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-20 text-center dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-4xl">📷</p>
        <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.sharePage.noPhotos}</p>
      </div>
    );
  }

  return (
    <>
      {/* Download All button */}
      <div className="mb-5 flex justify-end">
        <button
          onClick={handleDownloadAll}
          disabled={zipping}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {zipping ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              {t.sharePage.downloadAllPreparing}
            </>
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

      {/* ZIP upgrade prompt */}
      {showZipPrompt && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowZipPrompt(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl dark:bg-zinc-800">
            <p className="text-2xl">🔒</p>
            <h2 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t.dashboard.upgrade.zipTitle}
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {t.dashboard.upgrade.zipBody}
            </p>
            <button
              onClick={() => setShowZipPrompt(false)}
              className="mt-6 w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {t.common.close}
            </button>
          </div>
        </div>,
        document.body
      )}

      <div style={{ columns: "3 240px", gap: "14px" }}>
        {photos.map((photo, i) => (
          <div key={photo.id} style={{ breakInside: "avoid", marginBottom: 14 }}>
            <PhotoCard
              photo={photo}
              slug={slug}
              onOpen={() => setLightboxIndex(i)}
            />
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          slug={slug}
          onClose={() => setLightboxIndex(null)}
          onGo={setLightboxIndex}
        />
      )}
    </>
  );
}
