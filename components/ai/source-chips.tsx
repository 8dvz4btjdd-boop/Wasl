"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type SourceChipsProps = {
  ids: string[];
  /** Message id → its number in the selection (1-based), in conversation order. */
  numberOf: Map<string, number>;
  active?: string | null;
  onHighlight?: (id: string | null) => void;
  className?: string;
};

/** Numbered chips linking a field to the messages it came from. Hover, focus or tap highlights. */
export function SourceChips({ ids, numberOf, active, onHighlight, className }: SourceChipsProps) {
  const t = useTranslations("AI");
  const format = new Intl.NumberFormat(useLocale());
  const known = ids.filter((id) => numberOf.has(id)).sort((a, b) => numberOf.get(a)! - numberOf.get(b)!);
  if (!known.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {known.map((id) => {
        const n = numberOf.get(id)!;
        return (
          <button
            key={id}
            type="button"
            aria-label={t("sourceLabel", { n })}
            aria-pressed={active === id}
            onMouseEnter={() => onHighlight?.(id)}
            onMouseLeave={() => onHighlight?.(null)}
            onFocus={() => onHighlight?.(id)}
            onBlur={() => onHighlight?.(null)}
            onClick={() => onHighlight?.(active === id ? null : id)}
            className={cn(
              "grid h-5 min-w-5 place-items-center rounded-full border px-1 text-[11px] font-semibold tabular-nums transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active === id ? "border-brand-teal bg-brand-teal text-brand-navy" : "border-brand-teal/50 text-teal-fg hover:bg-brand-teal/15",
            )}
          >
            {format.format(n)}
          </button>
        );
      })}
    </span>
  );
}
