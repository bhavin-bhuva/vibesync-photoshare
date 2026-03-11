"use client";

import { SessionProvider } from "next-auth/react";
import { LocaleProvider } from "@/lib/i18n";

export function Providers({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </SessionProvider>
  );
}
