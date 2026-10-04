"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

/** Native select (keyboard and screen-reader friendly); the choice lives in the URL. */
export function LogFilter({ tab, value, options }: { tab: "events" | "ai"; value: string | null; options: string[] }) {
  const t = useTranslations("Admin.log");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {t("filter")}
      <select
        value={value ?? ""}
        onChange={(e) => {
          const type = e.target.value;
          router.replace({ pathname, query: type ? { tab, type } : { tab } } as never);
        }}
        className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">{t("all")}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
