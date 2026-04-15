"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Photo } from "@/generated/prisma/client";
import { deletePhotoAction, getPhotoLightboxUrl } from "./actions";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PhotoWithUrl = Photo & {
  thumbnailUrl: string | null; // grid cards — resized preview (~800 px)
  // lightbox URL is fetched lazily on demand — not pre-signed at page load
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
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

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  photos,
  index,
  onClose,
  onGo,
  signedUrl,
  isLoadingUrl,
}: {
  photos: PhotoWithUrl[];
  index: number;
  onClose: () => void;
  onGo: (i: number) => void;
  signedUrl: string | null;
  isLoadingUrl: boolean;
}) {
  const t = useT();
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const prev = useCallback(() => { if (hasPrev) onGo(index - 1); }, [hasPrev, index, onGo]);
  const next = useCallback(() => { if (hasNext) onGo(index + 1); }, [hasNext, index, onGo]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

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
        <span className="min-w-[3rem] text-sm tabular-nums text-white/50">
          {t.lightbox.counter(index + 1, photos.length)}
        </span>

        <p className="mx-4 max-w-xs truncate text-center text-sm font-medium text-white/80">
          {photo.filename}
        </p>

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
        <button
          onClick={prev}
          disabled={!hasPrev}
          aria-label={t.lightbox.prevAriaLabel}
          className="absolute left-3 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:pointer-events-none disabled:opacity-20 sm:left-5"
        >
          <ChevronLeftIcon />
        </button>

        <div className="flex max-h-full max-w-full items-center justify-center px-16 py-2">
          {isLoadingUrl ? (
            <svg
              className="h-10 w-10 animate-spin text-white/40"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
            </svg>
          ) : signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={signedUrl}
              alt={photo.filename}
              className="max-h-[calc(100vh-10rem)] max-w-full rounded-lg object-contain shadow-2xl"
              draggable={false}
            />
          ) : (
            <div
              className={`flex h-64 w-96 max-w-full items-center justify-center rounded-lg bg-gradient-to-br ${cardGradient(photo.id)}`}
            >
              <svg className="h-16 w-16 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          )}
        </div>

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
        <span className="text-xs text-white/40">{formatDate(photo.createdAt)}</span>
      </div>

      <p className="shrink-0 pb-3 text-center text-[11px] text-white/20">
        {t.lightbox.hint}
      </p>
    </div>,
    document.body
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  const t = useT();
  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-20 text-center dark:border-zinc-700 dark:bg-zinc-800">
      {/* Illustration */}
      <div className="mx-auto w-48">
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          {/* Background cards (stacked) */}
          <rect x="20" y="30" width="110" height="80" rx="10" className="fill-zinc-100 dark:fill-zinc-700" />
          <rect x="30" y="22" width="110" height="80" rx="10" className="fill-zinc-200 dark:fill-zinc-600" />

          {/* Main card */}
          <rect x="40" y="14" width="120" height="90" rx="10" className="fill-white dark:fill-zinc-700" />
          <rect x="40" y="14" width="120" height="90" rx="10" className="stroke-zinc-200 dark:stroke-zinc-600" strokeWidth="1.5" />

          {/* Camera body */}
          <rect x="68" y="36" width="64" height="46" rx="7" className="fill-zinc-100 dark:fill-zinc-600" />

          {/* Viewfinder notch */}
          <path d="M82 36 L86 28 H114 L118 36" className="fill-zinc-100 dark:fill-zinc-600" />

          {/* Lens ring */}
          <circle cx="100" cy="59" r="14" className="fill-zinc-200 dark:fill-zinc-500" />
          <circle cx="100" cy="59" r="10" className="fill-white dark:fill-zinc-400" />
          <circle cx="100" cy="59" r="6"  className="fill-zinc-300 dark:fill-zinc-500" />
          <circle cx="100" cy="59" r="2.5" className="fill-zinc-400 dark:fill-zinc-300" />

          {/* Flash dot */}
          <circle cx="122" cy="42" r="3" className="fill-zinc-300 dark:fill-zinc-400" />

          {/* Upload arrow */}
          <g className="translate-x-[130px] translate-y-[80px]">
            <circle cx="16" cy="16" r="16" className="fill-zinc-900 dark:fill-zinc-50" />
            <path d="M16 22V10M10 16l6-6 6 6" stroke="white" className="dark:stroke-zinc-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>

          {/* Bottom dots */}
          <circle cx="80" cy="120" r="4" className="fill-zinc-200 dark:fill-zinc-600" />
          <circle cx="100" cy="120" r="4" className="fill-zinc-900 dark:fill-zinc-50" />
          <circle cx="120" cy="120" r="4" className="fill-zinc-200 dark:fill-zinc-600" />
        </svg>
      </div>

      <p className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {t.common.noPhotosYet}
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        {t.photoGrid.emptySubtitle}
      </p>
    </div>
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  onDeleted,
  onOpen,
}: {
  photo: PhotoWithUrl;
  onDeleted: (id: string) => void;
  onOpen: () => void;
}) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const h = cardHeight(photo.id);
  const gradient = cardGradient(photo.id);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    const result = await deletePhotoAction(photo.id);
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
      setConfirmDelete(false);
    } else {
      onDeleted(photo.id);
    }
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 transition-opacity dark:bg-zinc-800 dark:ring-zinc-700 ${
        deleting ? "opacity-40" : ""
      }`}
    >
      {/* ── Image / placeholder — click opens lightbox ── */}
      {/* div instead of button because it contains interactive children (delete buttons) */}
      <div
        role="button"
        tabIndex={0}
        className="relative block w-full cursor-zoom-in overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
        style={{ height: h }}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
        aria-label={t.photoGrid.previewAriaLabel(photo.filename)}
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
            <div className="absolute inset-0 flex items-center justify-center opacity-25">
              <svg className="h-12 w-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          </div>
        )}

        {/* ── Hover overlay with delete button ── */}
        {!confirmDelete && (
          <div className="absolute inset-0 flex items-end justify-between bg-black/0 p-2 transition-colors group-hover:bg-black/30">
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              disabled={deleting}
              aria-label={t.photoGrid.deleteAriaLabel}
              className="translate-y-1 rounded-lg bg-white/10 p-1.5 text-white opacity-0 backdrop-blur-sm transition-all group-hover:translate-y-0 group-hover:opacity-100 hover:bg-red-500/80 disabled:pointer-events-none"
            >
              <TrashIcon />
            </button>
          </div>
        )}

        {/* ── Delete confirmation overlay ── */}
        {confirmDelete && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-medium text-white">{t.photoGrid.deleteConfirmTitle}</p>
            <p className="text-center text-xs text-white/70">{t.photoGrid.deleteConfirmSubtitle}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 disabled:opacity-50"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
                  </svg>
                ) : (
                  <TrashIcon />
                )}
                {deleting ? t.common.deleting : t.common.delete}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Metadata ── */}
      <div className="px-3 py-2.5">
        <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {photo.filename}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-400">{formatBytes(photo.size)}</span>
          <span className="text-xs text-zinc-400">{formatDate(photo.createdAt)}</span>
        </div>
        {deleteError && (
          <p className="mt-1 text-xs text-red-500">{deleteError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 24;

export function PhotoGrid({ photos: initial }: { photos: PhotoWithUrl[] }) {
  // allPhotos = full ordered list (rendered + pending).
  // visibleCount = how many cards are currently in the DOM.
  // renderedPhotos is derived so it never diverges from the two source values.
  const [allPhotos, setAllPhotos] = useState(initial);
  const [visibleCount, setVisibleCount] = useState(() => Math.min(BATCH_SIZE, initial.length));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxUrlLoading, setLightboxUrlLoading] = useState(false);
  // Cache signed URLs so navigating back to an already-opened photo is instant.
  const lightboxUrlCache = useRef(new Map<string, string>());
  // Track which photo id is the "current" pending fetch to discard stale responses.
  const pendingFetchId = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useT();

  const renderedPhotos = allPhotos.slice(0, visibleCount);
  const hasMore = visibleCount < allPhotos.length;

  // Sync new photos arriving from the server (e.g. after router.refresh() post-upload).
  // New photos are prepended and visibleCount is bumped so they appear immediately,
  // without waiting for the IntersectionObserver to fire.
  useEffect(() => {
    setAllPhotos((prev) => {
      const prevIds = new Set(prev.map((p) => p.id));
      const incoming = initial.filter((p) => !prevIds.has(p.id));
      if (incoming.length === 0) return prev;
      setVisibleCount((c) => c + incoming.length);
      return [...incoming, ...prev];
    });
  }, [initial]);

  // Append the next batch when the sentinel div scrolls into (or near) the viewport.
  // The effect re-runs whenever hasMore or the total count changes, which naturally
  // re-attaches the observer after each batch load.
  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + BATCH_SIZE, allPhotos.length));
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, allPhotos.length]);

  async function openLightbox(index: number) {
    const photo = renderedPhotos[index];
    setLightboxIndex(index);

    const cached = lightboxUrlCache.current.get(photo.id);
    if (cached) {
      setLightboxUrl(cached);
      setLightboxUrlLoading(false);
      pendingFetchId.current = null;
      return;
    }

    setLightboxUrl(null);
    setLightboxUrlLoading(true);
    pendingFetchId.current = photo.id;

    const result = await getPhotoLightboxUrl(photo.id);

    // Discard if the user has already navigated to a different photo.
    if (pendingFetchId.current !== photo.id) return;

    if ("url" in result && result.url) {
      lightboxUrlCache.current.set(photo.id, result.url);
      setLightboxUrl(result.url);
    }
    setLightboxUrlLoading(false);
    pendingFetchId.current = null;
  }

  function closeLightbox() {
    setLightboxIndex(null);
    setLightboxUrl(null);
    setLightboxUrlLoading(false);
    pendingFetchId.current = null;
  }

  function handleDeleted(id: string) {
    // Determine position in the full list and whether it was a rendered card.
    const deletedAt = allPhotos.findIndex((p) => p.id === id);
    const wasRendered = deletedAt !== -1 && deletedAt < visibleCount;

    setAllPhotos((prev) => prev.filter((p) => p.id !== id));

    if (wasRendered) {
      // Keep visibleCount in sync: one fewer rendered card.
      setVisibleCount((c) => c - 1);
      setLightboxIndex((idx) => {
        if (idx === null) return null;
        if (deletedAt === idx) {
          // The open photo was deleted — reset lightbox URL state too.
          setLightboxUrl(null);
          setLightboxUrlLoading(false);
          pendingFetchId.current = null;
          return null;
        }
        if (deletedAt < idx) return idx - 1; // deleted before current → shift
        return idx;
      });
    }

    router.refresh();
  }

  if (allPhotos.length === 0) return <EmptyState />;

  return (
    <>
      <div style={{ columns: "4 200px", gap: "14px" }}>
        {renderedPhotos.map((photo, i) => (
          <div key={photo.id} style={{ breakInside: "avoid", marginBottom: 14 }}>
            <PhotoCard
              photo={photo}
              onDeleted={handleDeleted}
              onOpen={() => openLightbox(i)}
            />
          </div>
        ))}
      </div>

      {/* ── Progressive-load footer ── */}
      {hasMore ? (
        // Sentinel: IntersectionObserver target. Also serves as the loading indicator
        // so the user sees feedback while the next batch is being appended.
        <div
          ref={sentinelRef}
          className="mt-6 flex items-center justify-center gap-2 py-4 text-sm text-zinc-400 dark:text-zinc-500"
        >
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
          </svg>
          {t.photoGrid.loadingMore}
        </div>
      ) : allPhotos.length > BATCH_SIZE ? (
        // Only show the completion message when we actually had multiple batches.
        <p className="mt-6 py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
          {t.photoGrid.allPhotosLoaded(allPhotos.length)}
        </p>
      ) : null}

      {lightboxIndex !== null && (
        <Lightbox
          photos={renderedPhotos}
          index={lightboxIndex}
          onClose={closeLightbox}
          onGo={openLightbox}
          signedUrl={lightboxUrl}
          isLoadingUrl={lightboxUrlLoading}
        />
      )}
    </>
  );
}
