"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyGalleryAccess } from "./actions";
import { useT } from "@/lib/i18n";

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PasswordForm({
  slug,
  eventName,
}: {
  slug: string;
  eventName: string;
}) {
  const t = useT();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Error state
  const [wrongPassword, setWrongPassword] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [unlocksAt, setUnlocksAt] = useState<number | null>(null); // unix ms
  const [expired, setExpired] = useState(false);

  const isLocked = unlocksAt !== null;
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  useEffect(() => {
    if (unlocksAt === null) return;

    function tick() {
      const remaining = unlocksAt! - Date.now();
      if (remaining <= 0) {
        setUnlocksAt(null);
        setTimeLeftMs(0);
      } else {
        setTimeLeftMs(remaining);
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unlocksAt]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) return;
    setWrongPassword(false);
    setAttemptsLeft(null);
    setLoading(true);

    const result = await verifyGalleryAccess(slug, password, "PASSWORD");
    setLoading(false);

    if (!("error" in result)) {
      router.refresh();
      return;
    }

    if (result.error === "LINK_EXPIRED") {
      setExpired(true);
      return;
    }

    if (result.error === "TOO_MANY_ATTEMPTS") {
      setUnlocksAt(result.unlocksAt);
      setPassword("");
      return;
    }

    if (result.error === "WRONG_PASSWORD") {
      setWrongPassword(true);
      setAttemptsLeft(result.attemptsLeft);
      setPassword("");
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--theme-bg)", color: "var(--theme-text)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--theme-text)' }}>
            <svg className="h-7 w-7" style={{ color: 'var(--theme-bg)' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
              <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
            </svg>
          </div>
        </div>

        <div
          className="rounded-2xl p-8 shadow-sm"
          style={{ background: "var(--theme-surface)", border: "1px solid var(--theme-border)" }}
        >
          <h1
            className="text-center text-lg font-semibold"
            style={{ color: "var(--theme-text)", fontFamily: "var(--theme-font-heading)" }}
          >
            {eventName}
          </h1>
          <p className="mt-1 text-center text-sm" style={{ color: "var(--theme-text-muted)" }}>
            {t.sharePage.passwordSubtitle}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                {t.sharePage.passwordLabel}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setWrongPassword(false);
                }}
                placeholder={t.sharePage.passwordPlaceholder}
                required
                autoFocus
                disabled={isLocked || expired}
                className="w-full rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] disabled:opacity-50"
                style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </div>

            {/* Wrong password */}
            {wrongPassword && !isLocked && (
              <div className="space-y-0.5">
                <p className="text-sm" style={{ color: '#ef4444' }}>
                  {t.auth.login.error}
                </p>
                {attemptsLeft !== null && attemptsLeft > 0 && (
                  <p className="text-xs" style={{ color: 'rgba(239, 68, 68, 0.65)' }}>
                    {attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} remaining
                  </p>
                )}
              </div>
            )}

            {/* Locked — countdown */}
            {isLocked && (
              <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: 'rgba(217, 119, 6, 0.5)', background: 'rgba(217, 119, 6, 0.12)' }}>
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                </svg>
                <p className="text-sm" style={{ color: '#d97706' }}>
                  {t.sharePage.tooManyAttemptsCountdown(formatCountdown(timeLeftMs))}
                </p>
              </div>
            )}

            {/* Link expired */}
            {expired && (
              <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                {t.sharePage.expiredTitle}
              </p>
            )}

            {!isLocked && !expired && (
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full rounded-lg py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--theme-accent)', color: 'var(--theme-accent-text)' }}
              >
                {loading ? t.sharePage.passwordVerifying : t.sharePage.passwordSubmit}
              </button>
            )}
          </form>
        </div>

        <p className="mt-4 text-center text-xs" style={{ color: "var(--theme-text-muted)" }}>{t.app.tagline}</p>
      </div>
    </div>
  );
}
