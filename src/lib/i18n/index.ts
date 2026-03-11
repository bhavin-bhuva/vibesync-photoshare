/**
 * i18n entry point.
 *
 * To add a new language later:
 *   1. Create src/lib/i18n/locales/<code>.ts  (copy en.ts as template)
 *   2. Add it to the localeMap in provider.tsx
 *   3. Add a locale switcher entry in UserMenu.tsx
 *
 * Usage:
 *   - Server components:  `import { getServerT } from "@/lib/i18n/server"`
 *   - Client components:  `import { useT } from "@/lib/i18n"`
 *   - Locale action:      `import { setLocaleAction } from "@/lib/i18n/actions"`
 *
 * `Translations` is the canonical type — all locale files must satisfy it.
 */

import { en } from "./locales/en";

export type { Translations } from "./locales/en";
export type { Locale } from "./provider";
export { useT, LocaleProvider } from "./provider";

// Static default — used as context fallback and in non-dynamic contexts.
export const t = en;
