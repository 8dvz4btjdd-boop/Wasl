import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Surface } from "@/components/surface";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getOrgName } from "@/lib/db/queries/org";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("title"), description: t("intro") };
}

const SECTIONS = ["ask", "code", "cards", "conversations", "ai"] as const;

/** What Wasl keeps, who sees it and for how long, in plain words. */
export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, orgName] = await Promise.all([getTranslations("Privacy"), getOrgName()]);

  return (
    <Surface kind="asker" className="flex min-h-dvh flex-col">
      <SiteHeader orgName={orgName} />
      <main id="content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-12 px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
        <header className="flex animate-fade-up flex-col gap-4">
          <h1 className="text-4xl font-semibold sm:text-5xl">{t("title")}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{t("intro")}</p>
        </header>
        {SECTIONS.map((key) => (
          <section key={key} aria-labelledby={`privacy-${key}`} className="flex flex-col gap-3 border-t border-border/60 pt-8">
            <h2 id={`privacy-${key}`} className="text-xl font-semibold">
              {t(`${key}Title`)}
            </h2>
            <p className="leading-relaxed text-foreground/85">{t(`${key}Body`)}</p>
            {key === "cards" && (
              <ul className="flex flex-col gap-2 ps-5 leading-relaxed text-foreground/85 [list-style:disc]">
                <li>{t("cardsSelect")}</li>
                <li>{t("cardsWho")}</li>
                <li>{t("cardsHowLong")}</li>
                <li>{t("cardsDelete")}</li>
                <li>{t("cardsInactive")}</li>
              </ul>
            )}
            {key === "ai" && (
              <Link href={{ pathname: "/", hash: "ai" }} className="self-start text-teal-fg underline underline-offset-4">
                {t("aiMore")}
              </Link>
            )}
          </section>
        ))}
      </main>
      <SiteFooter orgName={orgName} />
    </Surface>
  );
}
