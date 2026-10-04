"use client";

import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="flex flex-wrap justify-center gap-2">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          aria-current={locale === current ? "true" : undefined}
          className={buttonVariants({
            variant: locale === current ? "default" : "outline",
          })}
        >
          {t(`locales.${locale}`)}
        </Link>
      ))}
    </nav>
  );
}
