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

export function SelectionCard({ selection, eventId }: Props) {
  const t = useT();
  const [status, setStatus] = useState<Status>(selection.status);
  const [updating, setUpdating] = useState(false);
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
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {selection.customerName}
              </h3>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
                {t.selections[STATUS_LABEL_KEY[status]]}
              </span>
            </div>
            {selection.customerEmail && (
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {selection.customerEmail}
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              {photos.length} photo{photos.length !== 1 ? "s" : ""} selected
              {" · "}
              {new Date(selection.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          </div>
        </div>

        {/* Customer note */}
        {selection.customerNote && (
          <div className="mx-5 mb-4 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-700/50">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              {t.selections.clientNoteLabel}
            </p>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
              {selection.customerNote}
            </p>
          </div>
        )}

        {/* Photo thumbnails */}
        {photos.length > 0 && (
          <div className="px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              {photos.map((sp, idx) => (
                <div key={sp.id} className="group relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setLightboxIndex(idx)}
                    onKeyDown={(e) => e.key === "Enter" && setLightboxIndex(idx)}
                    className="h-20 w-20 cursor-pointer overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-600"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sp.photo.signedUrl ?? ""}
                      alt={sp.photo.filename}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  {sp.note && (
                    <div className="absolute -bottom-1 left-0 right-0 hidden rounded-b-lg bg-black/70 px-1 py-0.5 group-hover:block">
                      <p className="truncate text-[10px] text-white">{sp.note}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
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
