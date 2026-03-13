"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  recalculateStorageAction,
  recalculateAllStorageAction,
  increaseLimitAction,
} from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StorageRow = {
  userId:          string;
  name:            string | null;
  email:           string;
  planTier:        "FREE" | "PRO" | "STUDIO";
  storageUsedBytes: string; // serialized bigint
  storageLimit:    string; // serialized bigint
  photoCount:      number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: bigint): string {
  const v = Number(n);
  if (v >= 1_073_741_824) return `${(v / 1_073_741_824).toFixed(2)} GB`;
  if (v >= 1_048_576)     return `${(v / 1_048_576).toFixed(1)} MB`;
  if (v >= 1_024)         return `${(v / 1_024).toFixed(1)} KB`;
  return `${v} B`;
}

function pct(used: bigint, limit: bigint): number {
  if (limit === BigInt(0)) return 0;
  return Math.round(Number((used * BigInt(10000)) / limit) / 100);
}

const PLAN_BADGE: Record<string, string> = {
  FREE:   "bg-zinc-100  text-zinc-600",
  PRO:    "bg-blue-100  text-blue-700",
  STUDIO: "bg-violet-100 text-violet-700",
};

const LIMIT_PRESETS_GB = [1, 5, 10, 20, 50, 100, 200, 500];

// ─── Increase Limit Modal ─────────────────────────────────────────────────────

