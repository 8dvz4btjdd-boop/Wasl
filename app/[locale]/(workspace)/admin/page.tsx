import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminHeader, AdminShell } from "@/components/admin/admin-shell";
import { ComparisonChart } from "@/components/admin/comparison-chart";
import { AiHealthRow, KpiTiles } from "@/components/admin/kpi-tiles";
import { LiveOps } from "@/components/admin/live-ops";
import { RangeControl } from "@/components/admin/range-control";
import type { Locale } from "@/i18n/routing";
import { getOverview } from "@/lib/admin/queries";
import { parseRange } from "@/lib/admin/range";
import { requireStaff } from "@/lib/auth/dal";

export default async function AdminOverview({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const staff = await requireStaff(locale, "admin");
  const range = parseRange((await searchParams).range);
  const [overview, t] = await Promise.all([getOverview(range), getTranslations("Admin.nav")]);

  return (
    <AdminShell section="overview" name={staff.display_name}>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-8 py-8">
        <AdminHeader title={t("overview")}>
          <RangeControl value={range} />
        </AdminHeader>
        <LiveOps initialOps={overview.ops} initialAlerts={overview.alerts} />
        <KpiTiles kpis={overview.kpis} />
        <ComparisonChart rows={overview.comparison} />
        <AiHealthRow ai={overview.ai} />
      </div>
    </AdminShell>
  );
}
