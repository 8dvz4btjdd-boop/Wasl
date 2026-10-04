import { LayoutDashboard, ScrollText, Settings, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/inbox/rail";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type AdminSection = "overview" | "team" | "log" | "settings";

const SECTIONS: { key: AdminSection; href: "/admin" | "/admin/team" | "/admin/log" | "/admin/settings"; icon: typeof Users }[] = [
  { key: "overview", href: "/admin", icon: LayoutDashboard },
  { key: "team", href: "/admin/team", icon: Users },
  { key: "log", href: "/admin/log", icon: ScrollText },
  { key: "settings", href: "/admin/settings", icon: Settings },
];

/** Same language as the daee workspace: slim rail, light surface, full viewport, content scrolls. */
export function AdminShell({ section, name, children }: { section: AdminSection; name: string; children: ReactNode }) {
  const t = useTranslations("Admin.nav");
  return (
    <Surface kind="workspace" className="grid h-dvh grid-cols-[76px_minmax(0,1fr)] overflow-hidden">
      <nav aria-label={t("overview")} className="flex flex-col items-center gap-1 border-e bg-sidebar py-3">
        <Logo size={22} />
        <ul className="mt-4 flex w-full flex-col gap-1 px-1.5">
          {SECTIONS.map(({ key, href, icon: Icon }) => {
            const active = key === section;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] leading-tight transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="text-center">{t(key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <AccountMenu name={name} className="mt-auto" />
      </nav>
      <main className="min-h-0 overflow-y-auto">{children}</main>
    </Surface>
  );
}

/** Page header: title on the start side, optional controls on the end side. */
export function AdminHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </header>
  );
}