function IncreaseLimitModal({
  row,
  onClose,
  onDone,
}: {
  row: StorageRow;
  onClose: () => void;
  onDone: (newLimit: string) => void;
}) {
  const currentLimitGb = Number(BigInt(row.storageLimit)) / 1_073_741_824;

  const [gbInput, setGbInput] = useState("");
  const [reason, setReason]   = useState("");
  const [err, setErr]         = useState("");
  const [saving, startSave]   = useTransition();

  const newBytes = Math.round(parseFloat(gbInput || "0") * 1_073_741_824);

  function handleSubmit() {
    if (!gbInput || parseFloat(gbInput) <= 0) { setErr("Enter a valid size."); return; }
    if (parseFloat(gbInput) * 1_073_741_824 <= Number(BigInt(row.storageLimit))) {
      setErr("New limit must be greater than current limit.");
      return;
    }
    setErr("");
    startSave(async () => {
      const res = await increaseLimitAction(row.userId, String(newBytes), reason);
      if (res.error) { setErr(res.error); return; }
      onDone(String(newBytes));
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Increase Storage Limit</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            For <strong className="text-zinc-700">{row.name ?? row.email}</strong> — current limit:{" "}
            <strong className="text-zinc-700">{fmtBytes(BigInt(row.storageLimit))}</strong>
          </p>
        </div>

        <div className="space-y-4 p-5">
          {/* Quick presets */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Quick Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {LIMIT_PRESETS_GB.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGbInput(String(g))}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    gbInput === String(g)
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {g} GB
                </button>
              ))}
            </div>
          </div>

          {/* Custom input */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Custom (GB)
            </label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={gbInput}
              onChange={(e) => setGbInput(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {gbInput && parseFloat(gbInput) > 0 && (
              <p className="mt-1 text-xs text-zinc-400">
                = {fmtBytes(BigInt(Math.round(parseFloat(gbInput) * 1_073_741_824)))}
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Reason{" "}
              <span className="normal-case font-normal text-zinc-300">(logged to activity)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Special arrangement, partner account, etc."
              className="block w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {err && (
            <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !gbInput || parseFloat(gbInput) <= 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Apply Limit"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Recalculate All Button ───────────────────────────────────────────────────

export function RecalculateAllButton() {
  const router = useRouter();
  const [running, startRun] = useTransition();
  const [result, setResult] = useState<{ updated: number } | null>(null);
  const [err, setErr]       = useState("");

  function handleClick() {
    setResult(null);
    setErr("");
    startRun(async () => {
      const res = await recalculateAllStorageAction();
      if (res.error) { setErr(res.error); return; }
      setResult({ updated: res.updated });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      {err && (
        <p className="text-xs text-red-600">{err}</p>
      )}
      {result && !running && (
        <p className="text-xs text-emerald-600">
          Recalculated {result.updated} user{result.updated !== 1 ? "s" : ""} successfully.
        </p>
      )}
      <button
        onClick={handleClick}
        disabled={running}
        className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {running ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Recalculating…
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
            </svg>
            Recalculate All
          </>
        )}
      </button>
    </div>
  );
}

// ─── Storage Table ────────────────────────────────────────────────────────────

export function StorageTable({ initialRows }: { initialRows: StorageRow[] }) {
  const router = useRouter();
  const [rows, setRows]             = useState<StorageRow[]>(initialRows);
  const [limitModal, setLimitModal] = useState<StorageRow | null>(null);
  // recalculating: set of userIds currently in-flight
  const [recalcing, setRecalcing]   = useState<Set<string>>(new Set());
  const [rowMsg, setRowMsg]         = useState<Record<string, string>>({});

  async function handleRecalc(row: StorageRow) {
    setRecalcing((s) => new Set(s).add(row.userId));
    setRowMsg((m) => ({ ...m, [row.userId]: "" }));

    const res = await recalculateStorageAction(row.userId);

    setRecalcing((s) => { const n = new Set(s); n.delete(row.userId); return n; });

    if (res.error) {
      setRowMsg((m) => ({ ...m, [row.userId]: res.error! }));
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.userId === row.userId ? { ...r, storageUsedBytes: res.newBytes } : r
      )
    );
    setRowMsg((m) => ({ ...m, [row.userId]: "Updated." }));
    router.refresh();
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {["Photographer", "Plan", "Used", "Limit", "% Used", "Photos", "Actions"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-400">
                  No photographers found.
                </td>
              </tr>
            ) : rows.map((row) => {
              const used  = BigInt(row.storageUsedBytes);
              const limit = BigInt(row.storageLimit);
              const p     = pct(used, limit);
              const plan  = PLAN_BADGE[row.planTier] ?? PLAN_BADGE.FREE;

              const rowCls =
                p > 100 ? "bg-red-50/60 hover:bg-red-50" :
                p >= 90  ? "bg-amber-50/60 hover:bg-amber-50" :
                "hover:bg-blue-50/20";

              const barCls =
                p > 100 ? "bg-red-500" :
                p >= 90  ? "bg-amber-400" :
                p >= 70  ? "bg-blue-500" :
                "bg-emerald-500";

              return (
                <tr key={row.userId} className={`transition-colors ${rowCls}`}>
                  {/* Photographer */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                        {(row.name ?? row.email)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900 max-w-[160px]">
                          {row.name ?? <span className="italic text-zinc-400">No name</span>}
                        </p>
                        <p className="truncate text-xs text-zinc-400 max-w-[160px]">{row.email}</p>
                      </div>
                    </div>
                  </td>
                  {/* Plan */}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${plan}`}>
                      {row.planTier}
                    </span>
                  </td>
                  {/* Used */}
                  <td className="px-4 py-3 font-mono text-sm tabular-nums text-zinc-700">
                    {fmtBytes(used)}
                  </td>
                  {/* Limit */}
                  <td className="px-4 py-3 font-mono text-sm tabular-nums text-zinc-500">
                    {fmtBytes(limit)}
                  </td>
                  {/* % Used */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${barCls}`}
                          style={{ width: `${Math.min(100, p)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ${
                        p > 100 ? "text-red-600" : p >= 90 ? "text-amber-600" : "text-zinc-600"
                      }`}>
                        {p}%
                      </span>
                    </div>
                  </td>
                  {/* Photos */}
                  <td className="px-4 py-3 tabular-nums text-zinc-600">{row.photoCount.toLocaleString()}</td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRecalc(row)}
                        disabled={recalcing.has(row.userId)}
                        title="Recalculate storage from actual photo sizes"
                        className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
                      >
                        {recalcing.has(row.userId) ? (
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
                          </svg>
                        )}
                        Recalc
                      </button>
                      <button
                        onClick={() => setLimitModal(row)}
                        title="Manually increase storage limit"
                        className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                        </svg>
                        Limit
                      </button>
                      {rowMsg[row.userId] && (
                        <span className={`text-[11px] ${rowMsg[row.userId] === "Updated." ? "text-emerald-600" : "text-red-600"}`}>
                          {rowMsg[row.userId]}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {limitModal && (
        <IncreaseLimitModal
          row={limitModal}
          onClose={() => setLimitModal(null)}
          onDone={(newLimit) => {
            setRows((prev) =>
              prev.map((r) => r.userId === limitModal.userId ? { ...r, storageLimit: newLimit } : r)
            );
            setLimitModal(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
