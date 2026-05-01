"use client";

import { useState, useTransition } from "react";
import {
  savePlatformSettingsAction,
  savePlanLimitsAction,
  saveSesConfigAction,
  sendTestEmailAction,
  getSesQuotaAction,
  saveFaceGlobalSettingsAction,
  saveFacePlanControlsAction,
  checkFaceServiceHealthAction,
  getFaceUsageStatsAction,
  type SesQuota,
  type FaceServiceHealth,
  type FaceUsageStats,
} from "./actions";

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-zinc-400">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
      </div>
      <div className="w-72 shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  activeLabel = "On",
  inactiveLabel = "Off",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
        checked ? "bg-blue-600" : "bg-zinc-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
      <span className="sr-only">{checked ? activeLabel : inactiveLabel}</span>
    </button>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
    >
      {saving ? "Saving…" : "Save changes"}
    </button>
  );
}

function StatusMsg({ error, success }: { error: string; success: string }) {
  if (error)   return <p className="text-sm text-red-600">{error}</p>;
  if (success) return <p className="text-sm text-emerald-600">{success}</p>;
  return null;
}

// ─── Platform settings section ────────────────────────────────────────────────

export function PlatformSettingsSection({
  initial,
}: {
  initial: {
    appName:         string;
    supportEmail:    string;
    maintenanceMode: boolean;
    signupsEnabled:  boolean;
  };
}) {
  const [appName,         setAppName]         = useState(initial.appName);
  const [supportEmail,    setSupportEmail]    = useState(initial.supportEmail);
  const [maintenanceMode, setMaintenanceMode] = useState(initial.maintenanceMode);
  const [signupsEnabled,  setSignupsEnabled]  = useState(initial.signupsEnabled);
  const [err, setErr]     = useState("");
  const [ok,  setOk]      = useState("");
  const [saving, startSave] = useTransition();

  function handleSave() {
    setErr(""); setOk("");
    startSave(async () => {
      const res = await savePlatformSettingsAction({
        appName, supportEmail, maintenanceMode, signupsEnabled,
      });
      if (res.error) { setErr(res.error); return; }
      setOk("Platform settings saved.");
    });
  }

  return (
    <Section
      title="Platform Settings"
      description="Global configuration that affects all users."
    >
      <div className="space-y-5">
        <Field label="App Name" hint="Displayed in emails and the maintenance page.">
          <input
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <div className="border-t border-zinc-100" />

        <Field label="Support Email" hint="Shown on public gallery and error pages.">
          <input
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="support@yourcompany.com"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <div className="border-t border-zinc-100" />

        <Field
          label="Maintenance Mode"
          hint="Redirects /dashboard and /share/* to a maintenance page. Admin panel stays accessible."
        >
          <div className="flex items-center gap-3">
            <Toggle
              checked={maintenanceMode}
              onChange={setMaintenanceMode}
              label="Maintenance Mode"
            />
            <span className={`text-sm font-medium ${maintenanceMode ? "text-amber-600" : "text-zinc-400"}`}>
              {maintenanceMode ? "On — users will see maintenance page" : "Off"}
            </span>
          </div>
          {maintenanceMode && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              ⚠ Maintenance mode is active. Save to apply.
            </p>
          )}
        </Field>

        <div className="border-t border-zinc-100" />

        <Field
          label="New Signups"
          hint="When disabled, the /register page will reject new registrations."
        >
          <div className="flex items-center gap-3">
            <Toggle
              checked={signupsEnabled}
              onChange={setSignupsEnabled}
              label="Signups enabled"
              activeLabel="Enabled"
              inactiveLabel="Disabled"
            />
            <span className={`text-sm font-medium ${signupsEnabled ? "text-zinc-400" : "text-red-600"}`}>
              {signupsEnabled ? "Enabled" : "Disabled — no new registrations"}
            </span>
          </div>
        </Field>

        <div className="border-t border-zinc-100 pt-4 flex items-center justify-between">
          <StatusMsg error={err} success={ok} />
          <SaveButton saving={saving} onClick={handleSave} />
        </div>
      </div>
    </Section>
  );
}

