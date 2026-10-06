"use client";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AssistantPanel, type AssistRequest } from "./assistant";
import { formatDateTime, languageName } from "@/components/chat/format";
import { useHydrated } from "@/components/chat/use-clock";
import type { ConversationSummary } from "@/lib/chat/types";
import type { VisibleCard } from "@/lib/db/queries/conversations";
import { cn } from "@/lib/utils";
import { CardSection, FollowupSection } from "./card-section";
import { Readings } from "@/components/ai/readings";

type ContextPanelProps = {
  conversation: ConversationSummary;
  pastCount: number | null;
  cards: VisibleCard[];
  onClose: () => void;
  className?: string;
  tab: "details" | "assistant";
  onTab: (tab: "details" | "assistant") => void;
  aiEnabled: boolean;
  assistRequest: AssistRequest;
  onInsert: (text: string) => void;
};

/** The card first (what the daee needs before replying), then follow-up context, then the asker. */
export function ContextPanel({ conversation: c, pastCount, cards, onClose, className, tab, onTab, aiEnabled, assistRequest, onInsert }: ContextPanelProps) {
  const tAssist = useTranslations("Assist");
  const t = useTranslations("Inbox");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const hydrated = useHydrated();
  const startedAt = c.started_at ?? c.created_at;

  return (
    <aside aria-label={t("details")} className={cn("flex min-h-0 w-[360px] shrink-0 flex-col border-s bg-card", className)}>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div role="tablist" aria-label={t("details")} className="flex rounded-lg border bg-muted p-0.5">
          {(["details", "assistant"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTab(key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                tab === key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "details" ? t("details") : tAssist("tab")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("cancel")}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      {tab === "assistant" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AssistantPanel key={c.id} conversationId={c.id} aiEnabled={aiEnabled} request={assistRequest} onInsert={onInsert} />
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-4 py-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">{t("cardTitle")}</h3>
          <CardSection cards={cards} />
        </section>

        <FollowupSection conversation={c} />

        {c.level !== "d" && (
          <section className="border-t px-4 py-4">
            <Readings key={c.id} conversationId={c.id} tone="workspace" />
          </section>
        )}

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
      )}
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
