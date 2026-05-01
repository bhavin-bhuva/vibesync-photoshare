"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { getUploadManager } from "@/lib/uploadManager";
import { networkMonitor } from "@/lib/networkMonitor";
import { updateQueueItem, type QueueItem } from "@/lib/uploadQueue";
import { getStorageStatus } from "./actions";
import { createGroup } from "./groups/actions";
import { useT } from "@/lib/i18n";

// ─── Group types ──────────────────────────────────────────────────────────────

export type GroupOption = {
  id: string;
  name: string;
  color: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUP_PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png":  [".png"],
  "image/webp": [".webp"],
};
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/** How long the "back online" green banner stays visible. */
const ONLINE_BANNER_DURATION_MS = 3_000;

/** Drop speed samples older than this when computing rolling average. */
const SPEED_WINDOW_MS = 8_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024 ** 2) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  return `~${Math.ceil(seconds / 60)} min`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5A.75.75 0 0 1 7 12.25v-4.5Zm4 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Z" clipRule="evenodd" />
    </svg>
  );
}

function QueuedDot() {
  return <div className="h-4 w-4 shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />;
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title,
  count,
  collapsed,
  onToggle,
  action,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
      <div className="flex cursor-pointer items-center justify-between px-4 py-2.5" onClick={onToggle}>
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}{" "}
          <span className="ml-1 font-normal normal-case text-zinc-400">({count})</span>
        </span>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {action}
          <svg
            className={`h-4 w-4 text-zinc-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      {!collapsed && (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
          {children}
        </ul>
      )}
    </div>
  );
}

// ─── Per-file rows ────────────────────────────────────────────────────────────

function UploadingRow({ item }: { item: QueueItem }) {
  const totalChunks = Math.ceil(item.size / item.chunkSize);
  const activeChunk = Math.min(item.completedParts.length + 1, totalChunks);

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <SpinnerIcon />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {item.filename}
          </p>
          <p className="text-xs text-zinc-400">
            {formatBytes(item.size)} · Chunk {activeChunk} of {totalChunks}
          </p>
        </div>
        <span className="shrink-0 tabular-nums text-xs text-zinc-400">{item.progress}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-600">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-150"
          style={{ width: `${item.progress}%` }}
        />
      </div>
    </li>
  );
}

function QueuedRow({ item }: { item: QueueItem }) {
  const isPaused = item.status === "PAUSED";
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {isPaused ? <PauseIcon /> : <QueuedDot />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {item.filename}
        </p>
        <p className="text-xs text-zinc-400">{formatBytes(item.size)}</p>
      </div>
      {isPaused && (
        <span className="shrink-0 text-xs text-amber-500">Paused</span>
      )}
    </li>
  );
}

function FailedRow({
  item,
  onRetry,
}: {
  item: QueueItem;
  onRetry: (id: string) => void;
}) {
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <ErrorIcon />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {item.filename}
          </p>
          {item.lastError && (
            <p className="truncate text-xs text-red-400">{item.lastError}</p>
          )}
        </div>
        <button
          onClick={() => onRetry(item.id)}
          className="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    </li>
  );
}

function CompletedRow({ item }: { item: QueueItem }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <CheckIcon />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {item.filename}
        </p>
        <p className="text-xs text-zinc-400">{formatBytes(item.size)}</p>
      </div>
    </li>
  );
}

// ─── Quick-create group modal ─────────────────────────────────────────────────

function CreateGroupModal({
  eventId,
  onCreated,
  onCancel,
}: {
  eventId: string;
  onCreated: (group: GroupOption) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(GROUP_PRESET_COLORS[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required."); return; }
    setSaving(true);
    const res = await createGroup(eventId, { name: trimmed, color });
    setSaving(false);
    if ("error" in res) { setError(res.error); return; }
    onCreated({ id: res.group.id, name: res.group.name, color: res.group.color });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Create new group
        </h3>

        <input
          ref={inputRef}
          type="text"
          placeholder="Group name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
            if (e.key === "Escape") onCancel();
          }}
          className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `2px solid ${c}` : "2px solid transparent",
                  outlineOffset: "2px",
                }}
              >
                {color === c && (
                  <svg className="m-auto h-3 w-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6 5 8.5 9.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
              </svg>
            )}
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Group selector ───────────────────────────────────────────────────────────

function GroupSelector({
  groups,
  selectedId,
  onSelect,
  onGroupCreated,
  eventId,
}: {
  groups: GroupOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGroupCreated: (group: GroupOption) => void;
  eventId: string;
}) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">Upload to:</span>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
          >
            {selected ? (
              <>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: selected.color ?? "#6366f1" }}
                />
                <span className="max-w-[160px] truncate">{selected.name}</span>
              </>
            ) : (
              <span className="text-zinc-500 dark:text-zinc-400">All Groups</span>
            )}
            <svg className="h-3.5 w-3.5 shrink-0 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>

          {open && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-20 min-w-[200px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              {/* No group option */}
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                onClick={() => { onSelect(null); setOpen(false); }}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <span className="h-2 w-2 rounded-full border border-zinc-400 dark:border-zinc-500" />
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">No Group</span>
                {selectedId === null && (
                  <svg className="ml-auto h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* Existing groups */}
              {groups.length > 0 && (
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
              )}
              {groups.map((g) => (
                <button
                  key={g.id}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  onClick={() => { onSelect(g.id); setOpen(false); }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: g.color ?? "#6366f1" }}
                  />
                  <span className="flex-1 truncate text-zinc-700 dark:text-zinc-200">{g.name}</span>
                  {selectedId === g.id && (
                    <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}

              {/* Create new group */}
              <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-700"
                onClick={() => { setOpen(false); setShowCreate(true); }}
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                </svg>
                Create new group…
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateGroupModal
          eventId={eventId}
          onCreated={(g) => {
            onGroupCreated(g);
            onSelect(g.id);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UploadModal({
  eventId,
  groups: initialGroups = [],
  triggerClassName,
}: {
  eventId: string;
  groups?: GroupOption[];
  triggerClassName?: string;
}) {
  const t = useT();
  const router = useRouter();
  const queue = useUploadQueue(eventId);

  const [open, setOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Group selection — persists for the lifetime of the modal session
  const [groups, setGroups] = useState<GroupOption[]>(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const onlineBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Storage status
  const [storageFull, setStorageFull] = useState(false);

  // Collapsible sections: key → collapsed boolean
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Speed tracking
  const speedSamplesRef = useRef<{ bytes: number; ts: number }[]>([]);
  const lastUploadedBytesRef = useRef(0);
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState(0);

  // For triggering router.refresh() when photos complete
  const prevDoneCountRef = useRef(0);

  // ── Auto-start the manager on page load (not just on modal open) ─────────────
  // This is what resumes any pending/paused uploads left over from a previous session.
  useEffect(() => {
    getUploadManager(eventId).start().catch(console.error);
  }, [eventId]);

  // ── Network status ───────────────────────────────────────────────────────────
  useEffect(() => {
    setIsOnline(networkMonitor.isOnline);

    return networkMonitor.onStatusChange((online) => {
      setIsOnline(online);

      if (online) {
        setShowOnlineBanner(true);
        if (onlineBannerTimerRef.current) clearTimeout(onlineBannerTimerRef.current);
        onlineBannerTimerRef.current = setTimeout(() => {
          setShowOnlineBanner(false);
          onlineBannerTimerRef.current = null;
        }, ONLINE_BANNER_DURATION_MS);
      } else {
        setShowOnlineBanner(false);
        if (onlineBannerTimerRef.current) {
          clearTimeout(onlineBannerTimerRef.current);
          onlineBannerTimerRef.current = null;
        }
      }
    });
  }, []);

  // ── Fetch storage status when modal opens ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStorageFull(false);
    getStorageStatus().then((res) => {
      if (!("error" in res)) setStorageFull(res.percentUsed >= 100);
    });
  }, [open]);

  // ── Rolling speed calculation ────────────────────────────────────────────────
  useEffect(() => {
    const currentBytes = queue.uploadedBytes;
    const prevBytes = lastUploadedBytesRef.current;

    if (queue.uploading.length === 0) {
      // Nothing uploading — reset so speed shows 0 when idle
      speedSamplesRef.current = [];
      lastUploadedBytesRef.current = currentBytes;
      setSpeedBytesPerSec(0);
      return;
    }

    if (currentBytes > prevBytes) {
      const now = Date.now();
      speedSamplesRef.current.push({ bytes: currentBytes - prevBytes, ts: now });
      lastUploadedBytesRef.current = currentBytes;

      // Drop old samples outside the window
      speedSamplesRef.current = speedSamplesRef.current.filter(
        (s) => now - s.ts < SPEED_WINDOW_MS
      );

      const samples = speedSamplesRef.current;
      if (samples.length >= 2) {
        const totalBytes = samples.reduce((s, x) => s + x.bytes, 0);
        const windowMs = samples[samples.length - 1].ts - samples[0].ts;
        setSpeedBytesPerSec(windowMs > 0 ? (totalBytes / windowMs) * 1_000 : 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.uploadedBytes, queue.uploading.length]);

  // ── Refresh photo grid when uploads complete ──────────────────────────────────
  useEffect(() => {
    if (queue.done.length > prevDoneCountRef.current) {
      router.refresh();
    }
    prevDoneCountRef.current = queue.done.length;
  }, [queue.done.length, router]);

  // ── ETA ──────────────────────────────────────────────────────────────────────
  const remainingBytes = queue.totalBytes - queue.uploadedBytes;
  const etaSeconds = speedBytesPerSec > 0 ? remainingBytes / speedBytesPerSec : 0;

  // ── Dropzone ─────────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (accepted: File[], _rejected: FileRejection[]) => {
      if (accepted.length === 0) return;
      await queue.addFiles(accepted, selectedGroupId);
      getUploadManager(eventId).processQueue();
    },
    [eventId, queue, selectedGroupId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE_BYTES,
    disabled: storageFull,
  });

  // ── Retry handlers ────────────────────────────────────────────────────────────
  const handleRetryAll = useCallback(() => {
    getUploadManager(eventId).retryFailed();
  }, [eventId]);

  const handleRetryItem = useCallback(
    async (id: string) => {
      await updateQueueItem(id, { status: "PENDING", lastError: null });
      getUploadManager(eventId).processQueue();
    },
    [eventId]
  );

  // ── Close ─────────────────────────────────────────────────────────────────────
  function handleClose() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived lists ─────────────────────────────────────────────────────────────
  // PAUSED items are displayed in the "Queued" section alongside PENDING
  const queuedItems = queue.items.filter(
    (i) => i.status === "PENDING" || i.status === "PAUSED"
  );
  const isActive =
    queue.uploading.length > 0 || queuedItems.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className={triggerClassName ?? "flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
        {t.eventPage.uploadButton}
      </button>

      {/* Modal — portalled to escape the header's backdrop-blur stacking context */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 overflow-y-auto">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleClose}
            />

            {/* Centering wrapper */}
            <div className="flex min-h-full items-center justify-center p-4">
              {/* Card */}
              <div
                className="relative z-50 flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-800"
                style={{ maxHeight: "90vh" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {t.uploadModal.title}
                  </h2>
                  <button
                    onClick={handleClose}
                    className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    aria-label={t.common.close_aria}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col gap-4 overflow-y-auto p-6">

                  {/* Network banners */}
                  {!isOnline && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                      </svg>
                      No internet — uploads paused automatically
                    </div>
                  )}
                  {isOnline && showOnlineBanner && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                      </svg>
                      Back online — resuming uploads
                    </div>
                  )}

                  {/* Overall progress */}
                  {queue.totalCount > 0 && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {queue.completedCount} / {queue.totalCount} photos uploaded
                        </span>
                        {isActive && (
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            {speedBytesPerSec > 0 && (
                              <span>{formatSpeed(speedBytesPerSec)}</span>
                            )}
                            {etaSeconds > 0 && (
                              <span>{formatEta(etaSeconds)}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-600">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${queue.overallProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Group selector */}
                  <GroupSelector
                    groups={groups}
                    selectedId={selectedGroupId}
                    onSelect={setSelectedGroupId}
                    onGroupCreated={(g) => setGroups((prev) => [...prev, g])}
                    eventId={eventId}
                  />

                  {/* Dropzone */}
                  <div className="relative">
                    <div
                      {...getRootProps()}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                        isDragActive
                          ? "border-zinc-500 bg-zinc-50 dark:border-zinc-400 dark:bg-zinc-700"
                          : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
                      } ${storageFull ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input {...getInputProps()} />
                      <svg
                        className="mb-3 h-10 w-10 text-zinc-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      {isDragActive ? (
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {t.uploadModal.dropzoneDragActive}
                        </p>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {t.uploadModal.dropzonePrompt}{" "}
                            <span className="text-zinc-900 underline dark:text-zinc-50">
                              {t.uploadModal.dropzoneBrowse}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            {t.uploadModal.dropzoneHint}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Storage-full overlay */}
                    {storageFull && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-900/80 text-center">
                        <p className="text-sm font-medium text-white">
                          Storage full &mdash; upgrade to continue uploading
                        </p>
                        <Link
                          href="/pricing"
                          className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                        >
                          Upgrade plan
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Selected-group pill */}
                  {(() => {
                    const g = groups.find((g) => g.id === selectedGroupId);
                    if (!g) return null;
                    return (
                      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <span>Uploading to:</span>
                        <span className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: g.color ?? "#6366f1" }}
                          />
                          {g.name}
                        </span>
                        <button
                          onClick={() => setSelectedGroupId(null)}
                          className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-200"
                        >
                          change
                        </button>
                      </div>
                    );
                  })()}

                  {/* ── Sections ────────────────────────────────────────────── */}

                  {/* Uploading now */}
                  <Section
                    title="Uploading now"
                    count={queue.uploading.length}
                    collapsed={!!collapsed.uploading}
                    onToggle={() => toggleSection("uploading")}
                  >
                    {queue.uploading.map((item) => (
                      <UploadingRow key={item.id} item={item} />
                    ))}
                  </Section>

                  {/* Queued (PENDING + PAUSED) */}
                  <Section
                    title="Queued"
                    count={queuedItems.length}
                    collapsed={!!collapsed.queued}
                    onToggle={() => toggleSection("queued")}
                  >
                    {queuedItems.map((item) => (
                      <QueuedRow key={item.id} item={item} />
                    ))}
                  </Section>

                  {/* Failed */}
                  <Section
                    title="Failed"
                    count={queue.failed.length}
                    collapsed={!!collapsed.failed}
                    onToggle={() => toggleSection("failed")}
                    action={
                      queue.failed.length > 1 ? (
                        <button
                          onClick={handleRetryAll}
                          className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        >
                          Retry all
                        </button>
                      ) : undefined
                    }
                  >
                    {queue.failed.map((item) => (
                      <FailedRow key={item.id} item={item} onRetry={handleRetryItem} />
                    ))}
                  </Section>

                  {/* Completed */}
                  <Section
                    title="Completed"
                    count={queue.done.length}
                    collapsed={!!collapsed.completed}
                    onToggle={() => toggleSection("completed")}
                    action={
                      <button
                        onClick={queue.clearCompleted}
                        className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      >
                        Clear
                      </button>
                    }
                  >
                    {queue.done.map((item) => (
                      <CompletedRow key={item.id} item={item} />
                    ))}
                  </Section>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end border-t border-zinc-100 px-6 py-4 dark:border-zinc-700">
                  <button
                    onClick={handleClose}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    {t.common.close}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
