"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { SharedLink } from "@/generated/prisma/client";
import { createSharedLinkAction, revokeSharedLinkAction } from "./actions";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SharedLinkRow = Pick<
  SharedLink,
  "id" | "slug" | "expiresAt" | "createdAt"
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
      <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      <CopyIcon />
      {copied ? t.shareModal.copiedButton : t.shareModal.copyButton}
    </button>
  );
}

// ─── ExistingLink row ─────────────────────────────────────────────────────────

function LinkRow({
  link,
  baseUrl,
  onRevoked,
}: {
  link: SharedLinkRow;
  baseUrl: string;
  onRevoked: (id: string) => void;
}) {
  const t = useT();
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState("");
  const url = `${baseUrl}/share/${link.slug}`;
  const isExpired = link.expiresAt && new Date() > new Date(link.expiresAt);

  async function handleRevoke() {
    setRevoking(true);
    setError("");
    const result = await revokeSharedLinkAction(link.id);
    if (result.error) {
      setError(result.error);
      setRevoking(false);
    } else {
      onRevoked(link.id);
    }
  }

  return (
    <li className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
              {url}
            </p>
            {isExpired && (
              <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {t.shareModal.expiredBadge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {t.shareModal.linkCreatedOn(formatDate(link.createdAt))}
            {link.expiresAt && (
              <> · {isExpired ? t.shareModal.linkExpired(formatDate(link.expiresAt)) : t.shareModal.linkExpires(formatDate(link.expiresAt))}</>
            )}
          </p>
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <CopyButton text={url} />
          <button
            onClick={handleRevoke}
            disabled={revoking}
            aria-label={t.shareModal.revokeAriaLabel}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            {revoking ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
              </svg>
            ) : (
              <TrashIcon />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShareModal({
  eventId,
  initialLinks,
}: {
  eventId: string;
  initialLinks: SharedLinkRow[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState(initialLinks);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [newUrl, setNewUrl] = useState<string | null>(null);

  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);

  // Derive base URL on the client (avoids SSR mismatch)
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Focus password field when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset form state when modal closes
  function handleClose() {
    setOpen(false);
    setPassword("");
    setConfirm("");
    setExpiresAt("");
    setFormError("");
    setNewUrl(null);
  }

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (password !== confirm) {
      setFormError(t.shareModal.errorPasswordMismatch);
      return;
    }
    if (password.length < 4) {
      setFormError(t.shareModal.errorPasswordTooShort);
      return;
    }

    setSubmitting(true);
    const result = await createSharedLinkAction(
      eventId,
      password,
      expiresAt || null
    );
    setSubmitting(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    const url = `${baseUrl}/share/${result.slug}`;
    setNewUrl(url);
    setPassword("");
    setConfirm("");
    setExpiresAt("");

    // Refresh server data to update link list
    router.refresh();
  }

  // Optimistically remove a revoked link from local state
  function handleRevoked(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    router.refresh();
  }

  // Sync initialLinks when server refreshes
  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z" />
        </svg>
        {t.eventPage.shareButton}
      </button>

      {/* Modal — portalled to escape header stacking context */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 overflow-y-auto">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleClose}
            />

            {/* Centering wrapper */}
            <div className="flex min-h-full items-center justify-center p-4">
              {/* Card */}
              <div
                className="relative z-50 flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-800"
                style={{ maxHeight: "90vh" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {t.shareModal.title}
                  </h2>
                  <button
                    onClick={handleClose}
                    className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    aria-label={t.common.close_aria}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col gap-6 overflow-y-auto p-6">
                  {/* ── New link form ── */}
                  <section>
                    <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {t.shareModal.createSectionTitle}
                    </h3>

                    {/* Success banner */}
                    {newUrl && (
                      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                        <p className="mb-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                          {t.shareModal.linkCreatedMessage}
                        </p>
                        <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-200 dark:bg-zinc-800 dark:ring-emerald-700">
                          <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-200">
                            {newUrl}
                          </p>
                          <CopyButton text={newUrl} />
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {t.shareModal.passwordLabel} <span className="text-red-500">*</span>
                          </label>
                          <input
                            ref={passwordRef}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t.shareModal.passwordPlaceholder}
                            required
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-600"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {t.shareModal.confirmLabel} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            placeholder={t.shareModal.confirmPlaceholder}
                            required
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {t.shareModal.expiryLabel}{" "}
                          <span className="font-normal text-zinc-400">{t.shareModal.expiryHint}</span>
                        </label>
                        <input
                          type="date"
                          value={expiresAt}
                          onChange={(e) => setExpiresAt(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-600"
                        />
                      </div>

                      {formError && (
                        <p className="text-sm text-red-500">{formError}</p>
                      )}

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {submitting ? t.shareModal.generating : t.shareModal.generateButton}
                      </button>
                    </form>
                  </section>

                  {/* ── Existing links ── */}
                  {links.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {t.shareModal.activeLinksTitle}{" "}
                        <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                          {links.length}
                        </span>
                      </h3>
                      <ul className="space-y-2">
                        {links.map((link) => (
                          <LinkRow
                            key={link.id}
                            link={link}
                            baseUrl={baseUrl}
                            onRevoked={handleRevoked}
                          />
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
