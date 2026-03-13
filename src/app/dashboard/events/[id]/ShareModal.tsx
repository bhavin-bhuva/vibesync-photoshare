"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createSharedLinkAction, revokeSharedLinkAction, getSharedLinkPin } from "./actions";
import { useT } from "@/lib/i18n";
import { OtpInput } from "@/components/OtpInput";
import { generateSecurePin } from "@/lib/pin";

// ─── Types ────────────────────────────────────────────────────────────────────

type AccessType = "NONE" | "PIN" | "PASSWORD";

export type SharedLinkRow = {
  id: string;
  slug: string;
  expiresAt: Date | null;
  createdAt: Date;
  accessType: AccessType;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text, ariaLabel }: { text: string; ariaLabel?: string }) {
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
      aria-label={ariaLabel}
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
  const [pinVisible, setPinVisible] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

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

  async function handleTogglePin() {
    if (pinVisible) {
      setPinVisible(false);
      return;
    }
    if (pin !== null) {
      setPinVisible(true);
      return;
    }
    setPinLoading(true);
    const result = await getSharedLinkPin(link.id);
    setPinLoading(false);
    if (result.pin) {
      setPin(result.pin);
      setPinVisible(true);
    } else {
      setError(result.error ?? "Could not retrieve PIN.");
    }
  }

  return (
    <li className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
              {url}
            </p>

            {/* Access type badge */}
            {link.accessType === "NONE" && (
              <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                {t.shareModal.accessBadgeNone}
              </span>
            )}
            {link.accessType === "PIN" && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {t.shareModal.accessBadgePin}
                <button
                  type="button"
                  onClick={handleTogglePin}
                  disabled={pinLoading}
                  aria-label={pinVisible ? t.shareModal.pinHideAriaLabel : t.shareModal.pinRevealAriaLabel}
                  className="ml-0.5 opacity-70 hover:opacity-100 disabled:opacity-40"
                >
                  {pinLoading ? (
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
                    </svg>
                  ) : pinVisible ? (
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                      <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.185A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
                    </svg>
                  ) : (
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </span>
            )}
            {link.accessType === "PASSWORD" && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                {t.shareModal.accessBadgePassword}
              </span>
            )}

            {isExpired && (
              <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {t.shareModal.expiredBadge}
              </span>
            )}
          </div>

          {/* Revealed PIN */}
          {pinVisible && pin && (
            <p className="mt-1.5 font-mono text-sm font-bold tracking-[0.35em] text-blue-700 dark:text-blue-400">
              {pin}
            </p>
          )}

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

  // Access type toggle
  const [accessType, setAccessType] = useState<AccessType>("PASSWORD");

  // Password fields
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // PIN field
  const [pinValue, setPinValue] = useState("");

  // Shared fields
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [newPinDisplay, setNewPinDisplay] = useState<string | null>(null);

  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Focus password input when modal opens or access type changes to PASSWORD
  useEffect(() => {
    if (open && accessType === "PASSWORD") {
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  }, [open, accessType]);

  function handleClose() {
    setOpen(false);
    setPassword("");
    setConfirm("");
    setPinValue("");
    setExpiresAt("");
    setFormError("");
    setNewUrl(null);
    setNewPinDisplay(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ── PIN handlers ────────────────────────────────────────────────────────────

  function handleGeneratePin() {
    setPinValue(generateSecurePin());
  }

  // ── Form submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    let credential: string | null = null;

    if (accessType === "PASSWORD") {
      if (password !== confirm) {
        setFormError(t.shareModal.errorPasswordMismatch);
        return;
      }
      if (password.length < 4) {
        setFormError(t.shareModal.errorPasswordTooShort);
        return;
      }
      credential = password;
    } else if (accessType === "PIN") {
      if (!/^\d{4}$/.test(pinValue)) {
        setFormError(t.shareModal.errorPinInvalid);
        return;
      }
      credential = pinValue;
    }

    setSubmitting(true);
    const result = await createSharedLinkAction(
      eventId,
      accessType,
      credential,
      expiresAt || null
    );
    setSubmitting(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    const url = `${baseUrl}/share/${result.slug}`;
    setNewUrl(url);
    setNewPinDisplay(accessType === "PIN" ? credential : null);
    setPassword("");
    setConfirm("");
    setPinValue("");
    setExpiresAt("");

    router.refresh();
  }

  function handleRevoked(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    router.refresh();
  }

  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  // ── Render ──────────────────────────────────────────────────────────────────

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
                        {newPinDisplay && (
                          <>
                            <p className="mt-3 mb-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                              {t.shareModal.linkCreatedPinMessage}
                            </p>
                            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-200 dark:bg-zinc-800 dark:ring-emerald-700">
                              <p className="flex-1 font-mono text-2xl font-bold tracking-[0.5em] text-zinc-800 dark:text-zinc-100">
                                {newPinDisplay}
                              </p>
                              <CopyButton text={newPinDisplay} />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* ── Access type toggle ── */}
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {t.shareModal.accessTypeLabel}
                        </label>
                        <div className="flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 dark:border-zinc-600 dark:bg-zinc-700/50">
                          {(["NONE", "PIN", "PASSWORD"] as AccessType[]).map((type) => {
                            const label =
                              type === "NONE"
                                ? t.shareModal.accessNone
                                : type === "PIN"
                                ? t.shareModal.accessPin
                                : t.shareModal.accessPassword;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => {
                                  setAccessType(type);
                                  setFormError("");
                                  setNewUrl(null);
                                  setNewPinDisplay(null);
                                }}
                                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                                  accessType === type
                                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-zinc-50"
                                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── NONE warning ── */}
                      {accessType === "NONE" && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                          </svg>
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {t.shareModal.noProtectionWarning}
                          </p>
                        </div>
                      )}

                      {/* ── PIN input ── */}
                      {accessType === "PIN" && (
                        <div>
                          <label className="mb-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {t.shareModal.pinLabel}
                          </label>
                          <div className="flex items-center gap-3">
                            <OtpInput
                              value={pinValue}
                              onComplete={setPinValue}
                              isError={false}
                              disabled={false}
                            />
                            <button
                              type="button"
                              onClick={handleGeneratePin}
                              aria-label={t.shareModal.pinRefreshAriaLabel}
                              className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600 dark:hover:text-zinc-200"
                            >
                              <RefreshIcon />
                            </button>
                            <CopyButton
                              text={pinValue}
                              ariaLabel={t.shareModal.pinCopyAriaLabel}
                            />
                          </div>
                        </div>
                      )}

                      {/* ── Password input ── */}
                      {accessType === "PASSWORD" && (
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
                      )}

                      {/* ── Expiry ── */}
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
