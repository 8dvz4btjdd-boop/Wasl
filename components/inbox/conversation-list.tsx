"use client";

import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatElapsed } from "@/components/chat/elapsed";
import { formatRelative } from "@/components/chat/format";
import { useNow } from "@/components/chat/use-clock";
import { isUnread } from "@/lib/chat/inbox-query";
import type { ConversationSummary, Presence } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { PresenceMenu } from "./presence-toggle";
import { AccountMenu } from "./rail";

export type Segment = "waiting" | "active" | "ended";
export const SEGMENTS: Segment[] = ["waiting", "active", "ended"];

export function segmentOf(c: ConversationSummary): Segment {
  return c.status === "ended" ? "ended" : c.status === "active" ? "active" : "waiting";
}

type ConversationListProps = {
  me: { name: string };
  presence: Presence;
  onPresence: (value: Presence) => void;
  conversations: ConversationSummary[];
  /** Rows of the current segment after search, in display order. */
  visible: ConversationSummary[];
  segment: Segment;
  onSegment: (segment: Segment) => void;
  query: string;
  onQuery: (query: string) => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
};

export function ConversationList({
  me,
  presence,
  onPresence,
  conversations,
  visible,
  segment,
  onSegment,
  query,
  onQuery,
  selectedId,
  onOpen,
}: ConversationListProps) {
  const t = useTranslations("Inbox");
  const counts = Object.fromEntries(
    SEGMENTS.map((s) => [s, conversations.filter((c) => segmentOf(c) === s).length]),
  ) as Record<Segment, number>;
  const label: Record<Segment, string> = { waiting: t("waiting"), active: t("active"), ended: t("endedToday") };
  const empty: Record<Segment, string> = { waiting: t("emptyWaiting"), active: t("emptyActive"), ended: t("emptyEnded") };

  return (
    <aside className="flex min-h-0 flex-col border-e bg-card">
      <header className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AccountMenu name={me.name} presence={presence} className="md:hidden" />
            <h1 className="text-base font-semibold">{t("title")}</h1>
          </div>
          <PresenceMenu value={presence} onChange={onPresence} />
        </div>

        <label className="relative block">
          <span className="sr-only">{t("search")}</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("search")}
            className="h-8 w-full rounded-lg border border-input bg-background ps-8 pe-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <div role="tablist" aria-label={t("title")} className="flex gap-1 rounded-lg bg-muted p-0.5">
          {SEGMENTS.map((s) => {
            const active = s === segment;
            return (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onSegment(s)}
                className={cn(
                  "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label[s]}
                <span className={cn("tabular-nums", s === "waiting" && counts.waiting > 0 ? "text-warning-fg" : "text-muted-foreground")}>
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto border-t">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
            <p className="text-sm font-medium">{query ? t("noResults", { query }) : empty[segment]}</p>
            {!query && segment === "waiting" && presence !== "available" && (
              <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
            )}
          </div>
        ) : (
          <ul className="py-1">
            {visible.map((c) => (
              <Row key={c.id} conversation={c} selected={c.id === selectedId} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Row({ conversation: c, selected, onOpen }: { conversation: ConversationSummary; selected: boolean; onOpen: (id: string) => void }) {
  const t = useTranslations("Inbox");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const now = useNow();
  const unread = isUnread(c);
  const name = c.asker?.pseudonym ?? "–";
  const waiting = c.status === "waiting";
  const elapsed = now === null ? "–" : formatElapsed(now - Date.parse(c.created_at));
  const activityAt = c.status === "ended" ? (c.ended_at ?? c.created_at) : (c.last_message?.created_at ?? c.created_at);

  return (
    <li>
      <a
        href={`/${locale}/daee/${c.id}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onOpen(c.id);
        }}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex gap-3 border-s-2 px-4 py-2.5 transition-colors duration-150 focus-visible:bg-muted focus-visible:outline-none",
          selected ? "border-s-teal-fg bg-muted" : "border-s-transparent hover:bg-muted/60",
        )}
      >
        <Avatar name={name} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{name}</span>
            {c.asker && (
              <span className="shrink-0 rounded border px-1 text-[10px] leading-4 text-muted-foreground uppercase">
                {c.asker.language}
              </span>
            )}
            {waiting ? (
              <span className="ms-auto shrink-0 text-xs font-medium text-warning-fg" dir="ltr" style={{ fontVariantNumeric: "tabular-nums" }}>
                <span className="sr-only">{t("statusWaiting", { time: elapsed })}</span>
                <span aria-hidden>{elapsed}</span>
              </span>
            ) : (
              <time dateTime={activityAt} className="ms-auto shrink-0 text-xs text-muted-foreground">
                {now === null ? "" : formatRelative(activityAt, now, locale)}
              </time>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            {c.topic && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] leading-[18px] text-muted-foreground">
                {tTopic(c.topic as never)}
              </span>
            )}
            <span className={cn("truncate text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
              {c.last_message?.body}
            </span>
            {unread && (
              <span className="ms-auto size-2 shrink-0 rounded-full bg-brand-violet">
                <span className="sr-only">{t("unreadDot")}</span>
              </span>
            )}
          </span>
        </span>
      </a>
    </li>
  );
}
