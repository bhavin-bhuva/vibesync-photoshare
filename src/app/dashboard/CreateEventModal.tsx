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

export function CreateEventModal({
  atEventLimit,
  fab = false,
  emptyState = false,
}: {
  atEventLimit: boolean;
  fab?: boolean;
  emptyState?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [state, formAction, pending] = useActionState(createEventAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // On success: close modal, reset form, show toast.
  // setTimeout defers setState out of the effect body to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (state && "success" in state) {
      const id = setTimeout(() => {
        setOpen(false);
        formRef.current?.reset();
        setShowToast(true);
      }, 0);
      return () => clearTimeout(id);
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

  function handleTrigger() {
    if (atEventLimit) setShowUpgrade(true);
    else setOpen(true);
  }

  // ── FAB (mobile-only floating action button) ──
  if (fab) {
    return (
      <>
        <button
          onClick={handleTrigger}
          aria-label={t.dashboard.createEvent.trigger}
          className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 shadow-lg transition-transform active:scale-95 hover:scale-105 dark:bg-zinc-50"
          style={{
            bottom: "calc(56px + env(safe-area-inset-bottom) + 16px)",
            right: "16px",
          }}
        >
          <svg className="h-6 w-6 text-white dark:text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>

        {/* Upgrade prompt (shared with main trigger) */}
        {showUpgrade && createPortal(
          <UpgradePrompt t={t} onClose={() => setShowUpgrade(false)} />,
          document.body
        )}

        {/* Modal (bottom sheet on mobile, centered on desktop) */}
        {open && createPortal(
          <EventModal t={t} formRef={formRef} firstInputRef={firstInputRef} formAction={formAction} state={state} pending={pending} onClose={() => setOpen(false)} />,
          document.body
        )}

        {showToast && (
          <Toast message={t.dashboard.createEvent.successToast} onDone={() => setShowToast(false)} />
        )}
      </>
    );
  }

  // ── Empty state button ──
  if (emptyState) {
    return (
      <>
        <button
          onClick={handleTrigger}
          className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {t.dashboard.createEvent.trigger}
        </button>

        {showUpgrade && createPortal(
          <UpgradePrompt t={t} onClose={() => setShowUpgrade(false)} />,
          document.body
        )}

        {open && createPortal(
          <EventModal t={t} formRef={formRef} firstInputRef={firstInputRef} formAction={formAction} state={state} pending={pending} onClose={() => setOpen(false)} />,
          document.body
        )}

        {showToast && (
          <Toast message={t.dashboard.createEvent.successToast} onDone={() => setShowToast(false)} />
        )}
      </>
    );
  }

  // ── Default trigger button (desktop section header) ──
  return (
    <>
      <button
        onClick={handleTrigger}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {t.dashboard.createEvent.trigger}
      </button>

      {showUpgrade && createPortal(
        <UpgradePrompt t={t} onClose={() => setShowUpgrade(false)} />,
        document.body
      )}

      {open && createPortal(
        <EventModal t={t} formRef={formRef} firstInputRef={firstInputRef} formAction={formAction} state={state} pending={pending} onClose={() => setOpen(false)} />,
        document.body
      )}

      {showToast && (
        <Toast message={t.dashboard.createEvent.successToast} onDone={() => setShowToast(false)} />
      )}
    </>
  );
}

// ─── Upgrade prompt (shared) ──────────────────────────────────────────────────

function UpgradePrompt({ t, onClose }: { t: ReturnType<typeof useT>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
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
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Event form modal (bottom sheet on mobile, centered on desktop) ───────────

function EventModal({
  t,
  formRef,
  firstInputRef,
  formAction,
  state,
  pending,
  onClose,
}: {
  t: ReturnType<typeof useT>;
  formRef: React.RefObject<HTMLFormElement | null>;
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  formAction: (payload: FormData) => void;
  state: { error: string } | { success: true } | null;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Mobile: bottom sheet | Desktop: centered */}
      <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div className="relative w-full rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-800 sm:max-w-md sm:rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-700 sm:px-6">
            {/* Drag handle — mobile only */}
            <div className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-200 dark:bg-zinc-600 sm:hidden" />
            <h2 id="modal-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t.dashboard.createEvent.modalTitle}
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              aria-label={t.common.close_aria}
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form ref={formRef} action={formAction} className="space-y-4 px-5 py-5 sm:px-6">
            {state && "error" in state && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                {state.error}
              </p>
            )}

            <div>
              <label htmlFor="event-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                className="mt-1.5 block h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 sm:h-auto sm:py-2 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="event-date" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t.dashboard.createEvent.dateLabel} <span className="text-red-500">*</span>
              </label>
              <input
                id="event-date"
                name="date"
                type="date"
                required
                defaultValue={today()}
                className="mt-1.5 block h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 sm:h-auto sm:py-2 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="event-description" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
            <div className="pt-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              {/* Mobile: cancel text above full-width create button */}
              <div className="flex flex-col gap-2 sm:hidden">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-1 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
                >
                  {pending ? t.dashboard.createEvent.submitting : t.dashboard.createEvent.submit}
                </button>
              </div>
              {/* Desktop: cancel + create side by side */}
              <div className="hidden justify-end gap-3 sm:flex">
                <button
                  type="button"
                  onClick={onClose}
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
