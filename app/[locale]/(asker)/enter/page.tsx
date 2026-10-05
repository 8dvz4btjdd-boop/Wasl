import { setRequestLocale } from "next-intl/server";
import { AskerShell } from "@/components/asker/asker-shell";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAsker, getStaff, STAFF_HOME } from "@/lib/auth/dal";
import { EnterFlow } from "./enter-flow";

export default async function EnterPage({ params }: PageProps<"/[locale]/enter">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  const staff = await getStaff();
  if (staff) return redirect({ href: STAFF_HOME[staff.role], locale });

  // No redirect for an existing asker: creating one sets cookies, which re-renders this
  // page, and the flow must stay mounted to show the return code from the action result.
  const asker = await getAsker();

  return (
    <AskerShell back>
      <EnterFlow existingPseudonym={asker?.pseudonym ?? null} />
    </AskerShell>
  );
}
