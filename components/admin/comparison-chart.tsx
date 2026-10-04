"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDuration } from "@/components/chat/format";
import { getDir, type Locale } from "@/i18n/routing";
import type { ComparisonRow } from "@/lib/admin/types";
import { formatPercent } from "./kpi-tiles";

// Validated with the dataviz palette checks (light surface): magenta / violet / teal pass
// lightness, chroma, CVD and contrast, and stay clear of the amber and red status colours.
const MODE_COLOR: Record<ComparisonRow["mode"], string> = {
  none: "#B4378A",
  manual: "#6150EA",
  ai: "#0E9F86",
};

type Datum = { mode: ComparisonRow["mode"]; label: string; value: number | null; n: number; display: string; missing: string };

function formatSeconds(seconds: number, locale: string) {
  if (seconds < 60) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "narrow" }).format(seconds);
  }
  return formatDuration(seconds * 1000, locale, "narrow");
}

/**
 * Follow-up sessions by mode. Two measures with different units, so two small multiples
 * (never a dual axis). The mode name and n sit under every bar; identity is never colour alone.
 */
export function ComparisonChart({ rows }: { rows: ComparisonRow[] }) {
  const t = useTranslations("Admin.comparison");
  const tKpi = useTranslations("Admin.kpi");
  const locale = useLocale() as Locale;
  const rtl = getDir(locale) === "rtl";
  const hasData = rows.some((r) => r.sessions > 0 || r.n_rated > 0);

  const reply: Datum[] = rows.map((r) => ({
    mode: r.mode,
    label: t(r.mode),
    value: r.median_first_reply_seconds,
    n: r.n_reply,
    display: r.median_first_reply_seconds != null ? formatSeconds(r.median_first_reply_seconds, locale) : "",
    missing: t("noValue"),
  }));
  const sufficiency: Datum[] = rows.map((r) => ({
    mode: r.mode,
    label: t(r.mode),
    value: r.sufficiency_rate,
    n: r.n_rated,
    display: r.sufficiency_rate != null ? formatPercent(r.sufficiency_rate, locale) : "",
    // n ≥ 1 but < 5 is "not enough"; n = 0 is "no data".
    missing: r.n_rated > 0 ? tKpi("notEnough") : t("noValue"),
  }));

  return (
    <section aria-labelledby="comparison-title" className="flex flex-col gap-3">
      <h2 id="comparison-title" className="text-sm font-medium">
        {t("title")}
      </h2>
      {!hasData ? (
        <div className="grid place-items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title={t("reply")} data={reply} rtl={rtl} nLabel={(n) => tKpi("n", { n })} />
          <Panel title={t("sufficiency")} data={sufficiency} rtl={rtl} nLabel={(n) => tKpi("n", { n })} max={1} />
        </div>
      )}
    </section>
  );
}

function Panel({
  title,
  data,
  rtl,
  nLabel,
  max,
}: {
  title: string;
  data: Datum[];
  rtl: boolean;
  nLabel: (n: number) => string;
  max?: number;
}) {
  return (
    <figure className="flex flex-col gap-2 rounded-xl border bg-card p-5">
      <figcaption className="text-xs font-medium text-muted-foreground">{title}</figcaption>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 8, left: 8 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              reversed={rtl}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval={0}
              height={54}
              tick={(props) => <ModeTick {...props} data={data} nLabel={nLabel} />}
            />
            <YAxis hide domain={[0, max ?? "auto"]} />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip nLabel={nLabel} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.mode} fill={MODE_COLOR[d.mode]} />
              ))}
              <LabelList dataKey="display" position="top" fill="var(--foreground)" fontSize={12} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* The same numbers for screen readers. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.mode}>
              <th scope="row">{d.label}</th>
              <td>{d.value != null ? d.display : d.missing}</td>
              <td>{nLabel(d.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

type TickProps = { x?: number | string; y?: number | string; payload?: { value: string; index: number } };

function ModeTick({ x = 0, y = 0, payload, data, nLabel }: TickProps & { data: Datum[]; nLabel: (n: number) => string }) {
  const datum = data.find((d) => d.label === payload?.value);
  if (!datum) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text y={14} textAnchor="middle" fontSize={12} fill="var(--foreground)">
        {datum.label}
      </text>
      <text y={30} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)" direction="ltr">
        {nLabel(datum.n)}
      </text>
      {datum.value == null && (
        <text y={-8} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {datum.missing}
        </text>
      )}
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  nLabel,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
  nLabel: (n: number) => string;
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="flex items-center gap-2 font-medium">
        <span className="size-2 rounded-sm" style={{ background: MODE_COLOR[d.mode] }} aria-hidden />
        {d.label}
      </p>
      <p className="mt-1 tabular-nums">{d.value != null ? d.display : d.missing}</p>
      <p className="text-muted-foreground tabular-nums" dir="ltr">
        {nLabel(d.n)}
      </p>
    </div>
  );
}
