"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  updateStripePlanAction,
  verifyStripePriceAction,
  syncPlansFromStripeAction,
  createStripePlanAction,
  deleteStripePlanAction,
  type UpdatePlanInput,
  type CreatePlanInput,
  type SyncResultItem,
} from "./actions";
import type { BillingInterval, PlanTier } from "@/generated/prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanRow = {
  id: string;
  name: string;
  displayName: string;
  tier: PlanTier;
  stripePriceId: string;
  stripeProductId: string | null;
  price: string;
  currency: string;
  interval: BillingInterval;
  storageBytes: string;
  maxEvents: number | null;
  features: string[];
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStorage(bytes: string): string {
  const gb = Number(BigInt(bytes)) / 1073741824;
  if (gb >= 1024) return `${(gb / 1024).toFixed(0)} TB`;
  return `${gb.toFixed(0)} GB`;
}

function bytesToGb(bytes: string): number {
  return Number(BigInt(bytes)) / 1073741824;
}

function maskPriceId(id: string): string {
  if (id.length <= 13 || id === "free") return id;
  return `${id.slice(0, 9)}...${id.slice(-4)}`;
}

// ─── Small shared UI ─────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: PlanTier }) {
  const cls =
    tier === "FREE"
      ? "bg-zinc-100 text-zinc-600"
      : tier === "PRO"
        ? "bg-blue-100 text-blue-700"
        : "bg-purple-100 text-purple-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {tier}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-blue-600" : "bg-zinc-300"
      }`}
      aria-label={label}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function addTag(value: string) {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
    setInput("");
  }

  return (
    <div className="min-h-[80px] rounded-lg border border-zinc-200 p-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              className="leading-none text-blue-400 hover:text-blue-700"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(input);
          } else if (e.key === "Backspace" && !input && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder="Type a feature, press Enter"
        className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
      />
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

type EditState = {
  displayName: string;
  stripePriceId: string;
  price: string;
  interval: BillingInterval;
  storageGb: string;
  unlimitedEvents: boolean;
  maxEvents: string;
  features: string[];
  isPopular: boolean;
  isActive: boolean;
  sortOrder: string;
};

function EditModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlanRow;
  onClose: () => void;
  onSaved: (updated: PlanRow) => void;
}) {
  const [form, setForm] = useState<EditState>({
    displayName: plan.displayName,
    stripePriceId: plan.stripePriceId,
    price: plan.price,
    interval: plan.interval,
    storageGb: bytesToGb(plan.storageBytes).toFixed(0),
    unlimitedEvents: plan.maxEvents === null,
    maxEvents: plan.maxEvents?.toString() ?? "",
    features: [...plan.features],
    isPopular: plan.isPopular,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder.toString(),
  });

  const [error, setError] = useState("");
  const [verifyState, setVerifyState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "ok"; detail: string } | { status: "err"; detail: string }
  >({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof EditState>(key: K, value: EditState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleVerify() {
    if (!form.stripePriceId.trim()) return;
    setVerifyState({ status: "loading" });
    startTransition(async () => {
      const res = await verifyStripePriceAction(form.stripePriceId.trim());
      if (res.valid) {
        const amountStr = `$${res.amount.toFixed(2)}`;
        const status = res.active ? "active" : "inactive";
        setVerifyState({
          status: "ok",
          detail: `Found: ${res.productName} — ${amountStr}/${res.interval} (${status})`,
        });
      } else {
        setVerifyState({ status: "err", detail: res.error });
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const priceNum = parseFloat(form.price);
    const storageGbNum = parseFloat(form.storageGb);
    const maxEventsNum = form.unlimitedEvents ? null : parseInt(form.maxEvents, 10);
    const sortOrderNum = parseInt(form.sortOrder, 10);

    if (!form.displayName.trim()) return setError("Display name is required.");
    if (!form.stripePriceId.trim()) return setError("Stripe Price ID is required.");
    if (isNaN(priceNum) || priceNum < 0) return setError("Invalid price.");
    if (isNaN(storageGbNum) || storageGbNum <= 0) return setError("Invalid storage GB.");
    if (!form.unlimitedEvents && (isNaN(maxEventsNum!) || maxEventsNum! <= 0))
      return setError("Invalid max events.");
    if (form.features.length === 0) return setError("At least one feature is required.");

    const input: UpdatePlanInput = {
      displayName: form.displayName.trim(),
      stripePriceId: form.stripePriceId.trim(),
      price: priceNum,
      interval: form.interval,
      storageGb: storageGbNum,
      maxEvents: maxEventsNum,
      features: form.features,
      isPopular: form.isPopular,
      isActive: form.isActive,
      sortOrder: isNaN(sortOrderNum) ? 0 : sortOrderNum,
    };

    startTransition(async () => {
      const res = await updateStripePlanAction(plan.id, input);
      if (res.error) {
        setError(res.error);
        return;
      }
      onSaved({
        ...plan,
        displayName: input.displayName,
        stripePriceId: input.stripePriceId,
        price: input.price.toFixed(2),
        interval: input.interval,
        storageBytes: BigInt(Math.round(input.storageGb * 1073741824)).toString(),
        maxEvents: input.maxEvents,
        features: input.features,
        isPopular: input.isPopular,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      });
    });
  }

  const labelCls = "block text-sm font-medium text-zinc-700 mb-1";
  const inputCls =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 id="edit-modal-title" className="text-lg font-semibold text-zinc-900">
              Edit Plan
            </h2>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-sm text-zinc-500">{plan.name}</span>
              <TierBadge tier={plan.tier} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {/* Display name */}
          <div>
            <label className={labelCls}>Display name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              className={inputCls}
              placeholder="e.g. Pro Plan"
            />
          </div>

          {/* Stripe Price ID + verify */}
          <div>
            <label className={labelCls}>Stripe Price ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.stripePriceId}
                onChange={(e) => {
                  set("stripePriceId", e.target.value);
                  setVerifyState({ status: "idle" });
                }}
                className={`${inputCls} flex-1`}
                placeholder="price_xxxx"
              />
              <button
                type="button"
                onClick={handleVerify}
                disabled={isPending || !form.stripePriceId.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {verifyState.status === "loading" ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Checking…
                  </>
                ) : "Verify with Stripe"}
              </button>
            </div>
            {verifyState.status === "ok" && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-green-600">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                </svg>
                {verifyState.detail}
              </p>
            )}
            {verifyState.status === "err" && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                </svg>
                {verifyState.detail}
              </p>
            )}
          </div>

          {/* Price + interval */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Billing interval</label>
              <select
                value={form.interval}
                onChange={(e) => set("interval", e.target.value as BillingInterval)}
                className={inputCls}
              >
                <option value="MONTH">Monthly</option>
                <option value="YEAR">Yearly</option>
              </select>
            </div>
          </div>

          {/* Storage */}
          <div>
            <label className={labelCls}>Storage limit (GB)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.storageGb}
              onChange={(e) => set("storageGb", e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Max events */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0`}>Max events</label>
              <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.unlimitedEvents}
                  onChange={(e) => set("unlimitedEvents", e.target.checked)}
                  className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                Unlimited
              </label>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              value={form.unlimitedEvents ? "" : form.maxEvents}
              onChange={(e) => set("maxEvents", e.target.value)}
              disabled={form.unlimitedEvents}
              className={`${inputCls} disabled:bg-zinc-50 disabled:text-zinc-400`}
              placeholder={form.unlimitedEvents ? "Unlimited" : "e.g. 10"}
            />
          </div>

          {/* Features */}
          <div>
            <label className={labelCls}>Features</label>
            <TagInput tags={form.features} onChange={(v) => set("features", v)} />
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-100 p-3">
            <div className="space-y-3 w-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-700">Most Popular</p>
                  <p className="text-xs text-zinc-500">Shows &ldquo;Most Popular&rdquo; badge</p>
                </div>
                <Toggle
                  checked={form.isPopular}
                  onChange={(v) => set("isPopular", v)}
                  label="Most Popular"
                />
              </div>
              <div className="h-px bg-zinc-100" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-700">Active</p>
                  <p className="text-xs text-zinc-500">Show on pricing page</p>
                </div>
                <Toggle
                  checked={form.isActive}
                  onChange={(v) => set("isActive", v)}
                  label="Active"
                />
              </div>
            </div>
          </div>

          {/* Sort order */}
          <div>
            <label className={labelCls}>Sort order</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
              className={inputCls}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || (form.stripePriceId.trim() !== plan.stripePriceId && verifyState.status !== "ok")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Sync Modal ───────────────────────────────────────────────────────────────

