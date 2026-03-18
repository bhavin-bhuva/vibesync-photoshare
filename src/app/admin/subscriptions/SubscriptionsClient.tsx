"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionRow = {
  id:                   string;
  userId:               string;
  name:                 string | null;
  email:                string;
  planTier:             "FREE" | "PRO" | "STUDIO";
  stripeCustomerId:     string;
  stripeUrl:            string;
  status:               string;
  createdAt:            string; // ISO
  currentPeriodEnd:     string | null; // ISO
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  FREE:   { label: "Free",   cls: "bg-zinc-100  text-zinc-600" },
  PRO:    { label: "Pro",    cls: "bg-blue-100  text-blue-700" },
  STUDIO: { label: "Studio", cls: "bg-violet-100 text-violet-700" },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:     { label: "Active",     cls: "bg-emerald-100 text-emerald-700" },
  trialing:   { label: "Trial",      cls: "bg-sky-100     text-sky-700" },
  past_due:   { label: "Past Due",   cls: "bg-amber-100   text-amber-700" },
  canceled:   { label: "Canceled",   cls: "bg-red-100     text-red-700" },
  incomplete: { label: "Incomplete", cls: "bg-zinc-100    text-zinc-500" },
};

function statusBadge(status: string) {
  const s = STATUS_BADGE[status] ?? { label: status, cls: "bg-zinc-100 text-zinc-500" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}


function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg className={`ml-1 inline h-3 w-3 ${active ? "text-blue-600" : "text-zinc-300"}`} viewBox="0 0 12 12" fill="currentColor">
      {active && dir === "asc"
        ? <path d="M6 2 L10 8 L2 8 Z" />
        : active && dir === "desc"
        ? <path d="M6 10 L10 4 L2 4 Z" />
        : <><path d="M6 1 L9 5 L3 5 Z" opacity="0.4" /><path d="M6 11 L9 7 L3 7 Z" opacity="0.4" /></>
      }
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SubscriptionsClient({
  rows,
  total,
  pageSize,
  currentPage,
  sortBy,
  sortDir,
  planFilter,
  statusFilter,
  dateFrom,
  dateTo,
  planAmounts,
}: {
  rows:         SubscriptionRow[];
  total:        number;
  pageSize:     number;
  currentPage:  number;
  sortBy:       string;
  sortDir:      "asc" | "desc";
  planFilter:   string;
  statusFilter: string;
  dateFrom:     string;
  dateTo:       string;
  planAmounts:  Record<string, string>;
}) {
  const router = useRouter();

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams({
      ...(planFilter   && { plan:   planFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom     && { from:   dateFrom }),
      ...(dateTo       && { to:     dateTo }),
      ...(sortBy && sortBy !== "createdAt" && { sort: sortBy }),
      ...(sortDir && sortDir !== "desc"    && { dir:  sortDir }),
      ...(currentPage > 1 && { page: String(currentPage) }),
    });
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function handleSort(col: string) {
    const dir = sortBy === col && sortDir === "desc" ? "asc" : "desc";
    updateParams({ sort: col, dir, page: null });
  }

  const totalPages = Math.ceil(total / pageSize);

  const cols: { key: string; label: string; sortable: boolean }[] = [
    { key: "name",            label: "Photographer",    sortable: true  },
    { key: "email",           label: "Email",           sortable: true  },
    { key: "plan",            label: "Plan",            sortable: true  },
    { key: "amount",          label: "Amount",          sortable: false },
    { key: "billing",         label: "Billing",         sortable: false },
    { key: "createdAt",       label: "Start Date",      sortable: true  },
    { key: "currentPeriodEnd",label: "Next Billing",    sortable: true  },
    { key: "status",          label: "Status",          sortable: true  },
    { key: "stripe",          label: "Stripe",          sortable: false },
  ];

  return (
    <div className="space-y-4">

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-3">

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

        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value || null, page: null })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
          <option value="incomplete">Incomplete</option>
        </select>

        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => updateParams({ from: e.target.value || null, page: null })} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <span className="text-xs text-zinc-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => updateParams({ to: e.target.value || null, page: null })} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>

        <span className="ml-auto text-xs text-zinc-400">{total.toLocaleString()} result{total !== 1 ? "s" : ""}</span>
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
                  {col.sortable && <SortIcon active={sortBy === col.key} dir={sortDir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-sm text-zinc-400">
                  No subscriptions match your filters.
                </td>
              </tr>
            ) : rows.map((row) => {
              const plan   = PLAN_BADGE[row.planTier] ?? PLAN_BADGE.FREE;
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/admin/photographers/${row.userId}`)}
                  className="cursor-pointer transition-colors hover:bg-blue-50/30"
                >
                  {/* Photographer */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                        {(row.name ?? row.email)[0].toUpperCase()}
                      </div>
                      <Link
                        href={`/admin/photographers/${row.userId}`}
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
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${plan.cls}`}>{plan.label}</span>
                  </td>
                  {/* Amount */}
                  <td className="px-4 py-3 font-mono text-sm tabular-nums text-zinc-700">
                    {planAmounts[row.planTier] ?? "—"}
                  </td>
                  {/* Billing */}
                  <td className="px-4 py-3 text-zinc-400">
                    {row.planTier === "FREE" ? "—" : "Monthly"}
                  </td>
                  {/* Start date */}
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{formatDate(row.createdAt)}</td>
                  {/* Next billing */}
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{formatDate(row.currentPeriodEnd)}</td>
                  {/* Status */}
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  {/* Stripe link */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={row.stripeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                      title={`Open in Stripe (${row.stripeCustomerId})`}
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/>
                      </svg>
                      Stripe ↗
                    </a>
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
          <p className="text-xs text-zinc-400">Page {currentPage} of {totalPages} · {total.toLocaleString()} total</p>
          <div className="flex items-center gap-1">
            <button onClick={() => updateParams({ page: currentPage > 2 ? String(currentPage - 1) : null })} disabled={currentPage <= 1} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40">← Prev</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i;
              return (
                <button key={p} onClick={() => updateParams({ page: p > 1 ? String(p) : null })} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${p === currentPage ? "bg-blue-600 text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}>{p}</button>
              );
            })}
            <button onClick={() => updateParams({ page: String(currentPage + 1) })} disabled={currentPage >= totalPages} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
