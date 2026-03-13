"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyGalleryAccess } from "./actions";
import { useT } from "@/lib/i18n";
import { OtpInput } from "@/components/OtpInput";

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PinForm({
  slug,
  eventName,
  studioName,
  logoUrl,
}: {
  slug: string;
  eventName: string;
  studioName: string | null;
  logoUrl: string | null;
}) {
  const t = useT();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [pinValue, setPinValue] = useState("");

  // Error state
  const [wrongPin, setWrongPin] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [unlocksAt, setUnlocksAt] = useState<number | null>(null); // unix ms
  const [expired, setExpired] = useState(false);

  // Real-time countdown
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

    tick(); // run immediately so display is instant
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unlocksAt]);

  // ── Submission ──────────────────────────────────────────────────────────────

  async function submitPin(pin: string) {
    if (submitting || unlocksAt !== null) return;
    setSubmitting(true);
    setWrongPin(false);
    setAttemptsLeft(null);

    const result = await verifyGalleryAccess(slug, pin, "PIN");
    setSubmitting(false);

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
      return;
    }

    if (result.error === "WRONG_PIN") {
      setWrongPin(true);
      setAttemptsLeft(result.attemptsLeft);
      setPinValue(""); // clear boxes so user can re-enter
    }
  }

  // ── Derived display values ──────────────────────────────────────────────────

  const isLocked = unlocksAt !== null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-900">
      <div className="w-full max-w-sm text-center">
        {/* ── Studio branding ── */}
        <div className="mb-6 flex flex-col items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={studioName ?? ""}
              className="h-14 w-14 rounded-xl object-cover shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-50">
              <svg className="h-7 w-7 text-white dark:text-zinc-900" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          )}
          {studioName && (
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{studioName}</p>
          )}
        </div>

        {/* ── Card ── */}
        <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{eventName}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t.sharePage.pinSubtitle}
          </p>

          <div className="mt-6">
            {/* ── OTP digit boxes ── */}
            <div className="flex justify-center">
              <OtpInput
                value={pinValue}
                onChange={() => setWrongPin(false)}
                onComplete={submitPin}
                isError={wrongPin}
                disabled={isLocked || submitting || expired}
              />
            </div>

            {/* Verifying spinner */}
            {submitting && (
              <div className="mt-4 flex justify-center">
                <svg className="h-5 w-5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
                </svg>
              </div>
            )}

            {/* Wrong PIN */}
            {wrongPin && !isLocked && (
              <div className="mt-4 space-y-0.5">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t.sharePage.incorrectPin}
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
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left dark:border-amber-800 dark:bg-amber-900/20">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {t.sharePage.tooManyAttemptsCountdown(formatCountdown(timeLeftMs))}
                </p>
              </div>
            )}

            {/* Link expired (discovered on submit) */}
            {expired && (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {t.sharePage.expiredTitle}
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">{t.app.tagline}</p>
      </div>
    </div>
  );
}
