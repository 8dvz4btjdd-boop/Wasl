import { setRequestLocale } from "next-intl/server";
import { AskerShell } from "@/components/asker/asker-shell";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAsker } from "@/lib/auth/dal";
import { ReturnForm } from "./return-form";

export default async function ReturnPage({ params }: PageProps<"/[locale]/return">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  if (await getAsker()) return redirect({ href: "/wait", locale });

  return (
    <AskerShell>
      <ReturnForm />
    </AskerShell>
  );
}
