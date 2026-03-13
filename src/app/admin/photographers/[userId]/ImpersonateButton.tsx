"use client";

import { useTransition } from "react";
import { impersonateUser } from "@/lib/impersonation";

export function ImpersonateButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() => start(async () => { await impersonateUser(userId); })}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clipRule="evenodd" />
      </svg>
      {pending ? "Switching…" : "Login as User"}
    </button>
  );
}
