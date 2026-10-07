"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { useT } from "@/lib/i18n";

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      // NextAuth propagates the exact message thrown in authorize() when
      // redirect:false is used — suspension errors are not "CredentialsSignin"
      setError(
        result.error === "CredentialsSignin"
          ? t.auth.login.error
          : result.error
      );
      setPending(false);
    } else {
      const session = await getSession();
      const dest = session?.user?.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";
      router.push(dest);
    }
  }

  return (
    <div className="bg-surface-page px-6 pb-8 pt-10 sm:rounded-2xl sm:bg-surface-card sm:p-8 sm:shadow-2xl sm:shadow-black/20 sm:ring-1 sm:ring-border">
      {/* Logo — mobile only */}
      <div className="mb-8 flex flex-col items-center sm:hidden">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-content-primary">
          <svg className="h-6 w-6 text-content-inverse" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
            <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
          </svg>
        </div>
        <span className="mt-3 text-xl font-semibold text-content-primary">{t.app.name}</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
          {t.auth.login.title}
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          {t.auth.login.subtitle}
        </p>
      </div>

      {registered && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
          {t.auth.login.registeredBanner}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="w-full rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-content-secondary"
          >
            {t.auth.login.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            inputMode="email"
            enterKeyHint="next"
            className="mt-1.5 block h-12 w-full rounded-lg border border-border bg-surface-input px-3 text-base text-content-primary placeholder-content-muted focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/40 sm:h-auto sm:py-2 sm:text-sm"
            placeholder={t.auth.login.emailPlaceholder}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-content-secondary"
          >
            {t.auth.login.passwordLabel}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            enterKeyHint="done"
            className="mt-1.5 block h-12 w-full rounded-lg border border-border bg-surface-input px-3 text-base text-content-primary placeholder-content-muted focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/40 sm:h-auto sm:py-2 sm:text-sm"
            placeholder={t.auth.login.passwordPlaceholder}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:h-auto sm:py-2.5 sm:text-sm"
        >
          {pending && <SpinnerIcon />}
          {pending ? t.auth.login.submitting : t.auth.login.submit}
        </button>
      </form>

      <div className="mt-6 flex min-h-[44px] items-center justify-center gap-1 text-sm text-content-muted">
        <span>{t.auth.login.noAccount}</span>
        <Link
          href="/register"
          className="font-medium text-content-primary underline-offset-4 hover:underline"
        >
          {t.auth.login.createOne}
        </Link>
      </div>
    </div>
  );
}

export default function LoginClientPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
