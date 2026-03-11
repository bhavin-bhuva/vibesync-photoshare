import { cookies } from "next/headers";
import { en } from "./locales/en";
import { ja } from "./locales/ja";
import type { Translations } from "./locales/en";

export type Locale = "en" | "ja";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value;
  return raw === "ja" ? "ja" : "en";
}

export async function getServerT(): Promise<Translations> {
  const locale = await getServerLocale();
  return locale === "ja" ? ja : en;
}
