import { cookies } from "next/headers";
import { en } from "./locales/en";
import { ja } from "./locales/ja";
import { gu } from "./locales/gu";
import type { Translations } from "./locales/en";

export type Locale = "en" | "ja" | "gu";

const SUPPORTED: Locale[] = ["en", "ja", "gu"];

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value as Locale | undefined;
  return raw && SUPPORTED.includes(raw) ? raw : "en";
}

export async function getServerT(): Promise<Translations> {
  const locale = await getServerLocale();
  if (locale === "ja") return ja;
  if (locale === "gu") return gu;
  return en;
}
