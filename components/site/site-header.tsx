"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  orgName: string | null;
  /** full: landing (anchors, staff link, start button once the hero's scrolls away). compact: logo, name, language. */
  variant?: "full" | "compact";
  /** id of the hero's start button; the header's appears once it leaves the viewport. */
  ctaTargetId?: string;
};

export function SiteHeader({ orgName, variant = "full", ctaTargetId }: SiteHeaderProps) {
  const t = useTranslations("Site");
  const tHome = useTranslations("Home");
  const [scrolled, setScrolled] = useState(false);
  const [showCta, setShowCta] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const target = ctaTargetId ? document.getElementById(ctaTargetId) : null;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setShowCta(!entry.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [ctaTargetId]);

  const full = variant === "full";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-200",
        scrolled ? "border-white/[0.07] bg-background/75 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <a
        href="#content"
        className="sr-only rounded-lg bg-card px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50"
      >
        {t("skip")}
      </a>
      <div className={cn("mx-auto flex h-16 w-full items-center gap-3 px-4 sm:px-6", full ? "max-w-6xl" : "max-w-xl")}>
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo size={26} />
          {orgName && <span className="truncate text-sm font-medium text-foreground/90">{orgName}</span>}
        </Link>

        {full && (
          <nav aria-label={t("how")} className="ms-6 hidden items-center gap-1 md:flex">
            <a href="#how" className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {t("how")}
            </a>
            <a href="#privacy" className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {t("privacy")}
            </a>
          </nav>
        )}

        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          {full && (
            <Link
              href="/login"
              className="hidden rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:inline-flex"
            >
              {t("staff")}
            </Link>
          )}
          <LocaleSwitcher />
          <AnimatePresence initial={false}>
            {full && showCta && (
              <motion.span
                key="cta"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT }}
              >
                <Link href="/enter" className={cn(buttonVariants({ size: "sm" }), "h-9 rounded-xl px-3.5")}>
                  {tHome("start")}
                </Link>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
