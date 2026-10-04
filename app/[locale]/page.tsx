import { EyeOff, HandHeart, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getOrgName } from "@/lib/db/queries/org";
import { cn } from "@/lib/utils";

// Org name is read at render; Settings revalidates this path when it changes.
export const revalidate = 300;

// The asker's front door. An organization embeds this layer, so it carries their name.
export default async function Home({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, orgName] = await Promise.all([getTranslations("Home"), getOrgName()]);

  const trust = [
    { icon: HandHeart, title: t("trustPersonTitle"), body: t("trustPersonBody") },
    { icon: EyeOff, title: t("trustAnonTitle"), body: t("trustAnonBody") },
    { icon: ShieldCheck, title: t("trustControlTitle"), body: t("trustControlBody") },
  ];

  return (
    <Surface kind="asker" className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <p className="text-sm font-medium text-muted-foreground">{orgName}</p>
        <LocaleSwitcher />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-16 px-6 py-16">
        <section className="flex max-w-2xl animate-fade-up flex-col items-start gap-8">
          <Logo size={64} />
          <h1 className="text-4xl leading-[1.15] font-semibold text-balance sm:text-6xl">{t("tagline")}</h1>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/enter" className={cn(buttonVariants({ size: "lg" }), "h-14 rounded-2xl px-7 text-lg")}>
              {t("start")}
            </Link>
            <Link href="/return" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-14 rounded-2xl px-7 text-lg")}>
              {t("return")}
            </Link>
          </div>
        </section>

        <ul className="grid gap-8 border-t pt-10 sm:grid-cols-3 sm:gap-6">
          {trust.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 sm:flex-col sm:gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-brand-teal/40 text-teal-fg">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{title}</span>
                <span className="text-sm text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl justify-end px-6 pb-6">
        <Link href="/login" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("staff")}
        </Link>
      </footer>
    </Surface>
  );
}
