import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** One quiet row: who runs this, three links, the year. The language menu lives in the header. */
export async function SiteFooter({ orgName, className }: { orgName: string | null; className?: string }) {
  const t = await getTranslations("Site");
  const year = new Date().getFullYear();
  const link =
    "rounded text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <footer className={cn("border-t border-border/60", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 text-sm sm:px-6 md:flex-row md:items-center md:gap-8">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {orgName && <span className="font-medium">{orgName}</span>}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Logo size={14} />
            {t("poweredBy")}
          </span>
        </p>
        <nav aria-label={t("footerNav")} className="flex flex-wrap gap-x-5 gap-y-2 md:ms-auto">
          <Link href="/privacy" className={link}>
            {t("privacy")}
          </Link>
          <Link href={{ pathname: "/", hash: "ai" }} className={link}>
            {t("aiLink")}
          </Link>
          <Link href="/login" className={link}>
            {t("staff")}
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground tabular-nums">© {year}</p>
      </div>
    </footer>
  );
}
