import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en", "fr", "es", "ur", "id", "tl"],
  defaultLocale: "ar",
});

export type Locale = (typeof routing.locales)[number];

const rtlLocales: readonly Locale[] = ["ar", "ur"];

export function getDir(locale: Locale): "rtl" | "ltr" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}

/** Locales written in Arabic script: they use IBM Plex Sans Arabic. */
export function usesArabicScript(locale: Locale): boolean {
  return locale === "ar" || locale === "ur";
}
