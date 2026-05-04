"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { updateSelectionStatusAction } from "./actions";

type Status = "PENDING" | "REVIEWED" | "DELIVERED";

interface SelectedPhoto {
  id: string;
  note: string | null;
  photo: {
    id: string;
    filename: string;
    signedUrl: string | null;
  };
}

interface Props {
  selection: {
    id: string;
    customerName: string;
    customerEmail: string | null;
    customerNote: string | null;
    status: Status;
    createdAt: Date;
    sharedLink: { slug: string };
    selectedPhotos: SelectedPhoto[];
  };
  eventId: string;
}

type StatusKey = "statusPending" | "statusReviewed" | "statusDelivered";
const STATUS_LABEL_KEY: Record<Status, StatusKey> = {
  PENDING: "statusPending",
  REVIEWED: "statusReviewed",
  DELIVERED: "statusDelivered",
};

const STATUS_COLORS: Record<Status, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  REVIEWED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  DELIVERED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SelectionCard({ selection, eventId }: Props) {
  const t = useT();
  const [status, setStatus] = useState<Status>(selection.status);
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function handleStatusChange(next: Status) {
    if (next === status || updating) return;
    setUpdating(true);
    const result = await updateSelectionStatusAction(selection.id, next);
    if (!result.error) setStatus(next);
    setUpdating(false);
  }

  const photos = selection.selectedPhotos;
  const currentPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">

        {/* ── Collapsed: Desktop (horizontal single row) ── */}
        <div className="hidden items-center gap-4 p-4 sm:flex">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {selection.customerName}
              </h3>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
                {t.selections[STATUS_LABEL_KEY[status]]}
              </span>
              {selection.customerEmail && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {selection.customerEmail}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              {photos.length} photo{photos.length !== 1 ? "s" : ""} · {formatDate(selection.createdAt)}
              {selection.customerNote && (
                <span className="ml-2 italic text-zinc-400 dark:text-zinc-500">
                  "{selection.customerNote.slice(0, 60)}{selection.customerNote.length > 60 ? "…" : ""}"
                </span>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`/api/download/selection/${selection.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              {t.selections.downloadZip}
            </a>
            <select
              value={status}
              disabled={updating}
              onChange={(e) => handleStatusChange(e.target.value as Status)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
            >
              <option value="PENDING">{t.selections.statusPending}</option>
              <option value="REVIEWED">{t.selections.statusReviewed}</option>
              <option value="DELIVERED">{t.selections.statusDelivered}</option>
            </select>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            >
              {expanded ? t.selections.hideDetails : t.selections.viewDetails}
            </button>
          </div>
        </div>

        {/* ── Collapsed: Mobile (vertical rows) ── */}
        <div className="p-4 sm:hidden">
          {/* Row 1: Name + status badge */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {selection.customerName}
            </h3>
            <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
              {t.selections[STATUS_LABEL_KEY[status]]}
            </span>
          </div>

          {/* Row 2: Date + photo count */}
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            {formatDate(selection.createdAt)} · {photos.length} photo{photos.length !== 1 ? "s" : ""}
          </p>

          {/* Row 3: Note preview */}
          {selection.customerNote && (
            <p className="mt-1.5 line-clamp-2 text-xs italic text-zinc-500 dark:text-zinc-400">
              "{selection.customerNote}"
            </p>
          )}

          {/* Row 4: View Details button */}
          {!expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            >
              {t.selections.viewDetails}
            </button>
          )}
        </div>

        {/* ── Expanded: Photo grid + actions ── */}
        {expanded && (
          <div className="border-t border-zinc-100 dark:border-zinc-700">
            {/* Customer note (full) */}
            {selection.customerNote && (
              <div className="mx-4 mt-4 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-700/50">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {t.selections.clientNoteLabel}
                </p>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
                  {selection.customerNote}
                </p>
              </div>
            )}

            {/* Thumbnail grid */}
            {photos.length > 0 && (
              <div className="px-4 pt-4">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
                  {photos.map((sp, idx) => (
                    <div key={sp.id} className="flex flex-col">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setLightboxIndex(idx)}
                        onKeyDown={(e) => e.key === "Enter" && setLightboxIndex(idx)}
                        className="aspect-square cursor-pointer overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-600 sm:h-20 sm:w-20 sm:aspect-auto"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={sp.photo.signedUrl ?? ""}
                          alt={sp.photo.filename}
                          className="h-full w-full object-cover transition-transform hover:scale-105"
                        />
                      </div>
                      {sp.note && (
                        <p className="mt-1 line-clamp-2 text-[11px] italic text-zinc-400 dark:text-zinc-500">
                          {sp.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-end">
              <select
                value={status}
                disabled={updating}
                onChange={(e) => handleStatusChange(e.target.value as Status)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 sm:w-auto sm:px-2 sm:py-1.5 sm:text-xs"
              >
                <option value="PENDING">{t.selections.statusPending}</option>
                <option value="REVIEWED">{t.selections.statusReviewed}</option>
                <option value="DELIVERED">{t.selections.statusDelivered}</option>
              </select>

              <a
                href={`/api/download/selection/${selection.id}`}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 sm:w-auto sm:py-1.5 sm:text-xs"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                {t.selections.downloadZip}
              </a>
            </div>

            {/* Hide Details */}
            <button
              onClick={() => setExpanded(false)}
              className="mt-3 mb-4 flex w-full items-center justify-center text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              {t.selections.hideDetails}
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {currentPhoto && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIndex(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightboxIndex(null);
            if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
            if (e.key === "ArrowRight") setLightboxIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i));
          }}
          tabIndex={-1}
          role="dialog"
        >
          <button
            className="absolute right-4 top-4 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close preview"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>

          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i !== null ? i - 1 : i)); }}
              aria-label="Previous photo"
            >
              <svg className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {lightboxIndex < photos.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i !== null ? i + 1 : i)); }}
              aria-label="Next photo"
            >
              <svg className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={currentPhoto.photo.id}
              src={currentPhoto.photo.signedUrl ?? ""}
              alt={currentPhoto.photo.filename}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
            <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/50">
              {lightboxIndex + 1} / {photos.length}
            </p>
            {currentPhoto.note && (
              <div className="absolute bottom-6 left-0 right-0 px-4 text-center">
                <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  {currentPhoto.note}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
