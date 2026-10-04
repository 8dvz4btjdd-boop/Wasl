"use client";

import { CircleCheck, Clock3, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatElapsed } from "@/components/chat/elapsed";
import { formatTime, languageName } from "@/components/chat/format";
import { useHydrated, useNow } from "@/components/chat/use-clock";
import type { Alerts, OpsSnapshot } from "@/lib/admin/types";
import { createClient, subscribeResilient } from "@/lib/db/client";
import { cn } from "@/lib/utils";

type LiveOpsProps = { initialOps: OpsSnapshot | null; initialAlerts: Alerts | null };

/** Real-time: refreshes on any conversation or presence change, and heals if the socket drops. */
export function LiveOps({ initialOps, initialAlerts }: LiveOpsProps) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const now = useNow();
  const hydrated = useHydrated();
  const [ops, setOps] = useState(initialOps);
  const [alerts, setAlerts] = useState(initialAlerts);
  // When this client last saw the snapshot, so the longest wait keeps counting between refreshes.
  const [seenAt, setSeenAt] = useState(() => Date.now());

  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const [o, a] = await Promise.all([supabase.rpc("admin_ops_snapshot"), supabase.rpc("admin_alerts", {})]);
      if (o.data) {
        setOps(o.data as unknown as OpsSnapshot);
        setSeenAt(Date.now());
      }
      if (a.data) setAlerts(a.data as unknown as Alerts);
    };
    return subscribeResilient({
      name: "admin-ops",
      configure: (channel) =>
        channel
          .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => void refresh())
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => void refresh()),
      onResync: refresh,
    });
  }, []);

  const longest =
    ops?.longest_wait_seconds != null && now !== null
      ? formatElapsed(ops.longest_wait_seconds * 1000 + (now - seenAt))
      : "–";
  const longOverThreshold =
    ops?.longest_wait_seconds != null && alerts && ops.longest_wait_seconds >= alerts.threshold_minutes * 60;

  const cells = [
    { label: t("ops.available"), value: ops?.available_daee ?? "–" },
    { label: t("ops.waiting"), value: ops?.waiting ?? "–", warn: (ops?.waiting ?? 0) > 0 },
    { label: t("ops.longest"), value: longest, warn: longOverThreshold, ltr: true },
    { label: t("ops.active"), value: ops?.active ?? "–" },
  ];

  const alertItems = [
    ...(alerts?.uncovered_languages ?? []).map((a) => ({
      key: `lang-${a.language}`,
      icon: Languages,
      text: t("alerts.uncovered", { count: a.count, language: languageName(a.language, locale) }),
      since: a.since,
    })),
    ...(alerts?.long_waits ?? []).map((a, i) => ({
      key: `wait-${i}-${a.since}`,
      icon: Clock3,
      text: t("alerts.longWait", { minutes: alerts!.threshold_minutes, language: languageName(a.language, locale) }),
      since: a.since,
    })),
  ];

  return (
    <section aria-labelledby="ops-title" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-teal-fg" aria-hidden />
        <h2 id="ops-title" className="text-sm font-medium">
          {t("ops.title")}
        </h2>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col gap-1 bg-card p-5">
            <dt className="text-xs text-muted-foreground">{cell.label}</dt>
            <dd
              dir={cell.ltr ? "ltr" : undefined}
              className={cn("self-start text-3xl font-semibold tabular-nums", cell.warn && "text-warning-fg")}
            >
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="rounded-xl border bg-card">
        <h3 className="border-b px-5 py-3 text-sm font-medium">{t("alerts.title")}</h3>
        {alertItems.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-teal-fg" aria-hidden />
            {t("alerts.clear")}
          </p>
        ) : (
          <ul className="divide-y">
            {alertItems.map(({ key, icon: Icon, text, since }) => (
              <li key={key} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Icon className="size-4 shrink-0 text-warning-fg" aria-hidden />
                <span className="flex-1">{text}</span>
                <time dateTime={since} className="shrink-0 text-xs text-muted-foreground">
                  {hydrated ? t("alerts.since", { time: formatTime(since, locale) }) : ""}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
