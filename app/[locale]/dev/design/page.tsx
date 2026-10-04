import type { Metadata } from "next";
import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import { Button } from "@/components/ui/button";
import { getDir, type Locale } from "@/i18n/routing";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Internal reference: surfaces, tokens and direction. Not linked from the product.
export default function DesignPreview({ params }: PageProps<"/[locale]/dev/design">) {
  const { locale } = use(params) as { locale: Locale };
  setRequestLocale(locale);
  const t = useTranslations("DevDesign");

  const previews = [
    { kind: "asker", theme: "dark" },
    { kind: "asker", theme: "light" },
    { kind: "workspace", theme: "light" },
    { kind: "workspace", theme: "dark" },
  ] as const;

  return (
    <Surface kind="workspace" className="flex min-h-dvh flex-col items-center gap-10 px-6 py-16">
      <header className="flex flex-col items-center gap-4 text-center">
        <Logo size={56} wordmark />
        <p className="text-muted-foreground">{t("subtitle")}</p>
        <p className="text-sm text-muted-foreground">{t("localeInfo", { locale, dir: getDir(locale) })}</p>
        <LocaleSwitcher />
      </header>
      <section className="w-full max-w-3xl">
        <h1 className="mb-4 text-center text-sm font-medium text-muted-foreground">{t("title")}</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {previews.map(({ kind, theme }) => (
            <Surface key={`${kind}-${theme}`} kind={kind} theme={theme} className="flex flex-col items-start gap-3 rounded-xl border p-5">
              <div className="flex w-full items-center justify-between gap-3">
                <Logo size={24} wordmark />
                <span className="text-xs text-muted-foreground">
                  {t(kind)}, {t(theme)}
                </span>
              </div>
              <p className="font-medium text-teal-fg">{t("tealSample")}</p>
              <p className="text-sm text-warning-fg">{t("tealSample")}</p>
              <p className="text-sm text-muted-foreground">{t("mutedSample")}</p>
              <Button>{t("primaryAction")}</Button>
            </Surface>
          ))}
        </div>
      </section>
    </Surface>
  );
}
