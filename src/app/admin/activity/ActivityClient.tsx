"use client";

import React, { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { exportActivityCsvAction, type ActivityFilters } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityRow = {
  id:          string;
  createdAt:   string; // ISO string (serialized from Date server-side)
  action:      string;
  targetType:  string;
  targetId:    string;
  metadata:    unknown;
  ipAddress:   string | null;
  adminId:     string;
  adminName:   string | null;
  adminEmail:  string;
};

export type AdminOption = {
  id:    string;
  name:  string | null;
  email: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

// Action badge
const ACTION_STYLE: Record<string, string> = {
  DELETED:          "bg-red-100     text-red-700",
  SUSPENDED:        "bg-red-100     text-red-700",
  UNSUSPENDED:      "bg-emerald-100 text-emerald-700",
  RESTORED:         "bg-emerald-100 text-emerald-700",
  CHANGED:          "bg-amber-100   text-amber-700",
  RESET:            "bg-sky-100     text-sky-700",
  IMPERSONATED:     "bg-violet-100  text-violet-700",
  EXITED:           "bg-zinc-100    text-zinc-600",
  INCREASED:        "bg-blue-100    text-blue-700",
};

function actionBadgeCls(action: string): string {
  const prefix = action.split("_")[0];
  return ACTION_STYLE[prefix] ?? "bg-zinc-100 text-zinc-600";
}

function actionLabel(action: string): string {
  return action.replace(/_/g, " ");
}

// Target type badge
const TARGET_TYPE_CLS: Record<string, string> = {
  USER:  "bg-blue-50  text-blue-600",
  EVENT: "bg-amber-50 text-amber-600",
  PHOTO: "bg-emerald-50 text-emerald-600",
};

// Target ID → link
function targetLink(targetType: string, targetId: string): string | null {
  if (targetType === "USER")  return `/admin/photographers/${targetId}`;
  if (targetType === "EVENT") return `/admin/photographers`; // no dedicated page yet
  return null;
}

// Truncate long IDs
function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

// ─── JSON viewer ──────────────────────────────────────────────────────────────

function JsonViewer({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2);

  // Syntax-colour the JSON string with spans
  const html = json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "text-violet-400"; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "text-sky-300" : "text-emerald-300"; // key vs string
      } else if (/true|false/.test(match)) {
        cls = "text-amber-300";
      } else if (/null/.test(match)) {
        cls = "text-zinc-500";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );

  return (
    <pre
      className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Export CSV button ────────────────────────────────────────────────────────

function ExportCsvButton({ filters }: { filters: ActivityFilters }) {
  const [exporting, startExport] = useTransition();
  const [err, setErr] = useState("");
  const anchorRef = useRef<HTMLAnchorElement>(null);

  function handleExport() {
    setErr("");
    startExport(async () => {
      const res = await exportActivityCsvAction(filters);
      if (res.error) { setErr(res.error); return; }

      const blob = new Blob([res.csv!], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = anchorRef.current!;
      a.href     = url;
      a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }

  return (
    <>
      {/* Hidden anchor for download trigger */}
      <a ref={anchorRef} className="hidden" aria-hidden />

      {err && <span className="text-xs text-red-600">{err}</span>}

      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        {exporting ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
        )}
        {exporting ? "Exporting…" : "Export CSV"}
      </button>
    </>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function ActivityClient({
  rows,
  total,
  pageSize,
  currentPage,
  admins,
  distinctActions,
  distinctTargetTypes,
  adminFilter,
  actionFilter,
  targetTypeFilter,
  dateFrom,
  dateTo,
  search,
}: {
  rows:                ActivityRow[];
  total:               number;
  pageSize:            number;
  currentPage:         number;
  admins:              AdminOption[];
  distinctActions:     string[];
  distinctTargetTypes: string[];
  adminFilter:         string;
  actionFilter:        string;
  targetTypeFilter:    string;
  dateFrom:            string;
  dateTo:              string;
  search:              string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput]   = useState(search);

  const totalPages = Math.ceil(total / pageSize);

  const currentFilters: ActivityFilters = {
    adminId:    adminFilter,
    action:     actionFilter,
    targetType: targetTypeFilter,
    dateFrom,
    dateTo,
    search,
  };

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams({
      ...(adminFilter      && { admin:  adminFilter }),
      ...(actionFilter     && { action: actionFilter }),
      ...(targetTypeFilter && { type:   targetTypeFilter }),
      ...(dateFrom         && { from:   dateFrom }),
      ...(dateTo           && { to:     dateTo }),
      ...(search           && { search: search }),
      ...(currentPage > 1  && { page:   String(currentPage) }),
    });
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParams({ search: searchInput || null, page: null });
  }

  return (
    <div className="space-y-4">

      {/* ── Filters + Export ── */}
      <div className="flex flex-wrap items-end gap-3">

        {/* Admin filter */}
        {admins.length > 1 && (
          <select
            value={adminFilter}
            onChange={(e) => updateParams({ admin: e.target.value || null, page: null })}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All admins</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
            ))}
          </select>
        )}

        {/* Action type filter */}
        <select
          value={actionFilter}
          onChange={(e) => updateParams({ action: e.target.value || null, page: null })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All actions</option>
          {distinctActions.map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>

        {/* Target type filter */}
        <select
          value={targetTypeFilter}
          onChange={(e) => updateParams({ type: e.target.value || null, page: null })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All targets</option>
          {distinctTargetTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ from: e.target.value || null, page: null })}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-zinc-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ to: e.target.value || null, page: null })}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Metadata search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
              </svg>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search metadata…"
              className="w-52 rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); updateParams({ search: null, page: null }); }}
              className="text-xs text-zinc-400 hover:text-zinc-700"
            >
              Clear
            </button>
          )}
        </form>

        {/* Result count + Export */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            {total.toLocaleString()} result{total !== 1 ? "s" : ""}
          </span>
          <ExportCsvButton filters={currentFilters} />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {/* Expand toggle col */}
              <th className="w-8 px-3 py-3" />
              {["Timestamp", "Admin", "Action", "Target Type", "Target ID", "IP Address", "Metadata"].map((h) => (
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
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-400">
                  No activity found matching your filters.
                </td>
              </tr>
            ) : rows.map((row) => {
              const ts   = formatTs(row.createdAt);
              const link = targetLink(row.targetType, row.targetId);
              const isExpanded = expanded.has(row.id);
              const hasMetadata = row.metadata !== null && row.metadata !== undefined;

              return (
                <React.Fragment key={row.id}>
                  <tr
                    className={`transition-colors ${isExpanded ? "bg-zinc-50" : "hover:bg-zinc-50/60"}`}
                  >
                    {/* Expand toggle */}
                    <td className="px-3 py-3">
                      {hasMetadata ? (
                        <button
                          onClick={() => toggleExpand(row.id)}
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                          className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                        >
                          <svg
                            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      ) : (
                        <span className="block h-5 w-5" />
                      )}
                    </td>

                    {/* Timestamp */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-xs font-medium text-zinc-800">{ts.date}</p>
                      <p className="text-[11px] text-zinc-400">{ts.time}</p>
                    </td>

                    {/* Admin */}
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-zinc-800">{row.adminName ?? "—"}</p>
                      <p className="text-[11px] text-zinc-400">{row.adminEmail}</p>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${actionBadgeCls(row.action)}`}>
                        {actionLabel(row.action)}
                      </span>
                    </td>

                    {/* Target Type */}
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TARGET_TYPE_CLS[row.targetType] ?? "bg-zinc-100 text-zinc-600"}`}>
                        {row.targetType}
                      </span>
                    </td>

                    {/* Target ID */}
                    <td className="px-4 py-3">
                      {link ? (
                        <Link
                          href={link}
                          className="font-mono text-xs text-blue-600 hover:underline"
                          title={row.targetId}
                        >
                          {shortId(row.targetId)}
                        </Link>
                      ) : (
                        <code
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                          title={row.targetId}
                        >
                          {shortId(row.targetId)}
                        </code>
                      )}
                    </td>

                    {/* IP Address */}
                    <td className="px-4 py-3">
                      {row.ipAddress ? (
                        <code className="text-xs text-zinc-500">{row.ipAddress}</code>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>

                    {/* Metadata preview */}
                    <td className="px-4 py-3">
                      {hasMetadata ? (
                        <button
                          onClick={() => toggleExpand(row.id)}
                          className="max-w-[200px] truncate rounded bg-zinc-100 px-2 py-0.5 text-left text-[11px] font-mono text-zinc-500 hover:bg-zinc-200"
                          title="Click to expand"
                        >
                          {JSON.stringify(row.metadata).slice(0, 60)}
                          {JSON.stringify(row.metadata).length > 60 ? "…" : ""}
                        </button>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded metadata row */}
                  {isExpanded && hasMetadata && (
                    <tr className="bg-zinc-50">
                      <td />
                      <td colSpan={7} className="px-4 pb-4 pt-1">
                        <div className="rounded-xl border border-zinc-200 overflow-hidden">
                          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-800 px-4 py-2">
                            <span className="text-[11px] font-medium text-zinc-400">metadata · {row.action}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(row.metadata, null, 2));
                              }}
                              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
                              title="Copy to clipboard"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                                <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.44A1.5 1.5 0 0 0 8.378 6H4.5Z" />
                              </svg>
                              Copy
                            </button>
                          </div>
                          <JsonViewer value={row.metadata} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            Page {currentPage} of {totalPages} · {total.toLocaleString()} total
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateParams({ page: currentPage > 2 ? String(currentPage - 1) : null })}
              disabled={currentPage <= 1}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p =
                totalPages <= 7 ? i + 1 :
                currentPage <= 4 ? i + 1 :
                currentPage >= totalPages - 3 ? totalPages - 6 + i :
                currentPage - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => updateParams({ page: p > 1 ? String(p) : null })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    p === currentPage
                      ? "bg-blue-600 text-white"
                      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => updateParams({ page: String(currentPage + 1) })}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
