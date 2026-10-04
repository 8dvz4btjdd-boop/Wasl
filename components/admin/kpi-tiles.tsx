"use client";

import { Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { AiHealth, Kpis, Rate } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

export function formatPercent(rate: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(rate);
}

export function KpiTiles({ kpis }: { kpis: Kpis | null }) {
  const t = useTranslations("Admin.kpi");
  const tiles: { key: keyof Kpis; label: string; definition: string }[] = [
    { key: "correct_first_routing", label: t("routing"), definition: t("routingDef") },
    { key: "correct_resumption", label: t("resumption"), definition: t("resumptionDef") },
    { key: "card_accuracy", label: t("accuracy"), definition: t("accuracyDef") },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {tiles.map((tile) => (
        <Tile key={tile.key} label={tile.label} definition={tile.definition} rate={kpis?.[tile.key] ?? null} />
      ))}
    </div>
  );
}

function Tile({ label, definition, rate }: { label: string; definition: string; rate: Rate | null }) {
  const t = useTranslations("Admin.kpi");
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const n = rate?.n ?? 0;
  const hasValue = rate?.rate != null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        <span className="group relative">
          <button
            type="button"
            aria-label={t("info")}
            aria-expanded={open}
            aria-describedby={`${id}-def`}
            onClick={() => setOpen((v) => !v)}
            onBlur={() => setOpen(false)}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Info className="size-4" aria-hidden />
          </button>
          <span
            id={`${id}-def`}
            role="tooltip"
            className={cn(
              "absolute end-0 top-7 z-10 w-60 rounded-lg border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md",
              open ? "block" : "hidden group-hover:block",
            )}
          >
            {definition}
          </span>
        </span>
      </div>
      {hasValue ? (
        <p className="text-4xl font-semibold tabular-nums">{formatPercent(rate!.rate!, locale)}</p>
      ) : (
        <p className="text-lg font-medium text-muted-foreground">{t("notEnough")}</p>
      )}
      <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
        {t("n", { n })}
      </p>
    </div>
  );
}

export function AiHealthRow({ ai }: { ai: AiHealth | null }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const runs = ai?.runs ?? 0;
  const items = [
    { label: t("ai.runs"), value: new Intl.NumberFormat(locale).format(runs), n: null },
    {
      label: t("ai.fallbackRate"),
      value: ai?.fallback_rate != null ? formatPercent(ai.fallback_rate, locale) : t("kpi.notEnough"),
      muted: ai?.fallback_rate == null,
      n: runs,
    },
    {
      label: t("ai.latency"),
      value:
        ai?.median_latency_ms != null
          ? new Intl.NumberFormat(locale, { style: "unit", unit: "millisecond", unitDisplay: "narrow" }).format(ai.median_latency_ms)
          : "–",
      muted: ai?.median_latency_ms == null,
      n: ai?.n_latency ?? 0,
    },
  ];
  return (
    <section aria-labelledby="ai-title" className="flex flex-col gap-3">
      <h2 id="ai-title" className="text-sm font-medium">
        {t("ai.title")}
      </h2>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 bg-card px-5 py-4">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={cn("text-xl font-semibold tabular-nums", item.muted && "text-base font-medium text-muted-foreground")}>
              {item.value}
            </dd>
            {item.n !== null && (
              <dd className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                {t("kpi.n", { n: item.n })}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
