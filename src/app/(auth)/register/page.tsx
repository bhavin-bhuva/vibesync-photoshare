"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "./actions";
import { useT } from "@/lib/i18n";

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

export default function RegisterPage() {
  const t = useT();
  const [state, formAction, pending] = useActionState(registerAction, null);

  return (
    <div className="bg-white px-6 pb-8 pt-10 dark:bg-zinc-900 sm:rounded-2xl sm:p-8 sm:shadow-sm sm:ring-1 sm:ring-zinc-200 sm:dark:bg-zinc-800 sm:dark:ring-zinc-700">
      {/* Logo — mobile only */}
      <div className="mb-8 flex flex-col items-center sm:hidden">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-50">
          <svg className="h-6 w-6 text-white dark:text-zinc-900" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
            <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
          </svg>
        </div>
        <span className="mt-3 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t.app.name}</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t.auth.register.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t.auth.register.subtitle}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state?.error && (
          <p className="w-full rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {state.error}
          </p>
        )}

        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t.auth.register.nameLabel}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            enterKeyHint="next"
            className="mt-1.5 block h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 sm:h-auto sm:py-2 sm:text-sm"
            placeholder={t.auth.register.namePlaceholder}
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t.auth.register.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            inputMode="email"
            enterKeyHint="next"
            className="mt-1.5 block h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 sm:h-auto sm:py-2 sm:text-sm"
            placeholder={t.auth.register.emailPlaceholder}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t.auth.register.passwordLabel}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            enterKeyHint="done"
            className="mt-1.5 block h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 sm:h-auto sm:py-2 sm:text-sm"
            placeholder={t.auth.register.passwordPlaceholder}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:h-auto sm:py-2.5 sm:text-sm"
        >
          {pending && <SpinnerIcon />}
          {pending ? t.auth.register.submitting : t.auth.register.submit}
        </button>
      </form>

      <div className="mt-6 flex min-h-[44px] items-center justify-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
        <span>{t.auth.register.hasAccount}</span>
        <Link
          href="/login"
          className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          {t.auth.register.signIn}
        </Link>
      </div>
    </div>
  );
}