// ─── Plan limits section ──────────────────────────────────────────────────────

function GbInput({
  label,
  value,
  onChange,
  badge,
  badgeCls,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  badge: string;
  badgeCls: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`}>{badge}</span>
        <span className="text-sm font-medium text-zinc-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0.1"
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-sm text-zinc-500">GB</span>
      </div>
    </div>
  );
}

export function PlanLimitsSection({
  initial,
}: {
  initial: {
    storageFreeGb:   number;
    storageProGb:    number;
    storageStudioGb: number;
    maxEventsFree:   number;
    maxEventsPro:    number;
  };
}) {
  const [freeGb,    setFreeGb]    = useState(String(initial.storageFreeGb));
  const [proGb,     setProGb]     = useState(String(initial.storageProGb));
  const [studioGb,  setStudioGb]  = useState(String(initial.storageStudioGb));
  const [evFree,    setEvFree]    = useState(String(initial.maxEventsFree));
  const [evPro,     setEvPro]     = useState(String(initial.maxEventsPro));
  const [err, setErr]   = useState("");
  const [ok,  setOk]    = useState("");
  const [saving, startSave] = useTransition();

  function handleSave() {
    setErr(""); setOk("");
    const vals = {
      storageFreeGb:   parseFloat(freeGb),
      storageProGb:    parseFloat(proGb),
      storageStudioGb: parseFloat(studioGb),
      maxEventsFree:   parseInt(evFree,   10),
      maxEventsPro:    parseInt(evPro,    10),
    };
    if (Object.values(vals).some((v) => isNaN(v) || v <= 0)) {
      setErr("All values must be positive numbers.");
      return;
    }
    startSave(async () => {
      const res = await savePlanLimitsAction(vals);
      if (res.error) { setErr(res.error); return; }
      setOk("Plan limits saved and applied to all existing users.");
    });
  }

  return (
    <Section
      title="Plan Limits"
      description="Changes apply immediately to all existing users of each plan."
    >
      <div className="space-y-5">
        {/* Storage limits */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Storage per plan</p>
          <div className="grid grid-cols-3 gap-3">
            <GbInput label="Free"   value={freeGb}   onChange={setFreeGb}   badge="FREE"   badgeCls="bg-zinc-100  text-zinc-700" />
            <GbInput label="Pro"    value={proGb}     onChange={setProGb}    badge="PRO"    badgeCls="bg-blue-100  text-blue-700" />
            <GbInput label="Studio" value={studioGb}  onChange={setStudioGb} badge="STUDIO" badgeCls="bg-violet-100 text-violet-700" />
          </div>
        </div>

        <div className="border-t border-zinc-100" />

        {/* Event limits */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Max events per plan</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-200 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">FREE</span>
                <span className="text-sm font-medium text-zinc-700">Max events</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" step="1" value={evFree}
                  onChange={(e) => setEvFree(e.target.value)}
                  className="w-24 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-sm text-zinc-500">events</span>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">PRO</span>
                <span className="text-sm font-medium text-zinc-700">Max events</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" step="1" value={evPro}
                  onChange={(e) => setEvPro(e.target.value)}
                  className="w-24 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-sm text-zinc-500">events</span>
              </div>
            </div>
            <div className="flex items-center rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">STUDIO</span>
                </div>
                <p className="text-sm text-zinc-400">Unlimited events</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-4 flex items-center justify-between">
          <StatusMsg error={err} success={ok} />
          <SaveButton saving={saving} onClick={handleSave} />
        </div>
      </div>
    </Section>
  );
}

// Sentinel shown in the secret key field when a value is already stored
const SECRET_MASK = "••••••••";

// ─── Email settings section ───────────────────────────────────────────────────

export function EmailSettingsSection({
  adminEmail,
  initialSes,
}: {
  adminEmail:  string;
  initialSes: {
    fromEmail:  string;
    awsRegion:  string;
    awsKeyId:   string;
    hasSecret:  boolean; // server never sends the actual secret to the client
  };
}) {
  // ── SES config form state ──
  const [fromEmail,  setFromEmail]  = useState(initialSes.fromEmail);
  const [awsRegion,  setAwsRegion]  = useState(initialSes.awsRegion);
  const [awsKeyId,   setAwsKeyId]   = useState(initialSes.awsKeyId);
  // Secret: show mask if already stored, empty if nothing stored yet
  const [awsSecret,  setAwsSecret]  = useState(initialSes.hasSecret ? SECRET_MASK : "");
  const [secretFocused, setSecretFocused] = useState(false);
  const [configErr, setConfigErr]   = useState("");
  const [configOk,  setConfigOk]    = useState("");
  const [savingCfg, startSaveCfg]   = useTransition();

  // ── Test email state ──
  const [testErr,  setTestErr]  = useState("");
  const [testOk,   setTestOk]   = useState("");
  const [sending,  startSend]   = useTransition();

  // ── SES quota state ──
  const [quota,    setQuota]    = useState<SesQuota | null>(null);
  const [quotaErr, setQuotaErr] = useState("");
  const [loadingQ, startLoadQ]  = useTransition();

  function handleSaveConfig() {
    setConfigErr(""); setConfigOk("");
    startSaveCfg(async () => {
      const res = await saveSesConfigAction({ fromEmail, awsRegion, awsKeyId, awsSecret });
      if (res.error) { setConfigErr(res.error); return; }
      setConfigOk("SES configuration saved.");
      // If user typed a new secret, re-mask it
      if (awsSecret && awsSecret !== SECRET_MASK) setAwsSecret(SECRET_MASK);
    });
  }

  function handleTestEmail() {
    setTestErr(""); setTestOk("");
    startSend(async () => {
      const res = await sendTestEmailAction();
      if (res.error) { setTestErr(res.error); return; }
      setTestOk(`Test email sent to ${adminEmail}.`);
    });
  }

  function handleLoadQuota() {
    setQuotaErr("");
    startLoadQ(async () => {
      const res = await getSesQuotaAction();
      if (res.error) { setQuotaErr(res.error); return; }
      setQuota(res.quota!);
    });
  }

  return (
    <Section
      title="Email Settings"
      description="Amazon SES credentials and sending diagnostics."
    >
      <div className="space-y-5">

        {/* ── SES credentials form ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">AWS SES Credentials</p>
          <p className="text-xs text-zinc-400 -mt-2">
            DB settings override environment variables. Leave fields blank to use env vars as fallback.
          </p>

          <Field label="From Email" hint="Must be a verified SES identity (e.g. noreply@yourdomain.com).">
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={process.env.NEXT_PUBLIC_SES_FROM_EMAIL ?? "noreply@yourdomain.com"}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field label="AWS Region" hint='e.g. "us-east-1" or "ap-south-1"'>
            <input
              type="text"
              value={awsRegion}
              onChange={(e) => setAwsRegion(e.target.value)}
              placeholder="us-east-1"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field label="Access Key ID" hint="IAM user with SES send permissions.">
            <input
              type="text"
              value={awsKeyId}
              onChange={(e) => setAwsKeyId(e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field
            label="Secret Access Key"
            hint={initialSes.hasSecret ? "A key is stored. Click to replace it." : "Paste your AWS secret access key."}
          >
            <div className="relative">
              <input
                type={secretFocused || awsSecret !== SECRET_MASK ? "text" : "password"}
                value={awsSecret}
                onFocus={() => {
                  setSecretFocused(true);
                  // Clear mask on focus so user can type a new value
                  if (awsSecret === SECRET_MASK) setAwsSecret("");
                }}
                onBlur={() => {
                  setSecretFocused(false);
                  // Re-mask if user cleared and left blank (restore original mask)
                  if (!awsSecret && initialSes.hasSecret) setAwsSecret(SECRET_MASK);
                }}
                onChange={(e) => setAwsSecret(e.target.value)}
                placeholder={initialSes.hasSecret ? "Enter new key to replace…" : "Paste secret access key"}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {initialSes.hasSecret && awsSecret === SECRET_MASK && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  stored
                </span>
              )}
            </div>
          </Field>

          <div className="flex items-center justify-between pt-1">
            <StatusMsg error={configErr} success={configOk} />
            <SaveButton saving={savingCfg} onClick={handleSaveConfig} />
          </div>
        </div>

        <div className="border-t border-zinc-100" />

        {/* Test email */}
        <Field
          label="Test Email"
          hint={`Sends a test email to your admin address (${adminEmail}).`}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTestEmail}
              disabled={sending}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              {sending ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.849-8.684.75.75 0 0 0 0-1.056A28.897 28.897 0 0 0 3.105 2.288Z" />
                </svg>
              )}
              {sending ? "Sending…" : "Send test email"}
            </button>
            <StatusMsg error={testErr} success={testOk} />
          </div>
        </Field>

        <div className="border-t border-zinc-100" />

        {/* SES quota */}
        <Field
          label="SES Sending Quota"
          hint="24-hour sending limit and current usage from AWS."
        >
          {quota ? (
            <div className="space-y-3">
              {/* Usage bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    {quota.sentLast24Hours.toLocaleString()} of {quota.max24HourSend.toLocaleString()} sent (24h)
                  </span>
                  <span className={`font-semibold ${quota.percentUsed >= 80 ? "text-red-600" : "text-zinc-600"}`}>
                    {quota.percentUsed}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      quota.percentUsed >= 80 ? "bg-red-500" : quota.percentUsed >= 50 ? "bg-amber-400" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, quota.percentUsed)}%` }}
                  />
                </div>
              </div>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2.5">
                  <p className="text-zinc-400">Max send rate</p>
                  <p className="mt-0.5 font-semibold text-zinc-800">{quota.maxSendRate}/sec</p>
                </div>
                <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2.5">
                  <p className="text-zinc-400">Daily limit</p>
                  <p className="mt-0.5 font-semibold text-zinc-800">{quota.max24HourSend.toLocaleString()}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadQuota}
                disabled={loadingQ}
                className="text-xs text-zinc-400 hover:text-zinc-600"
              >
                Refresh
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleLoadQuota}
                disabled={loadingQ}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                {loadingQ ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
                  </svg>
                )}
                {loadingQ ? "Loading…" : "Load SES quota"}
              </button>
              {quotaErr && <p className="text-xs text-red-600">{quotaErr}</p>}
            </div>
          )}
        </Field>
      </div>
    </Section>
  );
}

