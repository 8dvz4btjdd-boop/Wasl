import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import { Button } from "@/components/ui/button";
import { getDir, type Locale } from "@/i18n/routing";

// Temporary setup check. Replaced when the asker entry surface is built.
export default function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params) as { locale: Locale };
  setRequestLocale(locale);
  const t = useTranslations("Home");

  const previews = [
    { kind: "asker", theme: "dark" },
    { kind: "asker", theme: "light" },
    { kind: "workspace", theme: "light" },
    { kind: "workspace", theme: "dark" },
  ] as const;

  return (
    <Surface kind="asker" className="flex flex-1 flex-col items-center gap-10 px-6 py-16">
      <header className="flex animate-fade-up flex-col items-center gap-4 text-center">
        <h1>
          <Logo size={72} wordmark />
        </h1>
        <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        <p className="text-sm text-muted-foreground">
          {t("localeInfo", { locale, dir: getDir(locale) })}
        </p>
        <LocaleSwitcher />
      </header>

      <section className="w-full max-w-3xl">
        <h2 className="mb-4 text-center text-sm font-medium text-muted-foreground">
          {t("surfacesTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {previews.map(({ kind, theme }) => (
            <Surface
              key={`${kind}-${theme}`}
              kind={kind}
              theme={theme}
              className="flex flex-col items-start gap-3 rounded-xl border p-5"
            >
              <div className="flex w-full items-center justify-between gap-3">
                <Logo size={24} wordmark />
                <span className="text-xs text-muted-foreground">
                  {t(kind)} · {t(theme)}
                </span>
              </div>
              <p className="font-medium text-teal-fg">{t("tealSample")}</p>
              <p className="text-sm text-muted-foreground">{t("mutedSample")}</p>
              <Button>{t("primaryAction")}</Button>
            </Surface>
          ))}
        </div>
      </section>
    </Surface>
  );
}
