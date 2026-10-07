"use client";

import { useEffect } from "react";

export default function GalleryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[gallery]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--g-bg, #09090b)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
          <svg className="h-8 w-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="mt-5 text-lg font-semibold" style={{ color: 'var(--g-text, #f4f4f5)' }}>
          Gallery unavailable
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--g-text-muted, #a1a1aa)' }}>
          We couldn&apos;t load this gallery. The link may have expired or the event was removed.
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs" style={{ color: 'var(--g-text-muted, #a1a1aa)' }}>
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-6 rounded-lg px-5 py-2.5 text-sm font-medium hover:opacity-90"
          style={{ background: 'var(--g-accent, #6366f1)', color: 'var(--g-accent-text, #ffffff)' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
