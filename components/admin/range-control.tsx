import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RANGES, type Range } from "@/lib/admin/range";
import { cn } from "@/lib/utils";

const LABEL: Record<Range, "today" | "week" | "all"> = { today: "today", "7d": "week", all: "all" };

/** One range for the whole page; it lives in the URL so views can be shared and reloaded. */
export function RangeControl({ value }: { value: Range }) {
  const t = useTranslations("Admin.range");
  return (
    <nav aria-label={t("label")} className="flex rounded-lg border bg-muted p-0.5">
      {RANGES.map((range) => (
        <Link
          key={range}
          href={{ pathname: "/admin", query: { range } }}
          aria-current={range === value ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            range === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(LABEL[range])}
        </Link>
      ))}
    </nav>
  );
}
