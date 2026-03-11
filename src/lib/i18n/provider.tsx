"use client";

import { createContext, useContext } from "react";
import type { Translations } from "./locales/en";
import { en } from "./locales/en";
import { ja } from "./locales/ja";

export type Locale = "en" | "ja";

const localeMap: Record<Locale, Translations> = { en, ja };

const LocaleContext = createContext<Translations>(en);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const t = localeMap[(locale as Locale)] ?? en;
  return <LocaleContext.Provider value={t}>{children}</LocaleContext.Provider>;
}

export function useT(): Translations {
  return useContext(LocaleContext);
}
