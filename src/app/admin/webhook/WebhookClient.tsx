"use client";

import { useState, useTransition } from "react";
import {
  saveWebhookConfigAction,
  toggleWebhookActiveAction,
  testWebhookAction,
  getWebhookLogsAction,
  type WebhookLogRow,
} from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WebhookConfigRow = {
  id: string;
  endpointUrl: string;
  hasSecret: boolean;
  isActive: boolean;
  lastVerifiedAt: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "SUCCESS"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-blue-600" : "bg-zinc-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WebhookClient({
  config: initialConfig,
  logs: initialLogs,
}: {
  config: WebhookConfigRow | null;
  logs: WebhookLogRow[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [logs, setLogs] = useState(initialLogs);

  // ── Config form state ──────────────────────────────────────────────────────
  const [endpointUrl, setEndpointUrl] = useState(initialConfig?.endpointUrl ?? "");
  const [newSecret, setNewSecret] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [confirmPending, setConfirmPending] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();

  // ── Test state ─────────────────────────────────────────────────────────────
  const [testState, setTestState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "ok"; detail: string }
    | { status: "err"; detail: string }
  >({ status: "idle" });
  const [isTesting, startTestTransition] = useTransition();

  // ── Active toggle ──────────────────────────────────────────────────────────
  const [isTogglingActive, startToggleTransition] = useTransition();

  // ── Logs refresh ──────────────────────────────────────────────────────────
  const [logsError, setLogsError] = useState("");
  const [isRefreshingLogs, startLogsTransition] = useTransition();

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaveClick() {
    setFormError("");
    setFormSuccess("");
    if (!endpointUrl.trim()) { setFormError("Endpoint URL is required."); return; }
    if (!newSecret.trim()) { setFormError("Webhook secret is required."); return; }
    setConfirmPending(true);
  }

  function handleConfirmSave() {
    setConfirmPending(false);
    startSaveTransition(async () => {
      const res = await saveWebhookConfigAction(endpointUrl, newSecret);
      if (res.error) {
        setFormError(res.error);
        return;
      }
      setNewSecret("");
      setFormSuccess("Webhook configuration saved successfully.");
      setConfig({
        id: crypto.randomUUID(),
        endpointUrl: endpointUrl.trim(),
        hasSecret: true,
        isActive: true,
        lastVerifiedAt: null,
      });
    });
  }

  function handleToggleActive(newValue: boolean) {
    if (!config) return;
    startToggleTransition(async () => {
      const res = await toggleWebhookActiveAction(config.id, newValue);
      if (!res.error) setConfig((c) => c ? { ...c, isActive: newValue } : c);
    });
  }

  function handleTest() {
    setTestState({ status: "running" });
    startTestTransition(async () => {
      const res = await testWebhookAction();
      if (res.ok) {
        setTestState({ status: "ok", detail: res.detail });
        setConfig((c) => c ? { ...c, lastVerifiedAt: new Date().toISOString() } : c);
      } else {
        setTestState({ status: "err", detail: res.detail });
      }
    });
  }

  function handleRefreshLogs() {
    setLogsError("");
    startLogsTransition(async () => {
      const res = await getWebhookLogsAction();
      if ("error" in res) {
        setLogsError(res.error);
      } else {
        setLogs(res.logs);
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const sectionCls = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
  const labelCls = "block text-sm font-medium text-zinc-700 mb-1";
  const inputCls = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Webhook Configuration</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage the Stripe webhook endpoint and monitor incoming events.
        </p>
      </div>

      {/* ── Current config ── */}
      <section className={sectionCls}>
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Current Configuration
        </h2>

        {config ? (
          <dl className="space-y-4">
            {/* Endpoint URL */}
            <div className="flex items-start justify-between gap-4">
              <dt className="w-36 shrink-0 text-sm text-zinc-500">Endpoint URL</dt>
              <dd className="min-w-0 flex-1 break-all font-mono text-sm text-zinc-800">
                {config.endpointUrl}
              </dd>
            </div>

            {/* Secret status */}
            <div className="flex items-center justify-between gap-4">
              <dt className="w-36 shrink-0 text-sm text-zinc-500">Webhook secret</dt>
              <dd className="flex items-center gap-1.5 text-sm">
                {config.hasSecret ? (
                  <>
                    <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium text-emerald-700">Set</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium text-red-600">Not set</span>
                  </>
                )}
              </dd>
            </div>

            {/* Last verified */}
            <div className="flex items-center justify-between gap-4">
              <dt className="w-36 shrink-0 text-sm text-zinc-500">Last verified</dt>
              <dd className="text-sm text-zinc-800">
                {config.lastVerifiedAt
                  ? <span title={formatTs(config.lastVerifiedAt)}>{timeAgo(config.lastVerifiedAt)}</span>
                  : <span className="text-zinc-400 italic">Never</span>
                }
              </dd>
            </div>

            {/* Is Active toggle */}
            <div className="flex items-center justify-between gap-4">
              <dt className="w-36 shrink-0 text-sm text-zinc-500">Active</dt>
              <dd>
                <Toggle
                  checked={config.isActive}
                  onChange={handleToggleActive}
                  disabled={isTogglingActive}
                  label="Toggle webhook active"
                />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-zinc-400 italic">No webhook configured yet. Use the form below to set one up.</p>
        )}
      </section>

      {/* ── Update secret form ── */}
      <section className={sectionCls}>
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Update Webhook Secret
        </h2>

        <div className="space-y-4">
          {/* Endpoint URL */}
          <div>
            <label className={labelCls}>Endpoint URL</label>
            <input
              type="url"
              value={endpointUrl}
              onChange={(e) => { setEndpointUrl(e.target.value); setFormError(""); setFormSuccess(""); }}
              className={inputCls}
              placeholder="https://yourdomain.com/api/stripe/webhook"
            />
          </div>

          {/* Webhook secret */}
          <div>
            <label className={labelCls}>Webhook signing secret</label>
            <input
              type="password"
              value={newSecret}
              onChange={(e) => { setNewSecret(e.target.value); setFormError(""); setFormSuccess(""); }}
              className={inputCls}
              placeholder="whsec_••••••••••••••••••••••••••••••••"
              autoComplete="new-password"
            />
            <p className="mt-1.5 text-xs text-zinc-400">
              Paste from{" "}
              <span className="font-medium text-zinc-500">Stripe Dashboard → Webhooks → your endpoint → Signing secret</span>
            </p>
          </div>

          {/* Error / success */}
          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}
          {formSuccess && (
            <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
              {formSuccess}
            </p>
          )}

          {/* Confirmation prompt */}
          {confirmPending ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800">
                Are you sure? This will immediately affect all incoming Stripe webhooks.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={isSaving}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Yes, save it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPending(false)}
                  className="rounded-lg border border-amber-200 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={isSaving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save configuration"}
            </button>
          )}
        </div>
      </section>

      {/* ── Test webhook ── */}
      <section className={sectionCls}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Test Webhook
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Sends a signed test ping to <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">/api/stripe/webhook</code> using
          the stored secret to verify the signature check is working end-to-end.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting || !config?.hasSecret}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Sending…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.849-8.44.75.75 0 0 0 0-1.044A28.897 28.897 0 0 0 3.105 2.288Z" />
                </svg>
                Send test ping
              </>
            )}
          </button>

          {testState.status === "ok" && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-700">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
              ✅ {testState.detail}
            </span>
          )}
          {testState.status === "err" && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
              </svg>
              ❌ {testState.detail}
            </span>
          )}
        </div>

        {!config?.hasSecret && (
          <p className="mt-3 text-xs text-zinc-400 italic">Save a webhook secret above to enable testing.</p>
        )}
      </section>

      {/* ── Event log ── */}
      <section className={sectionCls}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Event Log{" "}
            <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal normal-case tracking-normal text-zinc-500">
              last 20
            </span>
          </h2>
          <button
            type="button"
            onClick={handleRefreshLogs}
            disabled={isRefreshingLogs}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${isRefreshingLogs ? "animate-spin" : ""}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
            </svg>
            Refresh
          </button>
        </div>

        {logsError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{logsError}</p>
        )}

        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400 italic">
            No webhook events received yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <th className="pb-3 pr-4">Timestamp</th>
                  <th className="pb-3 pr-4">Event type</th>
                  <th className="pb-3 pr-4">Event ID</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4 text-right">Time (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {logs.map((log) => (
                  <tr key={log.id} className="group hover:bg-zinc-50">
                    <td className="py-2.5 pr-4 text-xs text-zinc-500" title={formatTs(log.receivedAt)}>
                      {timeAgo(log.receivedAt)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-zinc-800">
                      {log.eventType}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-zinc-400">
                      {log.stripeEventId.length > 20
                        ? `${log.stripeEventId.slice(0, 12)}…${log.stripeEventId.slice(-8)}`
                        : log.stripeEventId}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={log.status} />
                        {log.errorMessage && (
                          <span className="max-w-xs truncate text-[10px] text-red-500" title={log.errorMessage}>
                            {log.errorMessage}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs text-zinc-500">
                      {log.processingMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
