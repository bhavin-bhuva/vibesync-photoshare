"use client";

import { useState, useTransition } from "react";
import { getEventPhotosAction } from "./actions";

export type EventRow = {
  id: string;
  name: string;
  date: string;
  createdAt: string;
  photoCount: number;
  sharedLinkCount: number;
};

type Photo = { id: string; filename: string; url: string | null };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
    </svg>
  );
}

function PhotoGrid({ photos, loading, error }: { photos: Photo[]; loading: boolean; error: string }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-sm text-zinc-400">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
        </svg>
        Loading photos…
      </div>
    );
  }
  if (error) {
    return <p className="px-6 py-4 text-sm text-red-500">{error}</p>;
  }
  if (photos.length === 0) {
    return <p className="px-6 py-4 text-sm text-zinc-400">No photos in this event.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2 px-6 py-4">
      {photos.map((p) => (
        <div key={p.id} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
          {p.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.url}
              alt={p.filename}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg className="h-6 w-6 text-zinc-300" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
            {p.filename}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EventsSection({ events }: { events: EventRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [photoCache, setPhotoCache] = useState<Record<string, Photo[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function toggle(eventId: string) {
    if (expanded === eventId) {
      setExpanded(null);
      return;
    }
    setExpanded(eventId);
    if (photoCache[eventId]) return; // already loaded

    setLoadingId(eventId);
    startTransition(async () => {
      const res = await getEventPhotosAction(eventId);
      setLoadingId(null);
      if (res.error) {
        setErrorMap((prev) => ({ ...prev, [eventId]: res.error! }));
      } else {
        setPhotoCache((prev) => ({ ...prev, [eventId]: res.photos ?? [] }));
      }
    });
  }

  if (events.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Events</h2>
        </div>
        <p className="px-5 py-10 text-center text-sm text-zinc-400">No events yet.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Events</h2>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
          {events.length}
        </span>
      </div>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50">
            {["Event", "Date", "Photos", "Shared Links", "Created"].map((h) => (
              <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {h}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const isOpen = expanded === ev.id;
            return (
              <>
                <tr
                  key={ev.id}
                  onClick={() => toggle(ev.id)}
                  className="cursor-pointer border-b border-zinc-50 transition-colors hover:bg-zinc-50"
                >
                  <td className="px-5 py-3 font-medium text-zinc-900">{ev.name}</td>
                  <td className="px-5 py-3 text-zinc-500">{formatDate(ev.date)}</td>
                  <td className="px-5 py-3 tabular-nums text-zinc-600">{ev.photoCount.toLocaleString()}</td>
                  <td className="px-5 py-3 tabular-nums text-zinc-600">{ev.sharedLinkCount.toLocaleString()}</td>
                  <td className="px-5 py-3 text-zinc-500">{formatDate(ev.createdAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <ChevronIcon open={isOpen} />
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${ev.id}-photos`} className="border-b border-zinc-100 bg-zinc-50/60">
                    <td colSpan={6} className="p-0">
                      <PhotoGrid
                        photos={photoCache[ev.id] ?? []}
                        loading={loadingId === ev.id}
                        error={errorMap[ev.id] ?? ""}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
