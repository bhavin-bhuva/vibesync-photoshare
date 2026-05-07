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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-900">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-50">
            <svg className="h-7 w-7 text-white dark:text-zinc-900" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
              <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
            </svg>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h1 className="text-center text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {eventName}
          </h1>
          <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {t.sharePage.passwordSubtitle}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
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
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-600"
              />
            </div>

            {/* Wrong password */}
            {wrongPassword && !isLocked && (
              <div className="space-y-0.5">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {t.auth.login.error}
                </p>
                {attemptsLeft !== null && attemptsLeft > 0 && (
                  <p className="text-xs text-red-500/70 dark:text-red-500/60">
                    {attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} remaining
                  </p>
                )}
              </div>
            )}

            {/* Locked — countdown */}
            {isLocked && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {t.sharePage.tooManyAttemptsCountdown(formatCountdown(timeLeftMs))}
                </p>
              </div>
            )}

            {/* Link expired */}
            {expired && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {t.sharePage.expiredTitle}
              </p>
            )}

            {!isLocked && !expired && (
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? t.sharePage.passwordVerifying : t.sharePage.passwordSubmit}
              </button>
            )}
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">{t.app.tagline}</p>
      </div>
    </div>
  );
}
