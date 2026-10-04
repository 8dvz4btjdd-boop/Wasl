import { EyeOff, HandHeart, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Availability } from "@/components/site/availability";
import { HeroAnimation } from "@/components/site/hero-animation";
import { HowItWorks } from "@/components/site/how-it-works";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Transparency } from "@/components/site/transparency";
import { Surface } from "@/components/surface";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getOrgName } from "@/lib/db/queries/org";
import { cn } from "@/lib/utils";

// Org name is read at render; Settings revalidates this path when it changes.
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, tMeta, orgName] = await Promise.all([
    getTranslations({ locale, namespace: "Home" }),
    getTranslations({ locale, namespace: "Meta" }),
    getOrgName(),
  ]);
  const title = orgName && orgName !== tMeta("title") ? `${orgName} · ${tMeta("title")}` : tMeta("title");
  return {
    title,
    description: t("tagline"),
    openGraph: { title, description: t("tagline"), locale, type: "website", images: [{ url: `/og/${locale}.png`, width: 1200, height: 630, alt: t("tagline") }] },
    twitter: { card: "summary_large_image", title, description: t("tagline"), images: [`/og/${locale}.png`] },
  };
}

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
      <SiteHeader orgName={orgName} ctaTargetId="hero-cta" />

      <main id="content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-24 px-4 pt-10 pb-24 sm:px-6 sm:pt-16 lg:gap-32">
        <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="flex flex-col items-start gap-8">
            <h1
              className="animate-fade-up text-4xl leading-[1.15] font-semibold text-balance sm:text-5xl lg:text-6xl"
              style={{ animationDelay: "40ms" }}
            >
              {t("tagline")}
            </h1>
            <div className="flex w-full animate-fade-up flex-col gap-3 sm:w-auto sm:flex-row" style={{ animationDelay: "140ms" }}>
              <Link id="hero-cta" href="/enter" className={cn(buttonVariants({ size: "lg" }), "h-14 rounded-2xl px-7 text-lg")}>
                {t("start")}
              </Link>
              <Link href="/return" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-14 rounded-2xl px-7 text-lg")}>
                {t("return")}
              </Link>
            </div>
            <div className="animate-fade-up" style={{ animationDelay: "220ms" }}>
              <Availability />
            </div>
          </div>
          {/* Beside the copy: the start side in LTR, the end side in RTL. */}
          <div className="animate-fade-up lg:ltr:order-first" style={{ animationDelay: "260ms" }}>
            <HeroAnimation />
          </div>
        </section>

        <ul className="grid gap-8 border-t border-white/[0.07] pt-10 sm:grid-cols-3 sm:gap-6">
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

        <HowItWorks />
        <Transparency />
      </main>

      <SiteFooter orgName={orgName} />
    </Surface>
  );
}
