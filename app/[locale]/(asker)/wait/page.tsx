import { getTranslations, setRequestLocale } from "next-intl/server";
import { AskerShell } from "@/components/asker/asker-shell";
import { SignOutButton } from "@/components/sign-out-button";
import type { Locale } from "@/i18n/routing";
import { requireAsker } from "@/lib/auth/dal";

// Placeholder: proves the asker guard until the waiting room is built.
export default async function WaitPage({ params }: PageProps<"/[locale]/wait">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const asker = await requireAsker(locale);
  const t = await getTranslations("Wait");

  return (
    <AskerShell>
      <div className="flex flex-1 flex-col gap-3 pt-[12vh]">
        <h1 className="text-4xl font-semibold sm:text-5xl">{t("title")}</h1>
        <p className="text-lg">{t("signedInAs", { pseudonym: asker.pseudonym })}</p>
        <p className="text-muted-foreground">{t("placeholder")}</p>
        <div className="mt-6">
          <SignOutButton label={t("signOut")} to="/" />
        </div>
      </div>
    </AskerShell>
  );
}