// ─── Face AI settings section ─────────────────────────────────────────────────

type PlanTier = "FREE" | "PRO" | "STUDIO";

const TIER_BADGE: Record<PlanTier, string> = {
  FREE:   "bg-zinc-100 text-zinc-700",
  PRO:    "bg-blue-100 text-blue-700",
  STUDIO: "bg-violet-100 text-violet-700",
};

function PlanToggleRow({
  tier,
  label,
  checked,
  onChange,
}: {
  tier: PlanTier;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier]}`}>{tier}</span>
        <span className="text-sm text-zinc-700">{label}</span>
      </div>
      <Toggle checked={checked} onChange={onChange} label={`${tier} ${label}`} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3.5">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-400">{sub}</p>}
    </div>
  );
}

export function FaceSettingsSection({
  initial,
}: {
  initial: {
    featureEnabled:      boolean;
    defaultIndexing:     boolean;
    similarityThreshold: number;
    maxPerEvent:         number;
    indexingFree:        boolean;
    indexingPro:         boolean;
    indexingStudio:      boolean;
    searchFree:          boolean;
    searchPro:           boolean;
    searchStudio:        boolean;
    maxSearchesFree:     number;
    maxSearchesPro:      number;
    maxSearchesStudio:   number;
  };
}) {
  // ── Global controls state ──
  const [featureEnabled,      setFeatureEnabled]      = useState(initial.featureEnabled);
  const [defaultIndexing,     setDefaultIndexing]     = useState(initial.defaultIndexing);
  const [similarityThreshold, setSimilarityThreshold] = useState(String(initial.similarityThreshold));
  const [maxPerEvent,         setMaxPerEvent]         = useState(String(initial.maxPerEvent));
  const [globalErr, setGlobalErr] = useState("");
  const [globalOk,  setGlobalOk]  = useState("");
  const [savingGlobal, startSaveGlobal] = useTransition();

  // ── Plan controls state ──
  const [indexingFree,       setIndexingFree]       = useState(initial.indexingFree);
  const [indexingPro,        setIndexingPro]        = useState(initial.indexingPro);
  const [indexingStudio,     setIndexingStudio]     = useState(initial.indexingStudio);
  const [searchFree,         setSearchFree]         = useState(initial.searchFree);
  const [searchPro,          setSearchPro]          = useState(initial.searchPro);
  const [searchStudio,       setSearchStudio]       = useState(initial.searchStudio);
  const [maxSearchesFree,    setMaxSearchesFree]    = useState(String(initial.maxSearchesFree));
  const [maxSearchesPro,     setMaxSearchesPro]     = useState(String(initial.maxSearchesPro));
  const [maxSearchesStudio,  setMaxSearchesStudio]  = useState(String(initial.maxSearchesStudio));
  const [planErr, setPlanErr] = useState("");
  const [planOk,  setPlanOk]  = useState("");
  const [savingPlan, startSavePlan] = useTransition();

  // ── Health check state ──
  const [health,      setHealth]      = useState<FaceServiceHealth | null>(null);
  const [healthErr,   setHealthErr]   = useState("");
  const [checkingHealth, startCheckHealth] = useTransition();

  // ── Usage stats state ──
  const [stats,     setStats]     = useState<FaceUsageStats | null>(null);
  const [statsErr,  setStatsErr]  = useState("");
  const [loadingStats, startLoadStats] = useTransition();

  function handleSaveGlobal() {
    setGlobalErr(""); setGlobalOk("");
    startSaveGlobal(async () => {
      const threshold = parseFloat(similarityThreshold);
      const maxPer    = parseInt(maxPerEvent, 10);
      if (isNaN(threshold) || threshold < 0.5 || threshold > 0.8) {
        setGlobalErr("Similarity threshold must be 0.5 – 0.8.");
        return;
      }
      if (isNaN(maxPer) || maxPer < 1) {
        setGlobalErr("Max faces per event must be at least 1.");
        return;
      }
      const res = await saveFaceGlobalSettingsAction({ featureEnabled, defaultIndexing, similarityThreshold: threshold, maxPerEvent: maxPer });
      if (res.error) { setGlobalErr(res.error); return; }
      setGlobalOk("Face AI settings saved.");
    });
  }

  function handleSavePlanControls() {
    setPlanErr(""); setPlanOk("");
    startSavePlan(async () => {
      const res = await saveFacePlanControlsAction({
        indexingFree, indexingPro, indexingStudio,
        searchFree, searchPro, searchStudio,
        maxSearchesFree:   parseInt(maxSearchesFree,   10) || 0,
        maxSearchesPro:    parseInt(maxSearchesPro,    10) || 0,
        maxSearchesStudio: parseInt(maxSearchesStudio, 10) || 0,
      });
      if (res.error) { setPlanErr(res.error); return; }
      setPlanOk("Plan controls saved.");
    });
  }

  function handleCheckHealth() {
    setHealthErr(""); setHealth(null);
    startCheckHealth(async () => {
      const res = await checkFaceServiceHealthAction();
      if (res.error) { setHealthErr(res.error); return; }
      setHealth(res.health!);
    });
  }

  function handleLoadStats() {
    setStatsErr(""); setStats(null);
    startLoadStats(async () => {
      const res = await getFaceUsageStatsAction();
      if (res.error) { setStatsErr(res.error); return; }
      setStats(res.stats!);
    });
  }

  return (
    <Section
      title="Face AI"
      description="Controls for the face detection and selfie search features."
    >
      <div className="space-y-8">

        {/* ── Global Controls ── */}
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Global Controls</p>

          <Field
            label="Face Detection Feature"
            hint="Master toggle. When off, all face UI is hidden across the entire platform."
          >
            <div className="flex items-center gap-3">
              <Toggle
                checked={featureEnabled}
                onChange={setFeatureEnabled}
                label="Face Detection Feature Enabled"
              />
              <span className={`text-sm font-medium ${featureEnabled ? "text-zinc-400" : "text-red-600"}`}>
                {featureEnabled ? "Enabled" : "Disabled — face UI hidden platform-wide"}
              </span>
            </div>
          </Field>

          <div className="border-t border-zinc-100" />

          <Field
            label="Default Face Indexing for New Events"
            hint="When on, face indexing is pre-enabled when photographers create a new event."
          >
            <div className="flex items-center gap-3">
              <Toggle
                checked={defaultIndexing}
                onChange={setDefaultIndexing}
                label="Default face indexing"
                activeLabel="On by default"
                inactiveLabel="Off by default"
              />
              <span className="text-sm text-zinc-400">
                {defaultIndexing ? "On by default" : "Off by default"}
              </span>
            </div>
          </Field>

          <div className="border-t border-zinc-100" />

          <Field
            label="Similarity Threshold"
            hint="How strict face matching is (0.5 = loose, 0.8 = strict). Default: 0.6."
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.5"
                  max="0.8"
                  step="0.05"
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(e.target.value)}
                  className="w-40 accent-blue-600"
                />
                <span className="w-10 text-sm font-mono font-semibold text-zinc-800">{parseFloat(similarityThreshold).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-zinc-400">
                <span>0.50 — Loose</span>
                <span>0.80 — Strict</span>
              </div>
            </div>
          </Field>

          <div className="border-t border-zinc-100" />

          <Field
            label="Max Faces per Event"
            hint="Maximum number of face embeddings stored per event. Default: 10,000."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="100"
                step="1000"
                value={maxPerEvent}
                onChange={(e) => setMaxPerEvent(e.target.value)}
                className="w-28 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-sm text-zinc-500">faces</span>
            </div>
          </Field>

          <div className="border-t border-zinc-100 pt-4 flex items-center justify-between">
            <StatusMsg error={globalErr} success={globalOk} />
            <SaveButton saving={savingGlobal} onClick={handleSaveGlobal} />
          </div>
        </div>

        {/* ── Face Service Health ── */}
        <div className="space-y-4 border-t border-zinc-100 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Face Service Health</p>
          {health ? (
            <div className="space-y-3">
              <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${health.online ? "bg-emerald-50" : "bg-red-50"}`}>
                <span className="text-lg">{health.online ? "✅" : "❌"}</span>
                <div>
                  <p className={`text-sm font-semibold ${health.online ? "text-emerald-800" : "text-red-800"}`}>
                    {health.online ? "Online" : "Offline"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {health.responseMs}ms · checked {new Date(health.checkedAt).toLocaleTimeString()}
                  </p>
                  {health.detail && (
                    <p className="mt-0.5 text-xs text-red-600">{health.detail}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCheckHealth}
                disabled={checkingHealth}
                className="text-xs text-zinc-400 hover:text-zinc-600"
              >
                Test again
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCheckHealth}
                disabled={checkingHealth}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                {checkingHealth ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                  </svg>
                )}
                {checkingHealth ? "Checking…" : "Test Face Service"}
              </button>
              {healthErr && <p className="text-xs text-red-600">{healthErr}</p>}
            </div>
          )}
        </div>

        {/* ── Usage Stats ── */}
        <div className="space-y-4 border-t border-zinc-100 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Usage Statistics</p>
          {stats ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Faces indexed" value={stats.totalFacesIndexed.toLocaleString()} sub="across all events" />
                <StatCard label="Searches today" value={stats.searchesToday.toLocaleString()} sub="face search sessions" />
                <StatCard label="Selfies pending deletion" value={stats.selfiesPendingDeletion.toLocaleString()} sub="S3 lifecycle < 24h" />
                <StatCard label="Events with indexing" value={stats.eventsWithIndexing.toLocaleString()} sub="face indexing enabled" />
              </div>
              <button
                type="button"
                onClick={handleLoadStats}
                disabled={loadingStats}
                className="text-xs text-zinc-400 hover:text-zinc-600"
              >
                Refresh
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleLoadStats}
                disabled={loadingStats}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                {loadingStats ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633l-.683-2.051Z" />
                  </svg>
                )}
                {loadingStats ? "Loading…" : "Load usage stats"}
              </button>
              {statsErr && <p className="text-xs text-red-600">{statsErr}</p>}
            </div>
          )}
        </div>

        {/* ── Plan Controls ── */}
        <div className="space-y-5 border-t border-zinc-100 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Plan Controls</p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Face Indexing per plan */}
            <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-semibold text-zinc-600">Face Indexing Access</p>
              <PlanToggleRow tier="FREE"   label="can index faces"   checked={indexingFree}   onChange={setIndexingFree} />
              <PlanToggleRow tier="PRO"    label="can index faces"   checked={indexingPro}    onChange={setIndexingPro} />
              <PlanToggleRow tier="STUDIO" label="can index faces"   checked={indexingStudio} onChange={setIndexingStudio} />
            </div>

            {/* Face Search per plan */}
            <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-semibold text-zinc-600">Customer Face Search Access</p>
              <PlanToggleRow tier="FREE"   label="customers can search" checked={searchFree}   onChange={setSearchFree} />
              <PlanToggleRow tier="PRO"    label="customers can search" checked={searchPro}    onChange={setSearchPro} />
              <PlanToggleRow tier="STUDIO" label="customers can search" checked={searchStudio} onChange={setSearchStudio} />
            </div>
          </div>

          {/* Monthly search limits */}
          <div>
            <p className="mb-3 text-xs font-semibold text-zinc-600">Max Face Searches per Month (0 = unlimited)</p>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { tier: "FREE"   as PlanTier, value: maxSearchesFree,    setValue: setMaxSearchesFree,   badgeCls: TIER_BADGE.FREE },
                  { tier: "PRO"    as PlanTier, value: maxSearchesPro,     setValue: setMaxSearchesPro,    badgeCls: TIER_BADGE.PRO },
                  { tier: "STUDIO" as PlanTier, value: maxSearchesStudio,  setValue: setMaxSearchesStudio, badgeCls: TIER_BADGE.STUDIO },
                ] as const
              ).map(({ tier, value, setValue, badgeCls }) => (
                <div key={tier} className="rounded-xl border border-zinc-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`}>{tier}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-24 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-xs text-zinc-400">/mo</span>
                  </div>
                  {value === "0" && (
                    <p className="mt-1 text-[10px] text-emerald-600">Unlimited</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4 flex items-center justify-between">
            <StatusMsg error={planErr} success={planOk} />
            <SaveButton saving={savingPlan} onClick={handleSavePlanControls} />
          </div>
        </div>

      </div>
    </Section>
  );
}
