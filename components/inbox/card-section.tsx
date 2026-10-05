"use client";

import { Check, IdCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { CardView } from "@/components/cards/card-view";
import { formatTime } from "@/components/chat/format";
import { useHydrated } from "@/components/chat/use-clock";
import type { ConversationSummary } from "@/lib/chat/types";
import { createClient } from "@/lib/db/client";
import type { VisibleCard } from "@/lib/db/queries/conversations";
import { isolate } from "@/lib/bidi";
import { cn } from "@/lib/utils";

type Source = { id: string; sender_role: string; body: string; created_at: string };

/** The Wasl card(s) this daee may see; the empty state when there's no card or no access. */
export function CardSection({ cards }: { cards: VisibleCard[] }) {
  const t = useTranslations("Inbox");
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
        <IdCard className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">{t("cardEmpty")}</p>
        <p className="text-xs text-muted-foreground">{t("cardHint")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {cards.map((card) => (
        <CardItem key={card.id} card={card} />
      ))}
    </div>
  );
}

function CardItem({ card }: { card: VisibleCard }) {
  const t = useTranslations("Inbox");
  const locale = useLocale();
  const hydrated = useHydrated();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [open, setOpen] = useState(false);

  async function toggleSources() {
    const next = !open;
    setOpen(next);
    if (next && sources === null) {
      // Only readable through card_sources, and only for daee who can view this card.
      const { data } = await createClient().rpc("card_sources", { card: card.id });
      setSources(data ?? []);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-background p-3">
      {card.from_previous && <p className="text-[11px] font-medium text-teal-fg">{t("cardPrevious")}</p>}
      <CardView fields={card} size="compact" />
      <dl className="flex flex-col gap-1 border-t pt-3 text-xs text-muted-foreground">
        {card.preferred_name && <dd>{t("cardPrefers", { name: isolate(card.preferred_name) })}</dd>}
        <dd>{card.accept_substitute ? t("cardSubstituteOk") : t("cardSameOnly")}</dd>
        {!card.expires_at && <dd>{t("cardUntilDeleted")}</dd>}
        {card.expires_at && hydrated && (
          <dd>{t("cardUntil", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(card.expires_at)) })}</dd>
        )}
      </dl>
      <button
        type="button"
        onClick={toggleSources}
        aria-expanded={open}
        className="self-start rounded text-xs font-medium text-violet-fg underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {t("cardSources", { count: card.source_message_ids.length })}
      </button>
      {open && (
        <ul className="flex flex-col gap-2">
          {(sources ?? []).map((s) => (
            <li
              key={s.id}
              dir="auto"
              className={cn(
                "border-s-2 ps-2.5 text-xs whitespace-pre-wrap",
                s.sender_role === "asker" ? "border-brand-violet/60" : "border-brand-teal/60 text-muted-foreground",
              )}
            >
              {s.body}
              <span className="ms-1.5 text-[10px] text-muted-foreground">{hydrated ? formatTime(s.created_at, locale) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** Follow-up context and the one-click "was the context enough?" after a substantive reply. */
/** Marks a follow-up and its mode; the resumption questions come when the daee ends it. */
export function FollowupSection({ conversation }: { conversation: ConversationSummary }) {
  const t = useTranslations("Inbox");
  if (!conversation.previous_conversation_id) return null;
  const mode = conversation.followup_mode ?? "none";
  const rated = conversation.followup_sufficient;

  return (
    <section className="flex flex-col gap-3 border-t px-4 py-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-muted-foreground">{t("followup")}</h3>
        <span className="self-start rounded-full bg-muted px-2 text-[11px] leading-5 text-muted-foreground">{t(`mode_${mode}`)}</span>
      </div>
      {rated !== null && (
        <p className="flex items-center gap-1.5 text-sm text-teal-fg">
          <Check className="size-4" aria-hidden />
          {t("rated")}: {rated ? t("yes") : t("no")}
        </p>
      )}
    </section>
  );
}
