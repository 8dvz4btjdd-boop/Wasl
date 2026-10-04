"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type LocaleSwitcherProps = {
  /** pills: every language visible (landing); menu: compact dropdown (forms). */
  variant?: "pills" | "menu";
  className?: string;
};

/** Each language is named in itself, so people find theirs whatever the current locale. */
export function LocaleSwitcher({ variant = "pills", className }: LocaleSwitcherProps) {
  const t = useTranslations("LocaleSwitcher");
  const current = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  if (variant === "menu") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("label")}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            className,
          )}
        >
          <Globe className="size-4" aria-hidden />
          <span lang={current}>{t(`locales.${current}`)}</span>
          <ChevronDown className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {routing.locales.map((locale) => (
            <DropdownMenuItem key={locale} onClick={() => router.replace(pathname, { locale })}>
              <span lang={locale}>{t(`locales.${locale}`)}</span>
              {locale === current && <Check className="ms-auto" aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <nav aria-label={t("label")} className={cn("flex items-center gap-1 rounded-full border bg-card/60 p-1", className)}>
      <Globe className="mx-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`locales.${locale}`)}
          </Link>
        );
      })}
    </nav>
  );
}
