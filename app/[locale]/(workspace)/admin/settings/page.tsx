import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminHeader, AdminShell } from "@/components/admin/admin-shell";
import { SettingsForm } from "@/components/admin/settings-form";
import type { Locale } from "@/i18n/routing";
import { getSettings } from "@/lib/admin/queries";
import { requireStaff } from "@/lib/auth/dal";

export default async function AdminSettings({ params }: PageProps<"/[locale]/admin/settings">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const staff = await requireStaff(locale, "admin");
  const [settings, t] = await Promise.all([getSettings(), getTranslations("Admin.nav")]);

  return (
    <AdminShell section="settings" name={staff.display_name}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
        <AdminHeader title={t("settings")} />
        {settings && <SettingsForm settings={settings} />}
      </div>
    </AdminShell>
  );
}
