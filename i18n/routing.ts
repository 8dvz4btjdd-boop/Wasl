import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en", "fr", "es"],
  defaultLocale: "ar",
});

export type Locale = (typeof routing.locales)[number];

const rtlLocales: readonly Locale[] = ["ar"];

export function getDir(locale: Locale): "rtl" | "ltr" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}
