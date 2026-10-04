import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
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
    <Surface kind="workspace" className="flex min-h-dvh flex-1 flex-col">
      <main className="flex w-full max-w-sm flex-col gap-10 px-6 pt-[14vh] sm:ps-[max(1.5rem,10vw)]">
        <Logo size={32} wordmark />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <LoginForm />
      </main>
    </Surface>
  );
}
