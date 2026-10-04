import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { AdminHeader, AdminShell } from "@/components/admin/admin-shell";
import { LogFilter } from "@/components/admin/log-filter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAiRuns, getEvents, LOG_LIMIT } from "@/lib/admin/queries";
import { requireStaff } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

const ROLES = ["asker", "daee", "admin", "system"] as const;

export default async function AdminLog({ params, searchParams }: PageProps<"/[locale]/admin/log">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const staff = await requireStaff(locale, "admin");
  const query = await searchParams;
  const tab = query.tab === "ai" ? "ai" : "events";
  const type = typeof query.type === "string" && query.type ? query.type : null;

  const [t, tNav, format] = await Promise.all([getTranslations("Admin.log"), getTranslations("Admin.nav"), getFormatter()]);
  const time = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

  const events = tab === "events" ? await getEvents(type) : null;
  const runs = tab === "ai" ? await getAiRuns(type) : null;
  const rowCount = events?.rows.length ?? runs?.rows.length ?? 0;

  return (
    <AdminShell section="log" name={staff.display_name}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
        <AdminHeader title={tNav("log")} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav role="tablist" className="flex rounded-lg border bg-muted p-0.5">
            {(["events", "ai"] as const).map((key) => (
              <Link
                key={key}
                role="tab"
                aria-selected={tab === key}
                href={{ pathname: "/admin/log", query: { tab: key } }}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150",
                  tab === key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key === "events" ? t("events") : t("aiRuns")}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            {rowCount >= LOG_LIMIT && <span className="text-xs text-muted-foreground">{t("latest", { count: LOG_LIMIT })}</span>}
            <LogFilter tab={tab} value={type} options={events?.types ?? runs?.tasks ?? []} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              {tab === "events" ? (
                <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                  <th>{t("type")}</th>
                  <th>{t("time")}</th>
                  <th>{t("conversation")}</th>
                  <th>{t("actor")}</th>
                </tr>
              ) : (
                <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                  <th>{t("task")}</th>
                  <th>{t("time")}</th>
                  <th>{t("model")}</th>
                  <th>{t("latency")}</th>
                  <th>{t("fallback")}</th>
                  <th>{t("reason")}</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y">
              {rowCount === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {events?.rows.map((e) => (
                <tr key={e.id} className="[&>td]:px-4 [&>td]:py-2.5">
                  <td>
                    <code className="text-xs">{e.type}</code>
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">{time(e.created_at)}</td>
                  <td className="text-muted-foreground" dir="ltr">
                    {e.conversation_id ? `${e.conversation_id.slice(0, 8)}…` : "–"}
                  </td>
                  <td>{e.actor_role && (ROLES as readonly string[]).includes(e.actor_role) ? t(`roles.${e.actor_role as (typeof ROLES)[number]}`) : (e.actor_role ?? "–")}</td>
                </tr>
              ))}
              {runs?.rows.map((r) => (
                <tr key={r.id} className="[&>td]:px-4 [&>td]:py-2.5">
                  <td>
                    <code className="text-xs">{r.task}</code>
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">{time(r.created_at)}</td>
                  <td className="text-muted-foreground" dir="ltr">
                    {r.model ?? "–"}
                  </td>
                  <td className="tabular-nums" dir="ltr">
                    {r.latency_ms != null ? format.number(r.latency_ms, { style: "unit", unit: "millisecond", unitDisplay: "narrow" }) : "–"}
                  </td>
                  <td>
                    <span className={cn("rounded-full px-2 text-[11px] leading-5", r.fallback ? "bg-warning-bg text-warning-fg" : "bg-muted text-muted-foreground")}>
                      {r.fallback ? t("yes") : t("no")}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{r.reason ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
