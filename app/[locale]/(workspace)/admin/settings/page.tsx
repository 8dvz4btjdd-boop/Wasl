import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminHeader, AdminShell } from "@/components/admin/admin-shell";
import { SettingsForm } from "@/components/admin/settings-form";
import { SourcesList, type AutoReading } from "@/components/admin/sources-list";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSettings } from "@/lib/admin/queries";
import { requireStaff } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { cn } from "@/lib/utils";

export default async function AdminSettings({ params, searchParams }: PageProps<"/[locale]/admin/settings">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const staff = await requireStaff(locale, "admin");
  const tab = (await searchParams).tab === "sources" ? "sources" : "general";
  const [settings, t, tSources] = await Promise.all([getSettings(), getTranslations("Admin.nav"), getTranslations("Admin.sources")]);

  let autoItems: AutoReading[] = [];
  if (tab === "sources") {
    // Public source text the fence verified automatically; admins manage it.
    const { data } = await (await createClient())
      .from("library_items")
      .select("id, title, body, cited_text, source_url, topic, language, asker_ok, created_at")
      .eq("verified_by", "auto")
      .order("created_at", { ascending: false })
      .limit(100);
    autoItems = (data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      text: r.cited_text ?? r.body,
      url: r.source_url,
      topic: r.topic,
      language: r.language,
      asker_ok: r.asker_ok,
      created_at: r.created_at,
    }));
  }

  return (
    <AdminShell section="settings" name={staff.display_name}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
        <AdminHeader title={t("settings")} />
        <nav role="tablist" className="flex self-start rounded-lg border bg-muted p-0.5">
          {(["general", "sources"] as const).map((key) => (
            <Link
              key={key}
              role="tab"
              aria-selected={tab === key}
              href={{ pathname: "/admin/settings", query: key === "general" ? {} : { tab: key } }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150",
                tab === key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "general" ? tSources("general") : tSources("title")}
            </Link>
          ))}
        </nav>
        {tab === "general" && settings && <SettingsForm settings={settings} />}
        {tab === "sources" && (
          <section className="flex flex-col gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">{tSources("hint")}</p>
            <SourcesList items={autoItems} />
          </section>
        )}
      </div>
    </AdminShell>
  );
}
