"use client";

import { useT } from "@/lib/i18n";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Privacy disclosure + consent checkbox shown before a customer submits
 * a selfie for face search.  Parent controls the checked state so it can
 * gate the "Agree & Continue" / "Search" button.
 */
export function FacePrivacyNotice({ checked, onChange }: Props) {
  const { faceSearch: fs } = useT();

  return (
    <div className="space-y-3">
      {/* ── Disclosure box ── */}
      <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          <span aria-hidden="true">🔒</span>
          {fs.privacyTitle}
        </p>
        <ul className="space-y-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          <li className="flex items-start gap-1.5">
            <span className="mt-px shrink-0 text-zinc-400">•</span>
            {fs.privacyStoredItem}
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-px shrink-0 text-zinc-400">•</span>
            {fs.privacyDurationItem}
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-px shrink-0 text-zinc-400">•</span>
            {fs.privacyVisibilityItem}
          </li>
        </ul>
      </div>

      {/* ── Consent checkbox ── */}
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="select-none text-xs text-zinc-600 dark:text-zinc-400">
          {fs.privacyCheckbox}
        </span>
      </label>
    </div>
  );
}
