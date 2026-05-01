"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Photo } from "@/generated/prisma/client";
import { deletePhotoAction, getPhotoLightboxUrl, bulkDeletePhotosAction } from "./actions";
import { assignPhotosToGroup, assignAllUngroupedToGroup } from "./groups/actions";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupOption = {
  id: string;
  name: string;
  color: string | null;
};

// Extended type used by the filter bar — includes visibility and count from DB
export type GroupFilterOption = GroupOption & {
  isVisible: boolean;
  photoCount: number;
};

export type PhotoWithUrl = Photo & {
  thumbnailUrl: string | null;
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

function showToast(message: string, ok = true) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("photoshare:toast", {
      detail: { message, type: ok ? "success" : "error" },
    })
  );
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

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
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

function XIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function SpinnerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Inline toast ─────────────────────────────────────────────────────────────

function Toast({
  message,
  ok,
  onDone,
}: {
  message: string;
  ok: boolean;
  onDone: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [onDone]);

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
        ok ? "bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900" : "bg-red-600"
      }`}
    >
      {message}
    </div>,
    document.body
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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

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
          {isLoadingUrl ? (
            <SpinnerIcon className="h-10 w-10 text-white/40" />
          ) : signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={signedUrl} alt={photo.filename} className="max-h-[calc(100vh-10rem)] max-w-full rounded-lg object-contain shadow-2xl" draggable={false} />
          ) : (
            <div className={`flex h-64 w-96 max-w-full items-center justify-center rounded-lg bg-gradient-to-br ${cardGradient(photo.id)}`}>
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
        <span className="text-xs text-white/40">{formatDate(photo.createdAt)}</span>
      </div>
      <p className="shrink-0 pb-3 text-center text-[11px] text-white/20">{t.lightbox.hint}</p>
    </div>,
    document.body
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyState() {
  const t = useT();
  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-20 text-center dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mx-auto w-48">
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <rect x="20" y="30" width="110" height="80" rx="10" className="fill-zinc-100 dark:fill-zinc-700" />
          <rect x="30" y="22" width="110" height="80" rx="10" className="fill-zinc-200 dark:fill-zinc-600" />
          <rect x="40" y="14" width="120" height="90" rx="10" className="fill-white dark:fill-zinc-700" />
          <rect x="40" y="14" width="120" height="90" rx="10" className="stroke-zinc-200 dark:stroke-zinc-600" strokeWidth="1.5" />
          <rect x="68" y="36" width="64" height="46" rx="7" className="fill-zinc-100 dark:fill-zinc-600" />
          <path d="M82 36 L86 28 H114 L118 36" className="fill-zinc-100 dark:fill-zinc-600" />
          <circle cx="100" cy="59" r="14" className="fill-zinc-200 dark:fill-zinc-500" />
          <circle cx="100" cy="59" r="10" className="fill-white dark:fill-zinc-400" />
          <circle cx="100" cy="59" r="6" className="fill-zinc-300 dark:fill-zinc-500" />
          <circle cx="100" cy="59" r="2.5" className="fill-zinc-400 dark:fill-zinc-300" />
          <circle cx="122" cy="42" r="3" className="fill-zinc-300 dark:fill-zinc-400" />
          <g className="translate-x-[130px] translate-y-[80px]">
            <circle cx="16" cy="16" r="16" className="fill-zinc-900 dark:fill-zinc-50" />
            <path d="M16 22V10M10 16l6-6 6 6" stroke="white" className="dark:stroke-zinc-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <circle cx="80" cy="120" r="4" className="fill-zinc-200 dark:fill-zinc-600" />
          <circle cx="100" cy="120" r="4" className="fill-zinc-900 dark:fill-zinc-50" />
          <circle cx="120" cy="120" r="4" className="fill-zinc-200 dark:fill-zinc-600" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t.common.noPhotosYet}</p>
      <p className="mt-1 text-sm text-zinc-400">{t.photoGrid.emptySubtitle}</p>
    </div>
  );
}

function FilterEmptyState({ groupName }: { groupName: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-800">
      <svg className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
      <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        No loaded photos in <span className="font-semibold">{groupName}</span>
      </p>
      <p className="mt-1 text-xs text-zinc-400">Scroll down to load more, or try a different filter.</p>
    </div>
  );
}

// ─── Group filter bar ─────────────────────────────────────────────────────────

function GroupFilterBar({
  groups,
  ungroupedCount,
  totalPhotoCount,
  activeFilter,
  onFilterChange,
}: {
  groups: GroupFilterOption[];
  ungroupedCount: number;
  totalPhotoCount: number;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}) {
  const pillBase =
    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";
  const inactiveCls =
    "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700";
  const activeNeutralCls =
    "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900";

  // Compute the accurate DB-driven count for the active filter
  const activeFilterCount = (() => {
    if (activeFilter === "all") return totalPhotoCount;
    if (activeFilter === "ungrouped") return ungroupedCount;
    return groups.find((g) => g.id === activeFilter)?.photoCount ?? 0;
  })();

  const badgeCls = (isActive: boolean) =>
    `rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
      isActive
        ? "bg-white/20 text-white dark:bg-black/20 dark:text-inherit"
        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
    }`;

  return (
    <div className="mb-5">
      {/* Horizontally scrollable pill row */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "thin" }}
      >
        {/* All Photos */}
        <button
          onClick={() => onFilterChange("all")}
          className={`${pillBase} ${activeFilter === "all" ? activeNeutralCls : inactiveCls}`}
        >
          All Photos
          <span className={badgeCls(activeFilter === "all")}>
            {totalPhotoCount.toLocaleString()}
          </span>
        </button>

        {/* Group pills */}
        {groups.map((group) => {
          const isActive = activeFilter === group.id;
          const color = group.color ?? "#6366f1";
          return (
            <button
              key={group.id}
              onClick={() => onFilterChange(group.id)}
              style={isActive ? { backgroundColor: color, borderColor: color } : undefined}
              className={`${pillBase} ${isActive ? "text-white" : inactiveCls} ${!group.isVisible ? "opacity-60" : ""}`}
            >
              {/* Color dot */}
              <span
                className="h-2 w-2 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: isActive ? "rgba(255,255,255,0.5)" : color }}
              />
              {/* Name — strikethrough when hidden */}
              <span className={!group.isVisible ? "line-through decoration-current" : ""}>
                {group.name}
              </span>
              {/* Eye-slash icon for hidden groups */}
              {!group.isVisible && (
                <svg className="h-3 w-3 shrink-0 opacity-60" viewBox="0 0 20 20" fill="currentColor" aria-label="Hidden group">
                  <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.091a4 4 0 0 0-5.557-5.556Z" clipRule="evenodd" />
                  <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.185A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
                </svg>
              )}
              <span className={badgeCls(isActive)}>
                {group.photoCount.toLocaleString()}
              </span>
            </button>
          );
        })}

        {/* Ungrouped pill */}
        <button
          onClick={() => onFilterChange("ungrouped")}
          className={`${pillBase} ${activeFilter === "ungrouped" ? activeNeutralCls : inactiveCls}`}
        >
          Ungrouped
          <span className={badgeCls(activeFilter === "ungrouped")}>
            {ungroupedCount.toLocaleString()}
          </span>
        </button>
      </div>

      {/* "Showing X of Y" — only when a filter is active */}
      {activeFilter !== "all" && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Showing{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {activeFilterCount.toLocaleString()}
          </span>{" "}
          of {totalPhotoCount.toLocaleString()} photos
        </p>
      )}
    </div>
  );
}

// ─── Assign-all-ungrouped banner ──────────────────────────────────────────────

function AssignAllBanner({
  count,
  groups,
  loading,
  onAssign,
}: {
  count: number;
  groups: GroupFilterOption[];
  loading: boolean;
  onAssign: (groupId: string, groupName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
      <span className="text-amber-800 dark:text-amber-300">
        <span className="font-medium">
          {count.toLocaleString()} ungrouped {count === 1 ? "photo" : "photos"}
        </span>
        {" "}— assign all to a group?
      </span>

      <div className="relative" ref={ref}>
        {loading ? (
          <SpinnerIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              Assign all to…
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            {open && (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setOpen(false);
                      onAssign(g.id, g.name);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color ?? "#6366f1" }}
                    />
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Group dot ────────────────────────────────────────────────────────────────

function GroupDot({ color, name }: { color: string; name: string }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="group/dot absolute bottom-2 left-2 z-10" role="tooltip" aria-label={name}>
      <div
        className="h-3 w-3 rounded-full shadow ring-1 ring-black/20"
        style={{ backgroundColor: color }}
      />
      {/* CSS tooltip */}
      <div className="pointer-events-none absolute bottom-full left-0 mb-1 whitespace-nowrap rounded-lg bg-zinc-900/90 px-2 py-1 text-xs text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover/dot:opacity-100 dark:bg-zinc-700/90">
        {name}
      </div>
    </div>
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  selectionMode,
  isSelected,
  onToggleSelect,
  groupColor,
  groupName,
  onDeleted,
  onOpen,
}: {
  photo: PhotoWithUrl;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (shiftKey: boolean) => void;
  groupColor: string | null;
  groupName: string | null;
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

  // In selection mode, clicking the card toggles selection
  function handleAreaClick(e: React.MouseEvent) {
    if (selectionMode) {
      onToggleSelect(e.shiftKey);
    } else {
      onOpen();
    }
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-xl bg-white ring-1 transition-all dark:bg-zinc-800 ${
        deleting ? "opacity-40" : ""
      } ${
        isSelected
          ? "ring-2 ring-indigo-500 dark:ring-indigo-400"
          : "ring-zinc-200 dark:ring-zinc-700"
      }`}
    >
      {/* ── Image area ── */}
      <div
        role="button"
        tabIndex={0}
        className={`relative block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
          selectionMode ? "cursor-pointer" : "cursor-zoom-in"
        }`}
        style={{ height: h }}
        onClick={handleAreaClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            selectionMode ? onToggleSelect(false) : onOpen();
          }
        }}
        aria-label={
          selectionMode
            ? `${isSelected ? "Deselect" : "Select"} ${photo.filename}`
            : t.photoGrid.previewAriaLabel(photo.filename)
        }
        aria-pressed={selectionMode ? isSelected : undefined}
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

        {/* ── Selection overlay / checkbox ── */}
        {selectionMode && (
          <>
            {!isSelected && (
              <div className="absolute inset-0 bg-black/10 transition-colors" />
            )}
            {isSelected && (
              <div className="absolute inset-0 bg-indigo-500/20 transition-colors" />
            )}
            <div className="absolute left-2 top-2 z-10">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 shadow ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-white/80 bg-black/20 text-white backdrop-blur-sm"
                }`}
              >
                {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
              </div>
            </div>
          </>
        )}

        {/* ── Group color dot ── */}
        {groupColor && groupName && (
          <GroupDot color={groupColor} name={groupName} />
        )}

        {/* ── Hover overlay + delete button (normal mode only) ── */}
        {!selectionMode && !confirmDelete && (
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
        {!selectionMode && confirmDelete && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-medium text-white">{t.photoGrid.deleteConfirmTitle}</p>
            <p className="text-center text-xs text-white/70">{t.photoGrid.deleteConfirmSubtitle}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 disabled:opacity-50">
                {t.common.cancel}
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50">
                {deleting ? <SpinnerIcon className="h-3 w-3" /> : <TrashIcon />}
                {deleting ? t.common.deleting : t.common.delete}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Metadata ── */}
      <div className="px-3 py-2.5">
        <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{photo.filename}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-400">{formatBytes(photo.size)}</span>
          <span className="text-xs text-zinc-400">{formatDate(photo.createdAt)}</span>
        </div>
        {deleteError && <p className="mt-1 text-xs text-red-500">{deleteError}</p>}
      </div>
    </div>
  );
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

function BulkActionBar({
  count,
  groups,
  loading,
  onAssign,
  onRemoveGroup,
  onBulkDelete,
  onExit,
}: {
  count: number;
  groups: GroupFilterOption[];
  loading: boolean;
  onAssign: (groupId: string, groupName: string) => void;
  onRemoveGroup: () => void;
  onBulkDelete: () => void;
  onExit: () => void;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!assignOpen) return;
    function handle(e: MouseEvent) {
      if (!assignRef.current?.contains(e.target as Node)) setAssignOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [assignOpen]);

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-2xl backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        {/* Left: count + exit */}
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            aria-label="Exit selection mode"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <XIcon className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {count} {count === 1 ? "photo" : "photos"} selected
          </span>
        </div>

        {/* Right: actions */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <SpinnerIcon className="h-4 w-4" />
            Working…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* Assign Group dropdown */}
            <div className="relative" ref={assignRef}>
              <button
                onClick={() => { setAssignOpen((v) => !v); setDeleteStep(false); }}
                disabled={groups.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Assign Group
                <svg className="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {assignOpen && (
                <div className="absolute bottom-full right-0 mb-2 min-w-[180px] rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      onClick={() => {
                        setAssignOpen(false);
                        onAssign(g.id, g.name);
                      }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: g.color ?? "#6366f1" }}
                      />
                      <span className="flex-1 truncate">{g.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Remove Group */}
            <button
              onClick={() => { onRemoveGroup(); setDeleteStep(false); }}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Remove Group
            </button>

            {/* Delete — two-step */}
            {deleteStep ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 dark:border-red-800 dark:bg-red-950/40">
                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                  Delete {count}?
                </span>
                <button
                  onClick={() => setDeleteStep(false)}
                  className="ml-1 text-xs text-red-500 underline hover:text-red-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setDeleteStep(false); onBulkDelete(); }}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  Confirm
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteStep(true)}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 24;

export function PhotoGrid({
  photos: initial,
  groups = [],
  eventId,
  ungroupedCount = 0,
  totalPhotoCount,
  initialGroupFilter = "all",
  onLightboxChange,
}: {
  photos: PhotoWithUrl[];
  groups?: GroupFilterOption[];
  eventId: string;
  ungroupedCount?: number;
  totalPhotoCount?: number;
  initialGroupFilter?: string;
  onLightboxChange?: (isOpen: boolean) => void;
}) {
  const [allPhotos, setAllPhotos] = useState(initial);
  const [visibleCount, setVisibleCount] = useState(() => Math.min(BATCH_SIZE, initial.length));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxUrlLoading, setLightboxUrlLoading] = useState(false);
  const lightboxUrlCache = useRef(new Map<string, string>());
  const pendingFetchId = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useT();

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [activeGroupFilter, setActiveGroupFilter] = useState(initialGroupFilter);

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Toast state ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

  // ── Group lookup map ─────────────────────────────────────────────────────────
  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  );

  // ── Filtered photos ──────────────────────────────────────────────────────────
  const filteredPhotos = useMemo(() => {
    if (activeGroupFilter === "all") return allPhotos;
    if (activeGroupFilter === "ungrouped") return allPhotos.filter((p) => !p.groupId);
    return allPhotos.filter((p) => p.groupId === activeGroupFilter);
  }, [allPhotos, activeGroupFilter]);

  const renderedPhotos = filteredPhotos.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPhotos.length;

  // ── Derived totals for the header ────────────────────────────────────────────
  const effectiveTotalPhotoCount = totalPhotoCount ?? allPhotos.length;

  // ── Sync incoming photos (post-upload router.refresh) ────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const prevIds = new Set(allPhotos.map((p) => p.id));
    const incoming = initial.filter((p) => !prevIds.has(p.id));
    if (incoming.length === 0) return;
    setAllPhotos((prev) => [...incoming, ...prev]);
    setVisibleCount((c) => c + incoming.length);
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Progressive loading sentinel ─────────────────────────────────────────────
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

  // ── Selection helpers ────────────────────────────────────────────────────────

  function enterSelectionMode() {
    if (lightboxIndex !== null) closeLightbox();
    setSelectionMode(true);
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    lastClickedIndexRef.current = null;
  }

  // ── Escape key: exit selection mode ──────────────────────────────────────────
  useEffect(() => {
    if (!selectionMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && lightboxIndex === null) exitSelectionMode();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionMode, lightboxIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter change — update state and URL ─────────────────────────────────────
  function handleFilterChange(filter: string) {
    setActiveGroupFilter(filter);
    // Exit selection mode when switching filters
    if (selectionMode) exitSelectionMode();

    const params = new URLSearchParams(window.location.search);
    if (filter === "all") {
      params.delete("group");
    } else {
      params.set("group", filter);
    }
    const qs = params.toString();
    router.replace(
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
      { scroll: false }
    );
  }

  function toggleSelect(index: number, shiftKey: boolean) {
    const photoId = renderedPhotos[index].id;

    if (shiftKey && lastClickedIndexRef.current !== null) {
      const from = Math.min(lastClickedIndexRef.current, index);
      const to = Math.max(lastClickedIndexRef.current, index);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(renderedPhotos[i].id);
        return next;
      });
    } else {
      lastClickedIndexRef.current = index;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(photoId)) next.delete(photoId);
        else next.add(photoId);
        return next;
      });
    }
  }

  function selectAll() {
    setSelectedIds(new Set(renderedPhotos.map((p) => p.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
    lastClickedIndexRef.current = null;
  }

  // ── Bulk operations ──────────────────────────────────────────────────────────

  async function handleBulkAssign(groupId: string, groupName: string) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setAllPhotos((prev) =>
      prev.map((p) => (selectedIds.has(p.id) ? { ...p, groupId } : p))
    );
    setSelectedIds(new Set());

    setBulkLoading(true);
    const res = await assignPhotosToGroup(ids, groupId);
    setBulkLoading(false);

    if ("error" in res) {
      setAllPhotos((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, groupId: p.groupId } : p))
      );
      setToast({ message: res.error ?? "Failed to assign group.", ok: false });
    } else {
      setToast({
        message: `${ids.length} ${ids.length === 1 ? "photo" : "photos"} assigned to ${groupName}`,
        ok: true,
      });
      router.refresh();
    }
  }

  async function handleRemoveGroup() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setAllPhotos((prev) =>
      prev.map((p) => (selectedIds.has(p.id) ? { ...p, groupId: null } : p))
    );
    setSelectedIds(new Set());

    setBulkLoading(true);
    const res = await assignPhotosToGroup(ids, null);
    setBulkLoading(false);

    if ("error" in res) {
      setToast({ message: res.error ?? "Failed to remove group.", ok: false });
    } else {
      setToast({
        message: `${ids.length} ${ids.length === 1 ? "photo" : "photos"} moved to Ungrouped`,
        ok: true,
      });
      router.refresh();
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setAllPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setVisibleCount((c) => Math.max(0, c - ids.length));
    exitSelectionMode();

    setBulkLoading(true);
    const res = await bulkDeletePhotosAction(ids);
    setBulkLoading(false);

    if (res.error) {
      setToast({ message: res.error, ok: false });
      router.refresh();
    } else {
      setToast({
        message: `${res.deleted} ${res.deleted === 1 ? "photo" : "photos"} deleted`,
        ok: true,
      });
      router.refresh();
    }
  }

  async function handleAssignAllUngrouped(targetGroupId: string, targetGroupName: string) {
    setBulkLoading(true);
    const res = await assignAllUngroupedToGroup(eventId, targetGroupId);
    setBulkLoading(false);

    if ("error" in res) {
      setToast({ message: res.error ?? "Failed to assign.", ok: false });
    } else {
      setToast({
        message: `${res.updated} ungrouped ${res.updated === 1 ? "photo" : "photos"} assigned to ${targetGroupName}`,
        ok: true,
      });
      router.refresh();
    }
  }

  // ── Lightbox ─────────────────────────────────────────────────────────────────

  async function openLightbox(index: number) {
    const photo = renderedPhotos[index];
    setLightboxIndex(index);
    onLightboxChange?.(true);

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
    onLightboxChange?.(false);
  }

  function handleDeleted(id: string) {
    const deletedAt = allPhotos.findIndex((p) => p.id === id);
    const wasRendered = deletedAt !== -1 && deletedAt < visibleCount;

    setAllPhotos((prev) => prev.filter((p) => p.id !== id));

    if (wasRendered) {
      setVisibleCount((c) => c - 1);
      setLightboxIndex((idx) => {
        if (idx === null) return null;
        if (deletedAt === idx) {
          setLightboxUrl(null);
          setLightboxUrlLoading(false);
          pendingFetchId.current = null;
          return null;
        }
        if (deletedAt < idx) return idx - 1;
        return idx;
      });
    }
    router.refresh();
  }

  if (allPhotos.length === 0) return <EmptyState />;

  // Determine whether the filter bar should be shown at all
  const showFilterBar = groups.length > 0;
  // Show the "assign all ungrouped" banner only on the ungrouped filter
  const showAssignAllBanner =
    activeGroupFilter === "ungrouped" &&
    ungroupedCount > 0 &&
    groups.length > 0;

  const selectedCount = selectedIds.size;

  // Active group name for empty filtered state label
  const activeGroupName = (() => {
    if (activeGroupFilter === "ungrouped") return "Ungrouped";
    return groups.find((g) => g.id === activeGroupFilter)?.name ?? "this group";
  })();

  return (
    <>
      {/* ── Group filter bar ── */}
      {showFilterBar && (
        <GroupFilterBar
          groups={groups}
          ungroupedCount={ungroupedCount}
          totalPhotoCount={effectiveTotalPhotoCount}
          activeFilter={activeGroupFilter}
          onFilterChange={handleFilterChange}
        />
      )}

      {/* ── Assign all ungrouped banner ── */}
      {showAssignAllBanner && (
        <AssignAllBanner
          count={ungroupedCount}
          groups={groups}
          loading={bulkLoading}
          onAssign={handleAssignAllUngrouped}
        />
      )}

      {/* ── Filtered empty state ── */}
      {filteredPhotos.length === 0 ? (
        <FilterEmptyState groupName={activeGroupName} />
      ) : (
        <>
          {/* ── Selection controls bar ── */}
          <div className="mb-4 flex items-center justify-between gap-3">
            {selectionMode ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {selectedCount} selected
                  </span>
                  <button
                    onClick={selectAll}
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAll}
                    disabled={selectedCount === 0}
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600"
                  >
                    Deselect All
                  </button>
                </div>
                <button
                  onClick={exitSelectionMode}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  <XIcon className="h-4 w-4" />
                  Exit
                </button>
              </>
            ) : (
              <div className="ml-auto">
                <button
                  onClick={enterSelectionMode}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  Select
                </button>
              </div>
            )}
          </div>

          {/* ── Masonry grid ── */}
          <div style={{ columns: "4 200px", gap: "14px" }}>
            {renderedPhotos.map((photo, i) => {
              const group = photo.groupId ? groupMap.get(photo.groupId) : undefined;
              return (
                <div key={photo.id} style={{ breakInside: "avoid", marginBottom: 14 }}>
                  <PhotoCard
                    photo={photo}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(photo.id)}
                    onToggleSelect={(shiftKey) => toggleSelect(i, shiftKey)}
                    groupColor={group?.color ?? null}
                    groupName={group?.name ?? null}
                    onDeleted={handleDeleted}
                    onOpen={() => openLightbox(i)}
                  />
                </div>
              );
            })}
          </div>

          {/* ── Progressive-load footer ── */}
          {hasMore ? (
            <div ref={sentinelRef} className="mt-6 flex items-center justify-center gap-2 py-4 text-sm text-zinc-400 dark:text-zinc-500">
              <SpinnerIcon className="h-4 w-4" />
              {t.photoGrid.loadingMore}
            </div>
          ) : allPhotos.length > BATCH_SIZE ? (
            <p className="mt-6 py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {t.photoGrid.allPhotosLoaded(allPhotos.length)}
            </p>
          ) : null}
        </>
      )}

      {/* Extra bottom padding in selection mode so the bulk bar doesn't cover photos */}
      {selectionMode && <div className="h-20" />}

      {/* ── Lightbox ── */}
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

      {/* ── Bulk action bar ── */}
      {selectionMode && selectedCount > 0 && (
        <BulkActionBar
          count={selectedCount}
          groups={groups}
          loading={bulkLoading}
          onAssign={handleBulkAssign}
          onRemoveGroup={handleRemoveGroup}
          onBulkDelete={handleBulkDelete}
          onExit={exitSelectionMode}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          ok={toast.ok}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}

// Suppress unused import warning — showToast is dispatched externally
void showToast;
