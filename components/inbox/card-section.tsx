"use client";

import { Check, ChevronDown, IdCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AIBadge } from "@/components/ai/ai-badge";
import { SourceChips } from "@/components/ai/source-chips";
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
  const master = cards.find((c) => c.scope === "master");
  if (!master) {
    return (
      <div className="flex flex-col gap-4">
        {cards.map((card) => (
          <CardItem key={card.id} card={card} />
        ))}
      </div>
    );
  }
  return <MasterWithSessions master={master} sessions={cards.filter((c) => c.scope === "session")} />;
}

/**
 * The master card first ("updated after N sessions"), then the session cards folded under
 * "Previous sessions", each with its date and expandable. Chips on the master open the
 * session card a field came from.
 */
function MasterWithSessions({ master, sessions }: { master: VisibleCard; sessions: VisibleCard[] }) {
  const t = useTranslations("Inbox");
  const locale = useLocale();
  const hydrated = useHydrated();
  const [open, setOpen] = useState<string | null>(null);
  const [foldOpen, setFoldOpen] = useState(false);
  // Numbered oldest first, like the sessions themselves.
  const ordered = useMemo(() => [...sessions].sort((a, b) => Date.parse(a.approved_at ?? "") - Date.parse(b.approved_at ?? "")), [sessions]);
  const numberOf = useMemo(() => new Map(ordered.map((c, i) => [c.id, i + 1])), [ordered]);
  const isAI = master.origin === "ai";
  const date = (iso: string | null) => (iso && hydrated ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "");

  return (
    <div className="flex flex-col gap-3">
      <article
        data-testid="master-card"
        className={cn("flex flex-col gap-3 rounded-lg border bg-background p-3", isAI && "border-brand-violet/40 bg-brand-violet/[0.04]")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold">{t("masterTitle", { count: master.source_card_ids.length })}</p>
          {isAI && <AIBadge />}
        </div>
        <p className="text-[11px] text-muted-foreground">{isAI ? t("cardByAI") : t("cardByAsker")}</p>
        <CardView
          fields={master}
          size="compact"
          aside={(field) => (
            <SourceChips
              ids={master.field_sources?.[field] ?? []}
              numberOf={numberOf}
              active={open}
              onHighlight={(id) => {
                if (!id) return;
                setFoldOpen(true);
                setOpen(id);
              }}
            />
          )}
        />
        <p className="border-t pt-2 text-xs text-muted-foreground">
          {master.expires_at ? t("cardUntil", { date: date(master.expires_at) }) : t("cardUntilDeleted")}
        </p>
      </article>

      {ordered.length > 0 && (
        <div className="rounded-lg border">
          <button
            type="button"
            aria-expanded={foldOpen}
            onClick={() => setFoldOpen(!foldOpen)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-start text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronDown className={cn("size-3.5 transition-transform duration-150", !foldOpen && "-rotate-90 rtl:rotate-90")} aria-hidden />
            {t("previousSessions", { count: ordered.length })}
          </button>
          <ol data-testid="session-list" hidden={!foldOpen} className="flex flex-col gap-2 px-3 pb-3">
            {ordered.map((card) => (
              <li key={card.id} className={cn("rounded-md border bg-background", open === card.id && "border-brand-teal/60")}>
                <button
                  type="button"
                  aria-expanded={open === card.id}
                  onClick={() => setOpen(open === card.id ? null : card.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-start text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="grid h-5 min-w-5 place-items-center rounded-full border border-brand-teal/50 px-1 text-[11px] font-semibold text-teal-fg tabular-nums">
                    {numberOf.get(card.id)}
                  </span>
                  <span>{t("sessionOn", { date: date(card.approved_at) })}</span>
                </button>
                {open === card.id && (
                  <div className="px-2.5 pb-2.5">
                    <CardItem card={card} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function CardItem({ card }: { card: VisibleCard }) {
  const t = useTranslations("Inbox");
  const locale = useLocale();
  const hydrated = useHydrated();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const isAI = card.origin === "ai";

  // Only readable through card_sources, and only for daee who can view this card. AI cards
  // load them up front so each field's chips can point at its messages.
  useEffect(() => {
    if (!isAI) return;
    let alive = true;
    void createClient()
      .rpc("card_sources", { card: card.id })
      .then(({ data }) => alive && setSources(data ?? []));
    return () => {
      alive = false;
    };
  }, [card.id, isAI]);
  const numberOf = useMemo(() => new Map((sources ?? []).map((s, i) => [s.id, i + 1])), [sources]);

  async function toggleSources() {
    const next = !open;
    setOpen(next);
    if (next && sources === null) {
      const { data } = await createClient().rpc("card_sources", { card: card.id });
      setSources(data ?? []);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-background p-3">
      {card.from_previous && <p className="text-[11px] font-medium text-teal-fg">{t("cardPrevious")}</p>}
      <p className="text-[11px] text-muted-foreground">{isAI ? t("cardByAI") : t("cardByAsker")}</p>
      <CardView
        fields={card}
        size="compact"
        aside={
          isAI
            ? (field) => (
                <SourceChips
                  ids={card.field_sources?.[field] ?? []}
                  numberOf={numberOf}
                  active={active}
                  onHighlight={(id) => {
                    setActive(id);
                    if (id) setOpen(true);
                  }}
                />
              )
            : undefined
        }
      />
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
                "border-s-2 ps-2.5 text-xs whitespace-pre-wrap transition-colors duration-150",
                active === s.id && "rounded-e bg-teal-bg",
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
