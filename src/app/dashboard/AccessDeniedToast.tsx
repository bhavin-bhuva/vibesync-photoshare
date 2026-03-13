"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

export function AccessDeniedToast() {
  const t = useT();
  const router = useRouter();
  const didClean = useRef(false);

  // Remove the query param from the URL without a navigation
  useEffect(() => {
    if (didClean.current) return;
    didClean.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    router.replace(url.pathname + (url.search || ""), { scroll: false });
  }, [router]);

  return (
    <div
      role="alert"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-red-600 px-5 py-3 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
          clipRule="evenodd"
        />
      </svg>
      {t.app.accessDenied}
    </div>
  );
}
