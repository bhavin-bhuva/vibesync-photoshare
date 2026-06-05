"use client";

import { createPortal } from "react-dom";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveEvent,
  revokeAllLinksAction,
  deleteEventAction,
} from "@/app/dashboard/events/[id]/settings/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DangerZoneSectionProps {
  eventId: string;
  eventName: string;
  photoCount: number;
  linkCount: number;
  isArchived: boolean;
}

// ─── Generic confirm dialog ───────────────────────────────────────────────────

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  destructive = true,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  destructive?: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
        <div className="p-6">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
          <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</div>
        </div>
        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
              destructive ? "bg-red-600 hover:bg-red-500" : "bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            }`}
          >
            {busy && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── DangerAction row ─────────────────────────────────────────────────────────

function DangerRow({
  title,
  description,
  buttonLabel,
  filled,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  filled?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          filled
            ? "bg-red-600 text-white hover:bg-red-500"
            : "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DangerZoneSection({
  eventId,
  eventName,
  photoCount,
  linkCount,
  isArchived: initialArchived,
}: DangerZoneSectionProps) {
  const router = useRouter();

  const [archived, setArchived] = useState(initialArchived);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [archiving, startArchiveTransition] = useTransition();
  const [revoking, startRevokeTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  function handleArchive() {
    startArchiveTransition(async () => {
      const result = await archiveEvent(eventId);
      setShowArchiveDialog(false);
      if (result.error) { setError(result.error); return; }
      setArchived(true);
      router.refresh();
    });
  }

  function handleRevoke() {
    startRevokeTransition(async () => {
      const result = await revokeAllLinksAction(eventId);
      setShowRevokeDialog(false);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  }

  function handleDelete() {
    if (deleteTyped !== eventName) return;
    startDeleteTransition(async () => {
      const result = await deleteEventAction(eventId);
      if (result.error) { setError(result.error); setShowDeleteDialog(false); return; }
      router.push("/dashboard");
    });
  }

  return (
    <div
      className="rounded-xl p-6 space-y-5"
      style={{
        background: "rgba(239,68,68,0.04)",
        border: "1px solid rgba(239,68,68,0.15)",
      }}
    >
      {/* Archive */}
      <DangerRow
        title="Archive Event"
        description="Hide this event from your dashboard. Photos and links remain accessible."
        buttonLabel={archived ? "Archived" : "Archive Event"}
        disabled={archived || archiving}
        onClick={() => setShowArchiveDialog(true)}
      />

      <hr style={{ borderColor: "rgba(239,68,68,0.1)" }} />

      {/* Revoke all links */}
      <DangerRow
        title="Revoke All Links"
        description="Immediately disable all shared links. Clients will lose access instantly."
        buttonLabel="Revoke All Links"
        disabled={linkCount === 0 || revoking}
        onClick={() => setShowRevokeDialog(true)}
      />

      <hr style={{ borderColor: "rgba(239,68,68,0.1)" }} />

      {/* Delete event */}
      <DangerRow
        title="Delete Event"
        description="Permanently delete this event, all photos, and all shared links. This cannot be undone."
        buttonLabel="Delete Event"
        filled
        disabled={deleting}
        onClick={() => { setDeleteTyped(""); setShowDeleteDialog(true); }}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Archive confirm */}
      {showArchiveDialog && (
        <ConfirmDialog
          title="Archive this event?"
          body="The event will be hidden from your dashboard. Photos and shared links remain accessible to clients."
          confirmLabel="Archive Event"
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveDialog(false)}
          busy={archiving}
          destructive={false}
        />
      )}

      {/* Revoke links confirm */}
      {showRevokeDialog && (
        <ConfirmDialog
          title={`Revoke ${linkCount} ${linkCount === 1 ? "link" : "links"}?`}
          body="All shared links for this event will be permanently deleted. Clients will lose access immediately."
          confirmLabel="Revoke All Links"
          onConfirm={handleRevoke}
          onCancel={() => setShowRevokeDialog(false)}
          busy={revoking}
        />
      )}

      {/* Delete event confirm */}
      {showDeleteDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
              <div className="p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                  <svg className="h-5 w-5 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Delete this event?
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  This will permanently delete{" "}
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {photoCount} photo{photoCount !== 1 ? "s" : ""}
                  </span>{" "}
                  and{" "}
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {linkCount} shared link{linkCount !== 1 ? "s" : ""}
                  </span>
                  . This cannot be undone.
                </p>

                <div className="mt-5">
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    To confirm, type the event name:
                    <span className="ml-1 font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                      {eventName}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={deleteTyped}
                    onChange={(e) => setDeleteTyped(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    placeholder={eventName}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={deleting}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteTyped !== eventName || deleting}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deleting && (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
                    </svg>
                  )}
                  Delete Event
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
