"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { languageName } from "@/components/chat/format";
import { getAvailability } from "@/lib/landing/actions";

const REFRESH_MS = 30_000;

/** "2 dāʿīs available now in Arabic" for the page's language, or an invitation to leave a question at zero. Counts only, never names. */
export function Availability() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      getAvailability(locale)
        .then((n) => active && setCount(n))
        .catch(() => active && setCount(null));
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [locale]);

  return (
    <p aria-live="polite" className="flex min-h-6 items-center gap-2.5 text-sm text-muted-foreground">
      {count === 0 ? (
        <span className="animate-fade-up">{t("availableNone")}</span>
      ) : count ? (
        <>
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-teal opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand-teal" />
          </span>
          <span className="animate-fade-up">{t("availableNow", { count, language: languageName(locale, locale) })}</span>
        </>
      ) : null}
    </p>
  );
}
