import type { Metadata } from "next";
import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import type { Locale } from "@/i18n/routing";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Source of the share image (public/og/<locale>.png), rendered with the product's own fonts
// so Arabic-script text is shaped correctly. Regenerate with `npm run og`.
export default function ShareImage({ params }: PageProps<"/[locale]/dev/og">) {
  const { locale } = use(params) as { locale: Locale };
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <Surface kind="asker" className="min-h-dvh">
      <div
        id="og"
        className="flex h-[630px] w-[1200px] flex-col justify-between bg-[linear-gradient(135deg,#0e153f_0%,#0b1136_60%,#12195a_100%)] px-20 py-[72px]"
      >
        <Logo size={80} wordmark />
        <p className="max-w-[1000px] text-[64px] leading-[1.3] font-semibold text-balance">{t("tagline")}</p>
        <span className="h-2 w-40 rounded-full bg-[linear-gradient(90deg,#3ee8c6,#5a7fe6)]" />
      </div>
    </Surface>
  );
}
