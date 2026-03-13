"use client";

import { useState, useTransition } from "react";
import {
  searchPhotographerByEmailAction,
  overridePlanAction,
  type PhotographerSearchResult,
} from "./actions";

const PLAN_OPTIONS: { value: "FREE" | "PRO" | "STUDIO"; label: string; desc: string }[] = [
  { value: "FREE",   label: "Free",   desc: "$0 · 3 events · 1 GB" },
  { value: "PRO",    label: "Pro",    desc: "$19/mo · 25 events · 50 GB" },
  { value: "STUDIO", label: "Studio", desc: "$49/mo · unlimited · 500 GB" },
];

const PLAN_BADGE: Record<string, string> = {
  FREE:   "bg-zinc-100 text-zinc-700",
  PRO:    "bg-blue-100 text-blue-700",
  STUDIO: "bg-violet-100 text-violet-700",
};

export function ManualOverridePanel() {
  const [email,        setEmail]       = useState("");
  const [searchErr,    setSearchErr]   = useState("");
  const [found,        setFound]       = useState<PhotographerSearchResult | null>(null);
  const [newPlan,      setNewPlan]     = useState<"FREE" | "PRO" | "STUDIO">("FREE");
  const [note,         setNote]        = useState("");
  const [overrideErr,  setOverrideErr] = useState("");
  const [success,      setSuccess]     = useState(false);

  const [searching,  startSearch]   = useTransition();
  const [overriding, startOverride] = useTransition();

  function handleSearch() {
    if (!email.trim()) return;
    setSearchErr("");
    setFound(null);
    setSuccess(false);
    setOverrideErr("");

    startSearch(async () => {
      const res = await searchPhotographerByEmailAction(email);
      if (res.error) { setSearchErr(res.error); return; }
      setFound(res.result!);
      setNewPlan(res.result!.planTier);
    });
  }

  function handleOverride() {
    if (!found) return;
    setOverrideErr("");
    setSuccess(false);

    startOverride(async () => {
      const res = await overridePlanAction(found.id, newPlan, note);
      if (res.error) { setOverrideErr(res.error); return; }
      // Reflect the change locally
      setFound({ ...found, planTier: newPlan });
      setNote("");
      setSuccess(true);
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Manual Plan Override</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Change a photographer&apos;s plan directly, bypassing Stripe. Use for comps, refunds, or corrections.
          Every change is logged to the activity log with your note.
        </p>
      </div>

      <div className="p-5">
        {/* ── Search ── */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 9a7 7 0 1 1 14 0H3Z" clipRule="evenodd" />
              </svg>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFound(null); setSearchErr(""); setSuccess(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="photographer@email.com"
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !email.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {searchErr && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{searchErr}</p>
        )}

        {/* ── Found user ── */}
        {found && (
          <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 p-4">
            {/* User card */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
                {(found.name ?? found.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{found.name ?? <span className="italic text-zinc-400">No name</span>}</p>
                <p className="truncate text-xs text-zinc-400">{found.email}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_BADGE[found.planTier]}`}>
                {found.planTier}
              </span>
            </div>

            {/* Plan selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                New Plan
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PLAN_OPTIONS.map((p) => (
                  <label
                    key={p.value}
                    className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 transition-colors ${
                      newPlan === p.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="override-plan"
                        value={p.value}
                        checked={newPlan === p.value}
                        onChange={() => setNewPlan(p.value)}
                        className="accent-blue-600"
                      />
                      <span className="text-sm font-medium text-zinc-900">{p.label}</span>
                    </div>
                    <span className="mt-0.5 pl-5 text-[11px] text-zinc-400">{p.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Reason / Note <span className="normal-case font-normal text-zinc-300">(saved in activity log)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. Comping account for beta tester, refund issued, etc."
                className="block w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {overrideErr && (
              <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{overrideErr}</p>
            )}

            {success && (
              <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                Plan updated to <strong>{newPlan}</strong> successfully. Change logged to activity log.
              </p>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400">
                Current plan: <strong className="text-zinc-600">{found.planTier}</strong>
                {newPlan !== found.planTier && (
                  <> → <strong className="text-blue-600">{newPlan}</strong></>
                )}
              </p>
              <button
                onClick={handleOverride}
                disabled={overriding || newPlan === found.planTier}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {overriding ? "Applying…" : "Apply Override"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
