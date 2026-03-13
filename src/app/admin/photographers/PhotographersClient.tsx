"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { impersonateUser } from "@/lib/impersonation";
import {
  changePlanAction,
  suspendAccountAction,
  unsuspendAccountAction,
  deleteAccountAction,
} from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PhotographerRow = {
  id: string;
  name: string | null;
  email: string;
  isSuspended: boolean;
  suspendedReason: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  storageUsedBytes: string;
  planTier: "FREE" | "PRO" | "STUDIO";
  eventCount: number;
  photoCount: number;
};

type ModalState =
  | { type: null }
  | { type: "changePlan"; userId: string; userName: string; currentPlan: "FREE" | "PRO" | "STUDIO" }
  | { type: "suspend";    userId: string; userName: string }
  | { type: "unsuspend";  userId: string; userName: string }
  | { type: "delete";     userId: string; userName: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStorage(bytesStr: string): string {
  const n = Number(bytesStr);
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024)         return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "Just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  FREE:   { label: "Free",   cls: "bg-zinc-100 text-zinc-600" },
  PRO:    { label: "Pro",    cls: "bg-blue-100 text-blue-700" },
  STUDIO: { label: "Studio", cls: "bg-violet-100 text-violet-700" },
};

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg
      className={`ml-1 inline h-3 w-3 shrink-0 ${active ? "text-blue-600" : "text-zinc-300"}`}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      {active && dir === "asc"
        ? <path d="M6 2 L10 8 L2 8 Z" />
        : active && dir === "desc"
        ? <path d="M6 10 L10 4 L2 4 Z" />
        : <><path d="M6 1 L9 5 L3 5 Z" opacity="0.4" /><path d="M6 11 L9 7 L3 7 Z" opacity="0.4" /></>
      }
    </svg>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{msg}</p>;
}

