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
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--theme-bg)", color: "var(--theme-text)" }}
    >
      <div className="w-full max-w-sm text-center">
        {/* ── Studio branding ── */}
        <div className="mb-6 flex flex-col items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={studioName ?? ""}
              className="max-h-[120px] w-auto max-w-[160px] rounded-xl object-contain shadow-sm"
              style={{ outline: '1px solid var(--theme-border)' }}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--theme-text)' }}>
              <svg className="h-8 w-8" style={{ color: 'var(--theme-bg)' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </div>
          )}
          {studioName && (
            <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-muted)' }}>{studioName}</p>
          )}
        </div>

        {/* ── Card ── */}
        <div
          className="rounded-2xl px-8 py-8 shadow-sm"
          style={{ background: "var(--theme-surface)", border: "1px solid var(--theme-border)" }}
        >
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--theme-text)", fontFamily: "var(--theme-font-heading)" }}
          >
            {eventName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted)" }}>
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
                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>
                  {t.sharePage.incorrectPin}
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
              <div className="mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left" style={{ borderColor: 'rgba(217, 119, 6, 0.5)', background: 'rgba(217, 119, 6, 0.12)' }}>
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                </svg>
                <p className="text-sm" style={{ color: '#d97706' }}>
                  {t.sharePage.tooManyAttemptsCountdown(formatCountdown(timeLeftMs))}
                </p>
              </div>
            )}

            {/* Link expired (discovered on submit) */}
            {expired && (
              <p className="mt-4 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                {t.sharePage.expiredTitle}
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs" style={{ color: "var(--theme-text-muted)" }}>{t.app.tagline}</p>
      </div>
    </div>
  );
}
