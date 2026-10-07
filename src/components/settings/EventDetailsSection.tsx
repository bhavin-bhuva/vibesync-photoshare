"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventDetails } from "@/app/dashboard/events/[id]/settings/actions";
import { useSettingsContext } from "@/components/settings/SettingsContext";

export type EventForDetails = {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  description: string | null;
  coverPhotoUrl: string | null;
};

export type PhotoThumb = { id: string; thumbnailUrl: string };

interface Props {
  event: EventForDetails;
  eventPhotos: PhotoThumb[];
  onSaved?: () => void;
}

export function EventDetailsSection({ event, eventPhotos, onSaved }: Props) {
  const router = useRouter();
  const { setDirty, showToast } = useSettingsContext();

  // Form state
  const [title, setTitle] = useState(event.name);
  const [date, setDate] = useState(event.date);
  const [description, setDescription] = useState(event.description ?? "");

  // Track "committed" originals so isDirty resets after save
  const [origName, setOrigName] = useState(event.name);
  const [origDate, setOrigDate] = useState(event.date);
  const [origDesc, setOrigDesc] = useState(event.description ?? "");

  // Cover photo picker
  const [selectedCoverPhotoId, setSelectedCoverPhotoId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTemp, setPickerTemp] = useState<string | null>(null);

  // Save state
  const [isPending, startTransition] = useTransition();
  const [savedStatus, setSavedStatus] = useState<"idle" | "saved">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDirty =
    title !== origName ||
    date !== origDate ||
    description !== origDesc ||
    selectedCoverPhotoId !== null;

  // Report dirty state to shell
  useEffect(() => {
    setDirty("event-details", isDirty, "Event Details");
    return () => setDirty("event-details", false);
  }, [isDirty, setDirty]);

  const selectedThumb = selectedCoverPhotoId
    ? (eventPhotos.find((p) => p.id === selectedCoverPhotoId)?.thumbnailUrl ?? null)
    : null;
  const displayCoverUrl = selectedThumb ?? event.coverPhotoUrl;

  function openPicker() {
    setPickerTemp(selectedCoverPhotoId);
    setPickerOpen(true);
  }

  function confirmPicker() {
    setSelectedCoverPhotoId(pickerTemp);
    setPickerOpen(false);
  }

  function handleSave() {
    if (!isDirty || isPending) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("Event title is required.");
      return;
    }
    if (!date) {
      setErrorMessage("Event date is required.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const result = await updateEventDetails(event.id, {
        name: trimmedTitle,
        date,
        description: description.trim() || null,
        coverPhotoId: selectedCoverPhotoId,
      });

      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      // Update origins so form is no longer dirty
      setOrigName(trimmedTitle);
      setOrigDate(date);
      setOrigDesc(description.trim());
      setSelectedCoverPhotoId(null);

      setSavedStatus("saved");
      router.refresh();
      showToast("Event Details saved");
      onSaved?.();
      setTimeout(() => setSavedStatus("idle"), 2000);
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Event Title ── */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Event Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20"
        />
        {title.length > 80 && (
          <p className="mt-1 text-right text-xs text-zinc-400">{title.length}/100</p>
        )}
      </div>

      {/* ── Event Date ── */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Event Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="mt-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20"
        />
      </div>

      {/* ── Description ── */}
      <div>
        <div className="flex items-baseline gap-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description
          </label>
          <span className="text-xs text-zinc-400">(optional)</span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          rows={4}
          maxLength={500}
          placeholder="Add notes about this event..."
          className="mt-1.5 w-full resize-none rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20"
        />
        <p
          className={`mt-1 text-right text-xs ${
            description.length > 450
              ? "text-amber-500 dark:text-amber-400"
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {description.length}/500
        </p>
      </div>

      {/* ── Cover Photo ── */}
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Cover Photo</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          This photo appears on your dashboard
        </p>

        <div className="mt-3 flex items-start gap-4">
          {displayCoverUrl ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative h-20 w-[120px] overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayCoverUrl}
                  alt="Current cover"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow">
                    <svg className="h-3.5 w-3.5 text-zinc-800" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Current cover</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-20 w-[120px] items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60">
                <svg className="h-8 w-8 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
                </svg>
              </div>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">No cover</span>
            </div>
          )}

          {eventPhotos.length > 0 && (
            <button
              type="button"
              onClick={openPicker}
              className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/80"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                  clipRule="evenodd"
                />
              </svg>
              Change Cover Photo
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {errorMessage && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* ── Save button ── */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isPending}
          data-save-trigger="event-details"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z"
                />
              </svg>
              Saving…
            </>
          ) : savedStatus === "saved" ? (
            <>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
              Saved
            </>
          ) : (
            "Save Event Details"
          )}
        </button>
      </div>

      {/* ── Photo Picker Modal ── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Choose Cover Photo
              </h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Grid */}
            <div className="max-h-[55vh] overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {eventPhotos.map((photo) => {
                  const isSelected = pickerTemp === photo.id;
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setPickerTemp(photo.id)}
                      className={`relative aspect-square overflow-hidden rounded-lg transition-all ${
                        isSelected
                          ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-900"
                          : "hover:opacity-90"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/20">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 shadow-md">
                            <svg
                              className="h-4 w-4 text-white"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPicker}
                disabled={!pickerTemp}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Use this photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
