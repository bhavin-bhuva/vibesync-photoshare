"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reusable OTP-style digit input.
 *
 * Props:
 *   length    – number of boxes (default 4)
 *   value     – controlled value; update to programmatically fill boxes
 *   onComplete – called with the full string when every box is filled
 *   isError   – shake animation + red border
 *   disabled  – grays out all boxes, non-interactive
 */
export function OtpInput({
  length = 4,
  value = "",
  onChange,
  onComplete,
  isError,
  disabled,
}: {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  onComplete: (value: string) => void;
  isError: boolean;
  disabled: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length }, (_, i) => value[i] ?? "")
  );
  const [shaking, setShaking] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Sync when the parent changes `value` (e.g., "Generate PIN" button)
  useEffect(() => {
    const next = Array.from({ length }, (_, i) => value[i] ?? "");
    setDigits(next);
    // Focus last filled box or first empty box after programmatic fill
    const lastFilled = value.length > 0 ? Math.min(value.length - 1, length - 1) : 0;
    refs.current[lastFilled]?.focus();
  }, [value, length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger shake when isError flips to true
  useEffect(() => {
    if (isError) setShaking(true);
  }, [isError]);

  function handleChange(index: number, raw: string) {
    if (disabled) return;
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    onChange?.(next.join(""));

    if (digit) {
      if (index < length - 1) {
        refs.current[index + 1]?.focus();
      } else {
        const full = next.join("");
        if (/^\d+$/.test(full) && full.length === length) {
          onComplete(full);
        }
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    const next = Array.from({ length }, (_, i) => pasted[i] ?? "");
    setDigits(next);
    if (pasted.length === length) {
      onComplete(pasted);
    } else {
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  }

  return (
    <>
      <style>{`
        @keyframes otp-shake {
          0%   { transform: translateX(0); }
          25%  { transform: translateX(-8px); }
          75%  { transform: translateX(8px); }
          100% { transform: translateX(0); }
        }
        .otp-shake { animation: otp-shake 0.4s ease-in-out; }
      `}</style>

      <div
        className={shaking ? "otp-shake" : ""}
        onAnimationEnd={() => setShaking(false)}
      >
        <div className="flex gap-2">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={disabled}
              aria-label={`PIN digit ${i + 1}`}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className={[
                "h-11 w-11 rounded-lg border text-center text-lg font-bold",
                "transition-colors focus:outline-none focus:ring-2",
                "disabled:cursor-not-allowed disabled:opacity-40",
                isError
                  ? "border-red-400 bg-red-50 text-red-700 focus:border-red-400 focus:ring-red-100 dark:border-red-600 dark:bg-red-900/20 dark:text-red-400 dark:focus:ring-red-900"
                  : "border-zinc-300 bg-white text-zinc-900 focus:border-zinc-500 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-600",
              ].join(" ")}
            />
          ))}
        </div>
      </div>
    </>
  );
}
