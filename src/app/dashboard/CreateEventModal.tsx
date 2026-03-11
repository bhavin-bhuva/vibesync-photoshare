"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createEventAction } from "./actions";
import { useT } from "@/lib/i18n";

function today() {
  return new Date().toISOString().split("T")[0];
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-zinc-900 px-5 py-3.5 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-4 dark:bg-zinc-50 dark:text-zinc-900">
      <svg className="h-4 w-4 shrink-0 text-emerald-400 dark:text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function CreateEventModal({ atEventLimit }: { atEventLimit: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [state, formAction, pending] = useActionState(createEventAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // On success: close modal, reset form, show toast
  useEffect(() => {
    if (state && "success" in state) {
      setOpen(false);
      formRef.current?.reset();
      setShowToast(true);
    }
  }, [state]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus first input when modal opens
  useEffect(() => {
    if (open) setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [open]);

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => atEventLimit ? setShowUpgrade(true) : setOpen(true)}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {t.dashboard.createEvent.trigger}
      </button>

      {/* Upgrade prompt */}
      {showUpgrade && createPortal(
        <div className="fixed inset-0 z-40 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUpgrade(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative z-50 w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl dark:bg-zinc-800">
              <p className="text-2xl">🚀</p>
              <h2 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {t.dashboard.upgrade.eventLimitTitle}
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {t.dashboard.upgrade.eventLimitBody}
              </p>
              <div className="mt-6 flex gap-3">
                <Link
                  href="/pricing"
                  className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-center text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {t.dashboard.upgrade.cta}
                </Link>
                <button
                  onClick={() => setShowUpgrade(false)}
                  className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {t.common.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal — portalled to escape the dashboard header's backdrop-blur stacking context */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-40 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Centering wrapper */}
          <div className="flex min-h-full items-center justify-center p-4">
          {/* Card */}
          <div className="relative z-50 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
              <h2
                id="modal-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                {t.dashboard.createEvent.modalTitle}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                aria-label={t.common.close_aria}
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form ref={formRef} action={formAction} className="px-6 py-5 space-y-4">
              {state && "error" in state && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                  {state.error}
                </p>
              )}

              <div>
                <label
                  htmlFor="event-name"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.dashboard.createEvent.nameLabel} <span className="text-red-500">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  id="event-name"
                  name="name"
                  type="text"
                  required
                  maxLength={120}
                  placeholder={t.dashboard.createEvent.namePlaceholder}
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500"
                />
              </div>

              <div>
                <label
                  htmlFor="event-date"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.dashboard.createEvent.dateLabel} <span className="text-red-500">*</span>
                </label>
                <input
                  id="event-date"
                  name="date"
                  type="date"
                  required
                  defaultValue={today()}
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                />
              </div>

              <div>
                <label
                  htmlFor="event-description"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.dashboard.createEvent.descriptionLabel}{" "}
                  <span className="font-normal text-zinc-400">({t.common.optional})</span>
                </label>
                <textarea
                  id="event-description"
                  name="description"
                  rows={3}
                  maxLength={500}
                  placeholder={t.dashboard.createEvent.descriptionPlaceholder}
                  className="mt-1.5 block w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {pending ? t.dashboard.createEvent.submitting : t.dashboard.createEvent.submit}
                </button>
              </div>
            </form>
          </div>
          </div>{/* end centering wrapper */}
        </div>,
        document.body
      )}

      {/* Toast */}
      {showToast && (
        <Toast
          message={t.dashboard.createEvent.successToast}
          onDone={() => setShowToast(false)}
        />
      )}
    </>
  );
}
