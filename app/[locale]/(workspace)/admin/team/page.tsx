import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminHeader, AdminShell } from "@/components/admin/admin-shell";
import { TeamTable } from "@/components/admin/team-table";
import type { Locale } from "@/i18n/routing";
import { getTeam } from "@/lib/admin/queries";
import { requireStaff } from "@/lib/auth/dal";

export default async function AdminTeam({ params }: PageProps<"/[locale]/admin/team">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const staff = await requireStaff(locale, "admin");
  const [team, t] = await Promise.all([getTeam(), getTranslations("Admin.nav")]);

  return (
    <AdminShell section="team" name={staff.display_name}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
        <AdminHeader title={t("team")} />
        <TeamTable team={team} />
      </div>
    </AdminShell>
  );
}
