"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

export function TopBar() {
  const t = useT();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const title = t.admin.pageTitles[pathname] ?? t.admin.pageTitles["/admin"];

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6">

      {/* Page title */}
      <h1 className="text-base font-semibold text-zinc-900">{title}</h1>

      {/* Global search */}
      <div className="relative w-72">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.admin.topBar.searchPlaceholder}
          className="w-full rounded-lg border border-zinc-300 bg-zinc-50 py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </header>
  );
}
