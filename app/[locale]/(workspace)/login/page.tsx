import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConnectingBubbles } from "@/components/brand/connecting-bubbles";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { BackControl } from "@/components/site/back-control";
import { Surface } from "@/components/surface";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getStaff, STAFF_HOME } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  const staff = await getStaff();
  if (staff) return redirect({ href: STAFF_HOME[staff.role], locale });

  const t = await getTranslations("Login");

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <Surface kind="workspace" className="flex flex-col">
        <header className="flex items-center gap-2 px-6 pt-6 sm:px-10">
          <BackControl />
          <Logo size={28} wordmark />
          <span className="flex-1" />
          <LocaleSwitcher />
        </header>
        <main className="flex flex-1 items-center px-6 py-12 sm:px-10">
          <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">{t("hint")}</p>
            </div>
            <LoginForm />
          </div>
        </main>
      </Surface>

      <Surface kind="asker" className="relative hidden flex-col items-center justify-center gap-10 overflow-hidden p-12 lg:flex">
        <ConnectingBubbles size={200} />
        <p className="max-w-sm text-center text-2xl leading-snug font-medium text-balance">{t("brandLine")}</p>
      </Surface>
    </div>
  );
}
