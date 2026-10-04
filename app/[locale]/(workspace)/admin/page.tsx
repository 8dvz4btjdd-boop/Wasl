import { setRequestLocale } from "next-intl/server";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";
import type { Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/auth/dal";

export default async function AdminPage({ params }: PageProps<"/[locale]/admin">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const staff = await requireStaff(locale, "admin");
  return <WorkspacePlaceholder name={staff.display_name} role={staff.role} />;
}
