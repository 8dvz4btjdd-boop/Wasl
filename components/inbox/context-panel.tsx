"use client";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { formatDateTime, languageName } from "@/components/chat/format";
import { useHydrated } from "@/components/chat/use-clock";
import type { ConversationSummary } from "@/lib/chat/types";
import type { VisibleCard } from "@/lib/db/queries/conversations";
import { cn } from "@/lib/utils";
import { CardSection, FollowupSection } from "./card-section";

type ContextPanelProps = {
  conversation: ConversationSummary;
  pastCount: number | null;
  cards: VisibleCard[];
  onClose: () => void;
  className?: string;
};

/** The card first (what the daee needs before replying), then follow-up context, then the asker. */
export function ContextPanel({ conversation: c, pastCount, cards, onClose, className }: ContextPanelProps) {
  const t = useTranslations("Inbox");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const hydrated = useHydrated();
  const startedAt = c.started_at ?? c.created_at;

  return (
    <aside aria-label={t("details")} className={cn("flex min-h-0 w-[360px] shrink-0 flex-col border-s bg-card", className)}>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("details")}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("cancel")}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-4 py-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">{t("cardTitle")}</h3>
          <CardSection cards={cards} />
        </section>

        <FollowupSection conversation={c} />

        <section className="border-t px-4 py-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">{t("askerSection")}</h3>
          <dl className="flex flex-col gap-3 text-sm">
            <Field label={t("fieldPseudonym")}>{c.asker?.pseudonym}</Field>
            <Field label={t("fieldLanguage")}>{c.asker ? languageName(c.asker.language, locale) : "–"}</Field>
            <Field label={t("fieldTopic")}>{c.topic ? tTopic(c.topic as never) : "–"}</Field>
            <Field label={t("fieldBackground")}>
              {c.asker?.background ? (
                <span dir="auto" className="whitespace-pre-wrap">{c.asker.background}</span>
              ) : (
                <span className="text-muted-foreground">{t("backgroundNone")}</span>
              )}
            </Field>
            <Field label={t("fieldStarted")}>{hydrated ? formatDateTime(startedAt, locale) : ""}</Field>
            <Field label={t("fieldPast")}>
              <span className="tabular-nums">{pastCount ?? "–"}</span>
            </Field>
          </dl>
        </section>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
