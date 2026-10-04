import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getDir, type Locale } from "@/i18n/routing";

// Temporary setup check. Replaced when the asker entry surface is built.
export default function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params) as { locale: Locale };
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-semibold">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
      <p className="text-sm text-muted-foreground">
        {t("localeInfo", { locale, dir: getDir(locale) })}
      </p>
      <LocaleSwitcher />
    </main>
  );
}