function ModalActions({ onCancel, onConfirm, confirmLabel, confirmCls, pending }: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmCls: string;
  pending: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmCls}`}
      >
        {pending ? "Please wait…" : confirmLabel}
      </button>
    </div>
  );
}

// — Change Plan Modal —
function ChangePlanModal({ userId, userName, currentPlan, onClose, onDone }: {
  userId: string;
  userName: string;
  currentPlan: "FREE" | "PRO" | "STUDIO";
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<"FREE" | "PRO" | "STUDIO">(currentPlan);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (selected === currentPlan) { onClose(); return; }
    startTransition(async () => {
      const res = await changePlanAction(userId, selected);
      if (res.error) { setError(res.error); return; }
      onDone();
    });
  }

  const plans: { value: "FREE" | "PRO" | "STUDIO"; label: string; desc: string }[] = [
    { value: "FREE",   label: "Free",   desc: "3 events · 1 GB" },
    { value: "PRO",    label: "Pro",    desc: "25 events · 50 GB" },
    { value: "STUDIO", label: "Studio", desc: "Unlimited · 500 GB" },
  ];

  return (
    <ModalShell title={`Change Plan — ${userName}`} onClose={onClose}>
      {error && <ErrorMsg msg={error} />}
      <p className="mb-4 text-sm text-zinc-500">Select the new plan for this account.</p>
      <div className="space-y-2">
        {plans.map((p) => (
          <label
            key={p.value}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
              selected === p.value
                ? "border-blue-500 bg-blue-50"
                : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <input
              type="radio"
              name="plan"
              value={p.value}
              checked={selected === p.value}
              onChange={() => setSelected(p.value)}
              className="accent-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-zinc-900">{p.label}</p>
              <p className="text-xs text-zinc-400">{p.desc}</p>
            </div>
          </label>
        ))}
      </div>
      <ModalActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel="Save Plan"
        confirmCls="bg-blue-600 hover:bg-blue-700"
        pending={pending}
      />
    </ModalShell>
  );
}

// — Suspend Modal —
function SuspendModal({ userId, userName, onClose, onDone }: {
  userId: string;
  userName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError]   = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await suspendAccountAction(userId, reason);
      if (res.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <ModalShell title={`Suspend Account — ${userName}`} onClose={onClose}>
      {error && <ErrorMsg msg={error} />}
      <p className="mb-4 text-sm text-zinc-500">
        This will immediately prevent the user from logging in. You can unsuspend at any time.
      </p>
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-700">Reason <span className="text-zinc-400">(optional)</span></label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Policy violation, spam, etc."
          className="mt-1.5 block w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </div>
      <ModalActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel="Suspend Account"
        confirmCls="bg-red-600 hover:bg-red-700"
        pending={pending}
      />
    </ModalShell>
  );
}

// — Unsuspend Modal —
function UnsuspendModal({ userId, userName, onClose, onDone }: {
  userId: string;
  userName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await unsuspendAccountAction(userId);
      if (res.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <ModalShell title={`Unsuspend Account — ${userName}`} onClose={onClose}>
      {error && <ErrorMsg msg={error} />}
      <p className="mb-6 text-sm text-zinc-500">
        This will restore full access to <strong className="text-zinc-800">{userName}</strong>&apos;s account immediately.
      </p>
      <ModalActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel="Unsuspend Account"
        confirmCls="bg-emerald-600 hover:bg-emerald-700"
        pending={pending}
      />
    </ModalShell>
  );
}

// — Delete Modal —
function DeleteModal({ userId, userName, onClose, onDone }: {
  userId: string;
  userName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (confirm !== "DELETE") return;
    startTransition(async () => {
      const res = await deleteAccountAction(userId);
      if (res.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <ModalShell title={`Delete Account — ${userName}`} onClose={onClose}>
      {error && <ErrorMsg msg={error} />}
      <p className="mb-3 text-sm text-zinc-500">
        This permanently deletes <strong className="text-zinc-800">{userName}</strong>&apos;s account,
        all their events, photos, and gallery links. <strong className="text-red-600">This cannot be undone.</strong>
      </p>
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-700">
          Type <code className="rounded bg-zinc-100 px-1 font-mono text-red-600">DELETE</code> to confirm
        </label>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono placeholder-zinc-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>
      <ModalActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel="Delete Account"
        confirmCls={confirm === "DELETE" ? "bg-red-600 hover:bg-red-700" : "bg-red-300 cursor-not-allowed"}
        pending={pending}
      />
    </ModalShell>
  );
}

// ─── Actions dropdown ─────────────────────────────────────────────────────────

function ActionsDropdown({ row, onAction }: {
  row: PhotographerRow;
  onAction: (modal: ModalState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [impersonating, startImpersonation] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setStyle({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 192) });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayName = row.name ?? row.email;

  function item(label: string, onClick: () => void, cls = "text-zinc-700 hover:bg-zinc-50") {
    return (
      <button
        key={label}
        onClick={() => { setOpen(false); onClick(); }}
        className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors ${cls}`}
      >
        {label}
      </button>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        aria-label="Open actions"
      >
        Actions ▾
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", width: 192, zIndex: 50, ...style }}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl"
        >
          {item("View Details", () => window.open(`/admin/photographers/${row.id}`, "_self"))}
          <div className="my-1 border-t border-zinc-100" />
          {item("Change Plan", () => onAction({ type: "changePlan", userId: row.id, userName: displayName, currentPlan: row.planTier }))}
          <div className="my-1 border-t border-zinc-100" />
          {row.isSuspended
            ? item("Unsuspend Account", () => onAction({ type: "unsuspend", userId: row.id, userName: displayName }), "text-emerald-700 hover:bg-emerald-50")
            : item("Suspend Account",   () => onAction({ type: "suspend",   userId: row.id, userName: displayName }), "text-amber-700 hover:bg-amber-50")
          }
          <div className="my-1 border-t border-zinc-100" />
          {item(
            impersonating ? "Switching…" : "Login as User",
            () => startImpersonation(async () => { await impersonateUser(row.id); }),
            impersonating ? "text-zinc-400 cursor-wait" : "text-amber-700 hover:bg-amber-50"
          )}
          <div className="my-1 border-t border-zinc-100" />
          {item("Delete Account",  () => onAction({ type: "delete", userId: row.id, userName: displayName }), "text-red-600 hover:bg-red-50")}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function PhotographersClient({
  rows,
  total,
  pageSize,
  currentPage,
  sortBy,
  sortDir,
  search,
  planFilter,
  statusFilter,
  dateFrom,
  dateTo,
}: {
  rows: PhotographerRow[];
  total: number;
  pageSize: number;
  currentPage: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  search: string;
  planFilter: string;
  statusFilter: string;
  dateFrom: string;
  dateTo: string;
}) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState(search);
  const [modal, setModal]           = useState<ModalState>({ type: null });

  // Sync input → URL with debounce
  useEffect(() => {
    const t = setTimeout(() => {
      updateParams({ q: inputValue || null, page: null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  // Keep input in sync when URL search changes (e.g. back/forward)
  useEffect(() => { setInputValue(search); }, [search]);

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams({
      ...(search      && { q: search }),
      ...(planFilter  && { plan: planFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom    && { from: dateFrom }),
      ...(dateTo      && { to: dateTo }),
      ...(sortBy      && sortBy !== "createdAt" && { sort: sortBy }),
      ...(sortDir     && sortDir !== "desc" && { dir: sortDir }),
      ...(currentPage > 1 && { page: String(currentPage) }),
    });

    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function handleSort(col: string) {
    const newDir = sortBy === col && sortDir === "desc" ? "asc" : "desc";
    updateParams({ sort: col, dir: newDir, page: null });
  }

  function handlePage(p: number) {
    updateParams({ page: p > 1 ? String(p) : null });
  }

  function onModalDone() {
    setModal({ type: null });
    router.refresh();
  }

  const totalPages = Math.ceil(total / pageSize);

  const cols: { key: string; label: string; sortable: boolean }[] = [
    { key: "name",        label: "Name",        sortable: true  },
    { key: "email",       label: "Email",       sortable: true  },
    { key: "plan",        label: "Plan",        sortable: true  },
    { key: "storage",     label: "Storage",     sortable: true  },
    { key: "events",      label: "Events",      sortable: true  },
    { key: "photos",      label: "Photos",      sortable: false },
    { key: "createdAt",   label: "Joined",      sortable: true  },
    { key: "lastLoginAt", label: "Last Login",  sortable: true  },
    { key: "status",      label: "Status",      sortable: false },
    { key: "actions",     label: "",            sortable: false },
  ];

  return (
    <div className="space-y-4">

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-3">

        {/* Search */}
        <div className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" /></svg>
          </span>
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Plan filter */}
        <select
          value={planFilter}
          onChange={(e) => updateParams({ plan: e.target.value || null, page: null })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All plans</option>
          <option value="FREE">Free</option>
          <option value="PRO">Pro</option>
          <option value="STUDIO">Studio</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value || null, page: null })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ from: e.target.value || null, page: null })}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-zinc-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ to: e.target.value || null, page: null })}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Result count */}
        <span className="ml-auto text-xs text-zinc-400">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {cols.map((col) => (
                <th
                  key={col.key}
                  className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 ${col.sortable ? "cursor-pointer select-none hover:text-zinc-800" : ""}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  {col.label}
                  {col.sortable && (
                    <SortIcon active={sortBy === col.key} dir={sortDir} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-sm text-zinc-400">
                  No photographers match your filters.
                </td>
              </tr>
            ) : rows.map((row) => {
              const badge = PLAN_BADGE[row.planTier];
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/admin/photographers/${row.id}`)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${row.isSuspended ? "bg-red-50/40" : ""}`}
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                        {(row.name ?? row.email)[0].toUpperCase()}
                      </div>
                      <Link
                        href={`/admin/photographers/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                      >
                        {row.name ?? <span className="italic text-zinc-400">No name</span>}
                      </Link>
                    </div>
                  </td>
                  {/* Email */}
                  <td className="px-4 py-3 text-zinc-500">{row.email}</td>
                  {/* Plan */}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                  </td>
                  {/* Storage */}
                  <td className="px-4 py-3 tabular-nums text-zinc-600">{formatStorage(row.storageUsedBytes)}</td>
                  {/* Events */}
                  <td className="px-4 py-3 tabular-nums text-zinc-600">{row.eventCount.toLocaleString()}</td>
                  {/* Photos */}
                  <td className="px-4 py-3 tabular-nums text-zinc-600">{row.photoCount.toLocaleString()}</td>
                  {/* Joined */}
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{formatDate(row.createdAt)}</td>
                  {/* Last Login */}
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{timeAgo(row.lastLoginAt)}</td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    {row.isSuspended ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Suspended</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
                    )}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown row={row} onAction={setModal} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            Page {currentPage} of {totalPages} &middot; {total.toLocaleString()} total
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              // sliding window around current page
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (currentPage <= 4) {
                p = i + 1;
              } else if (currentPage >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = currentPage - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => handlePage(p)}
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
              onClick={() => handlePage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {modal.type === "changePlan" && (
        <ChangePlanModal
          userId={modal.userId}
          userName={modal.userName}
          currentPlan={modal.currentPlan}
          onClose={() => setModal({ type: null })}
          onDone={onModalDone}
        />
      )}
      {modal.type === "suspend" && (
        <SuspendModal
          userId={modal.userId}
          userName={modal.userName}
          onClose={() => setModal({ type: null })}
          onDone={onModalDone}
        />
      )}
      {modal.type === "unsuspend" && (
        <UnsuspendModal
          userId={modal.userId}
          userName={modal.userName}
          onClose={() => setModal({ type: null })}
          onDone={onModalDone}
        />
      )}
      {modal.type === "delete" && (
        <DeleteModal
          userId={modal.userId}
          userName={modal.userName}
          onClose={() => setModal({ type: null })}
          onDone={onModalDone}
        />
      )}
    </div>
  );
}
