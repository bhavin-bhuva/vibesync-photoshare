"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { SelectionCard } from "./SelectionCard";

type Status = "PENDING" | "REVIEWED" | "DELIVERED";
type Filter = "ALL" | Status;

interface SelectedPhoto {
  id: string;
  note: string | null;
  photo: { id: string; filename: string; signedUrl: string | null };
}

interface Selection {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerNote: string | null;
  status: Status;
  createdAt: Date;
  sharedLink: { slug: string };
  selectedPhotos: SelectedPhoto[];
}

interface Props {
  selections: Selection[];
  eventId: string;
}

export function SelectionsClientShell({ selections, eventId }: Props) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered =
    filter === "ALL" ? selections : selections.filter((s) => s.status === filter);

  const FILTER_OPTIONS: { value: Filter; label: string }[] = [
    { value: "ALL", label: t.selections.filterAll },
    { value: "PENDING", label: t.selections.statusPending },
    { value: "REVIEWED", label: t.selections.statusReviewed },
    { value: "DELIVERED", label: t.selections.statusDelivered },
  ];

  return (
    <>
      {/* Controls bar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter dropdown */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 sm:w-auto sm:py-2"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
              {opt.value !== "ALL" && ` (${selections.filter((s) => s.status === opt.value).length})`}
            </option>
          ))}
        </select>

        {/* Download All button */}
        <a
          href={`/api/download/selection/all?eventId=${eventId}`}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          {t.selections.downloadAll}
        </a>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No {filter.toLowerCase()} submissions</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((sel) => (
            <SelectionCard key={sel.id} selection={sel} eventId={eventId} />
          ))}
        </div>
      )}
    </>
  );
}