function SyncModal({
  results,
  onClose,
}: {
  results: SyncResultItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changed   = results.filter((r) => !r.notFound && !r.noStripePrice && (r.priceChanged || r.productIdChanged));
  const unchanged = results.filter((r) => !r.notFound && !r.noStripePrice && !r.priceChanged && !r.productIdChanged);
  const notFound  = results.filter((r) => r.notFound);
  const noPrice   = results.filter((r) => r.noStripePrice);

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 id="sync-modal-title" className="text-lg font-semibold text-zinc-900">
            Stripe Sync Results
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {results.length === 0 && (
            <p className="text-sm text-zinc-500">No active plans found.</p>
          )}

          {changed.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                Updated ({changed.length})
              </p>
              <ul className="space-y-2">
                {changed.map((r) => (
                  <li key={r.priceId} className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
                    <p className="font-medium text-zinc-800">{r.planName}</p>
                    {r.priceChanged && (
                      <p className="text-zinc-600">
                        Price: <span className="line-through text-zinc-400">${r.oldPrice}</span>{" "}
                        → <span className="font-medium text-amber-700">${r.newPrice}</span>
                      </p>
                    )}
                    {r.productIdChanged && (
                      <p className="text-zinc-600 text-xs mt-0.5">
                        Product ID changed
                        {r.oldProductId ? `: ${r.oldProductId.slice(-8)}` : " (was null)"}
                        {" → "}
                        {r.newProductId ? r.newProductId.slice(-8) : "null"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unchanged.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                No changes ({unchanged.length})
              </p>
              <ul className="space-y-1.5">
                {unchanged.map((r) => (
                  <li key={r.priceId} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm">
                    <span className="font-medium text-zinc-700">{r.planName}</span>
                    <span className="flex items-center gap-1.5 text-zinc-500">
                      <svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                      </svg>
                      ${r.oldPrice} · no change
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {noPrice.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                No Stripe Price configured ({noPrice.length})
              </p>
              <ul className="space-y-1.5">
                {noPrice.map((r) => (
                  <li key={r.priceId} className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                    <p className="font-medium text-zinc-700">{r.planName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      This plan uses the <code className="rounded bg-zinc-200 px-1">free</code> sentinel — it has no Stripe Price ID.
                      To link your $0 Stripe price, open <strong>Edit</strong> on this plan and paste the real Price ID (e.g. <code className="rounded bg-zinc-200 px-1">price_xxx</code>).
                      The next sync will then pick it up automatically.
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notFound.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">
                Not found in Stripe ({notFound.length})
              </p>
              <ul className="space-y-1.5">
                {notFound.map((r) => (
                  <li key={r.priceId} className="rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 text-sm">
                    <span className="font-medium text-zinc-700">{r.planName}</span>
                    <span className="ml-2 font-mono text-xs text-red-500">{r.priceId}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-zinc-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Create Plan Modal ────────────────────────────────────────────────────────

type CreateState = {
  productName: string;
  displayName: string;
  tier: PlanTier;
  price: string;
  interval: BillingInterval;
  storageGb: string;
  unlimitedEvents: boolean;
  maxEvents: string;
  features: string[];
  isPopular: boolean;
  isActive: boolean;
  sortOrder: string;
};

function CreatePlanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (plan: PlanRow) => void;
}) {
  const [form, setForm] = useState<CreateState>({
    productName: "",
    displayName: "",
    tier: "PRO",
    price: "",
    interval: "MONTH",
    storageGb: "",
    unlimitedEvents: false,
    maxEvents: "",
    features: [],
    isPopular: false,
    isActive: true,
    sortOrder: "0",
  });

  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof CreateState>(key: K, value: CreateState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const priceNum = parseFloat(form.price);
    const storageGbNum = parseFloat(form.storageGb);
    const maxEventsNum = form.unlimitedEvents ? null : parseInt(form.maxEvents, 10);
    const sortOrderNum = parseInt(form.sortOrder, 10);

    if (!form.productName.trim()) return setError("Stripe product name is required.");
    if (!form.displayName.trim()) return setError("Display name is required.");
    if (isNaN(priceNum) || priceNum < 0) return setError("Invalid price.");
    if (isNaN(storageGbNum) || storageGbNum <= 0) return setError("Invalid storage GB.");
    if (!form.unlimitedEvents && (isNaN(maxEventsNum!) || maxEventsNum! <= 0))
      return setError("Invalid max events.");
    if (form.features.length === 0) return setError("At least one feature is required.");

    const input: CreatePlanInput = {
      productName: form.productName.trim(),
      displayName: form.displayName.trim(),
      tier: form.tier,
      price: priceNum,
      interval: form.interval,
      storageGb: storageGbNum,
      maxEvents: maxEventsNum,
      features: form.features,
      isPopular: form.isPopular,
      isActive: form.isActive,
      sortOrder: isNaN(sortOrderNum) ? 0 : sortOrderNum,
    };

    startTransition(async () => {
      const res = await createStripePlanAction(input);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onCreated({
        id: res.id,
        name: input.tier,
        displayName: input.displayName,
        tier: input.tier,
        stripePriceId: res.stripePriceId,
        stripeProductId: res.stripeProductId,
        price: input.price.toFixed(2),
        currency: "usd",
        interval: input.interval,
        storageBytes: BigInt(Math.round(input.storageGb * 1073741824)).toString(),
        maxEvents: input.maxEvents,
        features: input.features,
        isActive: input.isActive,
        isPopular: input.isPopular,
        sortOrder: input.sortOrder,
      });
    });
  }

  const labelCls = "block text-sm font-medium text-zinc-700 mb-1";
  const inputCls =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-modal-title"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 id="create-modal-title" className="text-lg font-semibold text-zinc-900">
              Create New Plan
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Creates a Stripe Product + Price, then saves the plan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">

          {/* Stripe product name */}
          <div>
            <label className={labelCls}>
              Stripe product name
              <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">Stripe</span>
            </label>
            <input
              type="text"
              value={form.productName}
              onChange={(e) => set("productName", e.target.value)}
              className={inputCls}
              placeholder="e.g. Pro Plan"
            />
            <p className="mt-1 text-xs text-zinc-400">Name of the product created in your Stripe account.</p>
          </div>

          {/* Display name */}
          <div>
            <label className={labelCls}>Display name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              className={inputCls}
              placeholder="e.g. Pro Plan"
            />
          </div>

          {/* Tier */}
          <div>
            <label className={labelCls}>Tier</label>
            <select
              value={form.tier}
              onChange={(e) => set("tier", e.target.value as PlanTier)}
              className={inputCls}
            >
              <option value="FREE">FREE</option>
              <option value="PRO">PRO</option>
              <option value="STUDIO">STUDIO</option>
            </select>
          </div>

          {/* Price + interval */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelCls}>Billing interval</label>
              <select
                value={form.interval}
                onChange={(e) => set("interval", e.target.value as BillingInterval)}
                className={inputCls}
              >
                <option value="MONTH">Monthly</option>
                <option value="YEAR">Yearly</option>
              </select>
            </div>
          </div>

          {/* Storage */}
          <div>
            <label className={labelCls}>Storage limit (GB)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.storageGb}
              onChange={(e) => set("storageGb", e.target.value)}
              className={inputCls}
              placeholder="e.g. 50"
            />
          </div>

          {/* Max events */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0`}>Max events</label>
              <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.unlimitedEvents}
                  onChange={(e) => set("unlimitedEvents", e.target.checked)}
                  className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                Unlimited
              </label>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              value={form.unlimitedEvents ? "" : form.maxEvents}
              onChange={(e) => set("maxEvents", e.target.value)}
              disabled={form.unlimitedEvents}
              className={`${inputCls} disabled:bg-zinc-50 disabled:text-zinc-400`}
              placeholder={form.unlimitedEvents ? "Unlimited" : "e.g. 10"}
            />
          </div>

          {/* Features */}
          <div>
            <label className={labelCls}>Features</label>
            <TagInput tags={form.features} onChange={(v) => set("features", v)} />
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-100 p-3">
            <div className="space-y-3 w-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-700">Most Popular</p>
                  <p className="text-xs text-zinc-500">Shows &ldquo;Most Popular&rdquo; badge</p>
                </div>
                <Toggle checked={form.isPopular} onChange={(v) => set("isPopular", v)} label="Most Popular" />
              </div>
              <div className="h-px bg-zinc-100" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-700">Active</p>
                  <p className="text-xs text-zinc-500">Show on pricing page</p>
                </div>
                <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label="Active" />
              </div>
            </div>
          </div>

          {/* Sort order */}
          <div>
            <label className={labelCls}>Sort order</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
              className={inputCls}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {isPending && (
            <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-700">
              <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Creating product and price in Stripe…
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                "Creating…"
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  Create plan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onEdit,
  onDeleted,
}: {
  plan: PlanRow;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const priceNum = parseFloat(plan.price);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, startDeleteTransition] = useTransition();

  function handleConfirmDelete() {
    setDeleteError("");
    startDeleteTransition(async () => {
      const res = await deleteStripePlanAction(plan.id);
      if (res.error) {
        setDeleteError(res.error);
        setConfirming(false);
      } else {
        onDeleted(plan.id);
      }
    });
  }

  return (
    <div
      className={`relative rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${
        plan.isPopular ? "border-blue-300 ring-1 ring-blue-200" : "border-zinc-200"
      } ${!plan.isActive ? "opacity-60" : ""}`}
    >
      {/* Popular badge */}
      {plan.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white shadow">
            Most Popular
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-900">{plan.displayName}</h3>
            <TierBadge tier={plan.tier} />
          </div>
          <p className="mt-1 font-mono text-xs text-zinc-400">{maskPriceId(plan.stripePriceId)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-zinc-900">
            {priceNum === 0 ? "Free" : `$${priceNum.toFixed(0)}`}
          </p>
          {priceNum > 0 && (
            <p className="text-xs text-zinc-400">
              / {plan.interval === "MONTH" ? "mo" : "yr"}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Storage</p>
          <p className="text-sm font-semibold text-zinc-800">{formatStorage(plan.storageBytes)}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Max events</p>
          <p className="text-sm font-semibold text-zinc-800">
            {plan.maxEvents === null ? "Unlimited" : plan.maxEvents}
          </p>
        </div>
      </div>

      {/* Features */}
      <ul className="mt-4 space-y-1.5">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="mt-5 border-t border-zinc-100 pt-4">
        {/* Delete error */}
        {deleteError && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">{deleteError}</p>
        )}

        {/* Confirm delete prompt */}
        {confirming ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-600 font-medium">Delete this plan?</p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setConfirming(false); setDeleteError(""); }}
                disabled={isDeleting}
                className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Deleting…
                  </>
                ) : "Yes, delete"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-default select-none">
                <span className={`inline-block h-2 w-2 rounded-full ${plan.isActive ? "bg-green-500" : "bg-zinc-300"}`} />
                {plan.isActive ? "Active" : "Inactive"}
              </label>
              {plan.isPopular && (
                <label className="flex items-center gap-1.5 text-xs text-blue-500 select-none">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  Popular
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlansClient({ plans: initialPlans }: { plans: PlanRow[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResultItem[] | null>(null);
  const [syncError, setSyncError] = useState("");
  const [isSyncing, startSyncTransition] = useTransition();

  function handleSaved(updated: PlanRow) {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingPlan(null);
  }

  function handleCreated(plan: PlanRow) {
    setPlans((prev) => [...prev, plan]);
    setShowCreateModal(false);
  }

  function handleDeleted(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSync() {
    setSyncError("");
    startSyncTransition(async () => {
      const res = await syncPlansFromStripeAction();
      if (res.error || !res.results) {
        setSyncError(res.error ?? "Unexpected sync error.");
        return;
      }
      const results = res.results;
      // Refresh local prices for any changed plans
      setPlans((prev) =>
        prev.map((p) => {
          const found = results.find((r) => r.priceId === p.stripePriceId);
          if (found && found.priceChanged) return { ...p, price: found.newPrice };
          return p;
        })
      );
      setSyncResults(results);
    });
  }

  return (
    <div className="space-y-10">
      {/* ── Section 1: Plan cards ── */}
      <section>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Plans</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Manage your Stripe pricing plans. Create new plans here — they&apos;re created in Stripe
              automatically. Use &ldquo;Sync&rdquo; to pull price changes from the Stripe dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            New Plan
          </button>
        </div>

        {plans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-400">
            No plans yet. Click &ldquo;New Plan&rdquo; to create your first plan.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={() => setEditingPlan(plan)}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: Sync ── */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Sync Plans from Stripe Dashboard</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Fetches prices from Stripe and updates the price and product ID for any plans that have
              changed. Plans without a real Stripe Price ID are shown but not synced.
            </p>
            {syncError && (
              <p className="mt-2 text-sm text-red-600">{syncError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            <svg
              className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
                clipRule="evenodd"
              />
            </svg>
            {isSyncing ? "Syncing…" : "Sync Plans from Stripe Dashboard"}
          </button>
        </div>
      </section>

      {/* ── Create modal ── */}
      {showCreateModal && (
        <CreatePlanModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* ── Edit modal ── */}
      {editingPlan && (
        <EditModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Sync results modal ── */}
      {syncResults !== null && (
        <SyncModal results={syncResults} onClose={() => setSyncResults(null)} />
      )}
    </div>
  );
}
