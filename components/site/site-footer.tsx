import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Organization, privacy in brief, AI transparency, staff sign-in and language. */
export async function SiteFooter({ orgName, wide = true }: { orgName: string | null; wide?: boolean }) {
  const t = await getTranslations("Site");
  const linkClass =
    "rounded text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <footer className="border-t border-white/[0.07]">
      <div className={cn("mx-auto grid w-full gap-10 px-4 py-12 sm:px-6", wide ? "max-w-6xl md:grid-cols-[1fr_1.6fr_auto] md:gap-14" : "max-w-xl")}>
        <div className="flex flex-col gap-3">
          {orgName && <p className="font-semibold">{orgName}</p>}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Logo size={14} />
            {t("poweredBy")}
          </p>
        </div>

        <section id="privacy" aria-labelledby="privacy-title" className="flex scroll-mt-20 flex-col gap-2">
          <h2 id="privacy-title" className="text-sm font-semibold">
            {t("privacyTitle")}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{t("privacyText")}</p>
        </section>

        <div className="flex flex-col items-start gap-3">
          <Link href={{ pathname: "/", hash: "ai" }} className={linkClass}>
            {t("aiLink")}
          </Link>
          <Link href="/login" className={linkClass}>
            {t("staff")}
          </Link>
          <LocaleSwitcher align="start" className="-ms-2.5" />
        </div>
      </div>
    </footer>
  );
}
