"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsContext } from "./SettingsContext";
import { SettingsSidebar, type NavItem } from "@/app/dashboard/events/[id]/settings/SettingsSidebar";

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg animate-in slide-in-from-bottom-2 fade-in"
      style={{ animation: "slideInToast 0.2s ease-out" }}
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  );
}

// ─── UnsavedDialog ────────────────────────────────────────────────────────────

function UnsavedDialog({
  sectionName,
  onStay,
  onLeave,
}: {
  sectionName: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
        <div className="p-6">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Unsaved changes
          </h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You have unsaved changes in <span className="font-medium text-zinc-800 dark:text-zinc-200">{sectionName}</span>.
            Leave without saving?
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            onClick={onStay}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Stay
          </button>
          <button
            onClick={onLeave}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Leave without saving
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section IDs in order ─────────────────────────────────────────────────────

const SECTION_IDS = [
  "event-details",
  "shared-links",
  "gallery",
  "photo-groups",
  "face-detection",
  "ai-culling",
  "watermark",
  "danger-zone",
];

// ─── SettingsShell ────────────────────────────────────────────────────────────

interface Props {
  navItems: NavItem[];
  eventName: string;
  backHref: string;
  brandColor: string;
  children: React.ReactNode;
}

export function SettingsShell({ navItems, eventName, backHref, brandColor, children }: Props) {
  const [dirtyMap, setDirtyMap] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [pending, setPending] = useState<{ action: () => void; sectionName: string } | null>(null);
  const toastCounter = useRef(0);

  // ── Context functions ──────────────────────────────────────────────────────

  const setDirty = useCallback((sectionId: string, isDirty: boolean, sectionName?: string) => {
    setDirtyMap((prev) => {
      if (isDirty) {
        const name = sectionName ?? prev[sectionId] ?? sectionId;
        if (prev[sectionId] === name) return prev;
        return { ...prev, [sectionId]: name };
      } else {
        if (!(sectionId in prev)) return prev;
        const next = { ...prev };
        delete next[sectionId];
        return next;
      }
    });
  }, []);

  const showToast = useCallback((message: string) => {
    toastCounter.current += 1;
    setToast({ id: toastCounter.current, message });
  }, []);

  const requestNavigation = useCallback((action: () => void): boolean => {
    const dirtyEntries = Object.values(dirtyMap);
    if (dirtyEntries.length === 0) {
      action();
      return true;
    }
    const sectionName = dirtyEntries[0];
    setPending({ action, sectionName });
    return false;
  }, [dirtyMap]);

  // ── beforeunload warning ───────────────────────────────────────────────────

  useEffect(() => {
    const hasDirty = Object.keys(dirtyMap).length > 0;
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyMap]);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Alt+1-8: jump to section
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 1 && digit <= 8) {
          e.preventDefault();
          const sectionId = SECTION_IDS[digit - 1];
          const el = document.getElementById(sectionId);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      // Cmd+S / Ctrl+S: click save button of first visible section
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        // Find the save button in the currently most-visible section
        const saveBtn = document.querySelector<HTMLButtonElement>(
          "button[data-save-trigger]:not([disabled])"
        );
        saveBtn?.click();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────

  const contextValue = { setDirty, showToast, dirtyMap, requestNavigation };

  return (
    <SettingsContext.Provider value={contextValue}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <div className="mx-auto max-w-[1100px] px-4 md:flex md:gap-8 md:py-8">
          <SettingsSidebar
            eventName={eventName}
            navItems={navItems}
            backHref={backHref}
            brandColor={brandColor}
          />
          <main className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          onDone={() => setToast(null)}
        />
      )}

      {/* Unsaved changes dialog */}
      {pending && (
        <UnsavedDialog
          sectionName={pending.sectionName}
          onStay={() => setPending(null)}
          onLeave={() => {
            const action = pending.action;
            setPending(null);
            action();
          }}
        />
      )}
    </SettingsContext.Provider>
  );
}
