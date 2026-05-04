"use client";

import { useActionState, useState } from "react";
import { updatePersonalInfoAction } from "./actions";
import { changePasswordAction } from "@/app/dashboard/actions";
import { useT } from "@/lib/i18n";

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-600";

// ─── Change password section ──────────────────────────────────────────────────

function ChangePasswordSection() {
  const t = useT();
  const m = t.userMenu.changePasswordModal;
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError(m.errorMismatch); return; }
    if (next.length < 8)  { setError(m.errorTooShort); return; }
    setPending(true);
    const result = await changePasswordAction(current, next);
    setPending(false);
    if (result.error) {
      setError(
        result.error === "INVALID_CURRENT_PASSWORD" ? m.errorCurrent :
        result.error === "PASSWORD_TOO_SHORT"        ? m.errorTooShort :
        result.error
      );
    } else {
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
        </svg>
        {m.success}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}
      <Field label={m.currentLabel}>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
          placeholder={m.currentPlaceholder} required className={inputCls} />
      </Field>
      <Field label={m.newLabel}>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
          placeholder={m.newPlaceholder} required className={inputCls} />
      </Field>
      <Field label={m.confirmLabel}>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder={m.confirmPlaceholder} required className={inputCls} />
      </Field>
      <div className="flex justify-end">
        <button type="submit" disabled={pending}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:py-2">
          {pending ? m.submitting : m.submit}
        </button>
      </div>
    </form>
  );
}

// ─── Avatar placeholder ───────────────────────────────────────────────────────

function AvatarSection({ name }: { name: string }) {
  const initials = name.trim()
    ? name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="flex flex-col items-center gap-3 pb-4 sm:items-start">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-200 text-2xl font-bold text-zinc-600 ring-4 ring-zinc-100 dark:bg-zinc-600 dark:text-zinc-200 dark:ring-zinc-700">
        {initials}
      </div>
      <button
        type="button"
        disabled
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-400 dark:border-zinc-600 dark:text-zinc-500"
        title="Photo upload coming soon"
      >
        Change Photo
      </button>
    </div>
  );
}

// ─── Personal info form ───────────────────────────────────────────────────────

export function PersonalInfoForm({ name, email }: { name: string; email: string }) {
  const t = useT();
  const p = t.profile.personalInfo;
  const [state, formAction, pending] = useActionState(updatePersonalInfoAction, null);

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <AvatarSection name={name} />

      {/* Name + Email */}
      <form id="personal-info-form" action={formAction} className="space-y-4">
        <Field label={p.nameLabel}>
          <input type="text" name="name" defaultValue={name}
            placeholder={p.namePlaceholder} required className={inputCls} />
        </Field>

        <Field label={p.emailLabel}>
          <input type="email" value={email} readOnly
            className={`${inputCls} cursor-not-allowed opacity-60`} />
          <p className="mt-1 text-xs text-zinc-400">{p.emailNote}</p>
        </Field>

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {state.error}
          </p>
        )}

        {/* Save bar — sticky on mobile */}
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t border-zinc-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/95 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:dark:bg-transparent"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {state && "success" in state && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.profile.saved}</span>
            )}
            <button type="submit" disabled={pending}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:flex-none sm:py-2">
              {pending ? t.profile.saving : p.saveButton}
            </button>
          </div>
        </div>
      </form>

      {/* Divider */}
      <div className="border-t border-zinc-100 dark:border-zinc-700" />

      {/* Change password */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {p.passwordTitle}
        </h3>
        <ChangePasswordSection />
      </div>
    </div>
  );
}
