"use client";

import { useState } from "react";
import Link from "next/link";

export function StorageBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <p className="text-amber-800 dark:text-amber-300">
        You&apos;re almost out of storage &mdash; upgrade your plan to keep uploading.
      </p>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/pricing"
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Upgrade
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
