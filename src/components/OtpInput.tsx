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
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
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
        <div className="flex gap-3">
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
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex(null)}
              className="h-16 w-16 rounded-xl text-center text-2xl font-bold transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              style={isError
                ? { background: 'rgba(239, 68, 68, 0.08)', border: '2px solid #EF4444', color: '#dc2626' }
                : { background: 'var(--theme-surface)', border: `2px solid ${focusedIndex === i ? 'var(--theme-accent)' : 'var(--theme-border)'}`, color: 'var(--theme-text)' }
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}
