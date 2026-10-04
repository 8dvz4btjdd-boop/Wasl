"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { getDir, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Compact language menu. Each language is named in itself, so people find theirs whatever
 * the current locale; the current one is checked. Arrow keys, Enter and Escape work
 * (base-ui menu).
 */
export function LocaleSwitcher({ className, align = "end" }: { className?: string; align?: "start" | "end" }) {
  const t = useTranslations("LocaleSwitcher");
  const current = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  // The menu renders in a portal, outside the page's surface: carry the surface's tokens over.
  const [surface, setSurface] = useState<{ kind?: string; theme?: string }>({});
  const readSurface = (open: boolean) => {
    const el = open ? trigger.current?.closest<HTMLElement>("[data-surface]") : null;
    if (el) setSurface({ kind: el.dataset.surface, theme: el.dataset.theme });
  };

  function change(locale: string) {
    if (locale === current) return;
    // Read at click time: useSearchParams would opt static pages out of prerendering.
    const query = window.location.search.slice(1);
    router.replace(query ? `${pathname}?${query}` : pathname, { locale: locale as Locale, scroll: false });
  }

  return (
    <DropdownMenu onOpenChange={readSurface}>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={`${t("label")}: ${t(`locales.${current}`)}`}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted data-popup-open:text-foreground",
          className,
        )}
      >
        <Globe className="size-4 shrink-0" aria-hidden />
        <span lang={current} dir={getDir(current)}>
          {t(`locales.${current}`)}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} data-surface={surface.kind} data-theme={surface.theme} className="w-48 p-1">
        <DropdownMenuRadioGroup value={current} onValueChange={change}>
          {routing.locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} className="py-2 ps-2.5 text-sm">
              <span lang={locale} dir={getDir(locale)}>
                {t(`locales.${locale}`)}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
