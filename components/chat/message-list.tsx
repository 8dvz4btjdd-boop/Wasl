"use client";

import { Clock } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat/types";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatDay } from "./format";
import { useHydrated } from "./use-clock";

export type SystemLine = { id: string; at: string; text: string };

type MessageListProps = {
  messages: ChatMessage[];
  me: string;
  system?: SystemLine[];
  onRetry: (id: string) => void;
  size?: "asker" | "compact";
  /** Rendered after the last message (e.g. the waiting state). */
  footer?: ReactNode;
};

type Item =
  | { kind: "group"; key: string; mine: boolean; messages: ChatMessage[] }
  | { kind: "system"; key: string; line: SystemLine }
  | { kind: "day"; key: string; label: string };

const GROUP_GAP_MS = 5 * 60 * 1000;

/** Local calendar day, for separators (browser time zone, so only computed after hydration). */
function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function buildItems(
  messages: ChatMessage[],
  me: string,
  system: SystemLine[],
  dayLabel: ((iso: string) => string) | null,
): Item[] {
  const timeline = [
    ...messages.map((m) => ({ at: m.created_at, message: m })),
    ...system.map((line) => ({ at: line.at, line })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const items: Item[] = [];
  let currentDay: string | null = null;
  for (const entry of timeline) {
    if (dayLabel && dayKey(entry.at) !== currentDay) {
      currentDay = dayKey(entry.at);
      items.push({ kind: "day", key: `day-${currentDay}`, label: dayLabel(entry.at) });
    }
    if ("line" in entry) {
      items.push({ kind: "system", key: entry.line.id, line: entry.line });
      continue;
    }
    const m = entry.message;
    const mine = m.sender_id === me;
    const last = items.at(-1);
    const lastMessage = last?.kind === "group" ? last.messages.at(-1) : undefined;
    if (
      last?.kind === "group" &&
      last.mine === mine &&
      lastMessage &&
      Date.parse(m.created_at) - Date.parse(lastMessage.created_at) < GROUP_GAP_MS
    ) {
      last.messages.push(m);
    } else {
      items.push({ kind: "group", key: m.id, mine, messages: [m] });
    }
  }
  return items;
}

export function MessageList({ messages, me, system = [], onRetry, size = "asker", footer }: MessageListProps) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const hydrated = useHydrated();
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  // Messages present on first render don't animate; only new arrivals do (motion animates on mount only).
  const [initialIds] = useState(() => new Set(messages.map((m) => m.id)));

  // "Today"/"Yesterday" are relative to when the view opened; labels only render after hydration.
  const [openedAt] = useState(() => Date.now());
  const items = useMemo(
    () => buildItems(messages, me, system, hydrated ? (iso) => formatDay(iso, openedAt, locale) : null),
    [messages, me, system, hydrated, locale, openedAt],
  );
  const time = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
    [locale],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Stay pinned to the bottom when the list shrinks (e.g. the composer turns into a panel).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lastMine = messages.at(-1)?.sender_id === me;
  useEffect(() => {
    const el = scroller.current;
    if (el && (nearBottom.current || lastMine)) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, lastMine, footer]);

  const compact = size === "compact";

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <ol
        role="log"
        aria-live="polite"
        aria-label={t("log")}
        className={cn("mx-auto flex w-full flex-col", compact ? "max-w-3xl gap-3 px-6 py-6" : "max-w-2xl gap-4 px-4 py-6 sm:px-6")}
      >
        {items.map((item) =>
          item.kind === "day" ? (
            <li key={item.key} className="sticky top-2 z-10 flex justify-center py-1">
              <span className="rounded-full border bg-background/90 px-3 py-0.5 text-xs text-muted-foreground backdrop-blur">
                {item.label}
              </span>
            </li>
          ) : item.kind === "system" ? (
            <li key={item.key} className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" aria-hidden />
              {item.line.text}
              <span className="h-px flex-1 bg-border" aria-hidden />
            </li>
          ) : (
            <li key={item.key} className={cn("flex flex-col gap-1", item.mine ? "items-end" : "items-start")}>
              {item.messages.map((m, i) => {
                const isLast = i === item.messages.length - 1;
                const isNew = !initialIds.has(m.id);
                return (
                  <motion.div
                    key={m.id}
                    dir="auto"
                    variants={fadeUp}
                    initial={isNew ? "hidden" : false}
                    animate="visible"
                    className={cn(
                      "max-w-[85%] rounded-2xl whitespace-pre-wrap break-words",
                      compact ? "px-3 py-2 text-sm" : "px-4 py-2.5 text-base sm:text-lg",
                      item.mine
                        ? "bg-brand-violet text-white"
                        : "border bg-card text-card-foreground",
                      isLast && (item.mine ? "rounded-ee-md" : "rounded-es-md"),
                      m.state === "pending" && "opacity-60",
                    )}
                  >
                    {m.body}
                  </motion.div>
                );
              })}
              <GroupMeta
                last={item.messages.at(-1)!}
                time={hydrated ? time.format(new Date(item.messages.at(-1)!.created_at)) : ""}
                onRetry={onRetry}
              />
            </li>
          ),
        )}
        {footer && <li className="list-none">{footer}</li>}
      </ol>
    </div>
  );
}

function GroupMeta({ last, time, onRetry }: { last: ChatMessage; time: string; onRetry: (id: string) => void }) {
  const t = useTranslations("Chat");
  if (last.state === "failed") {
    return (
      <button
        type="button"
        onClick={() => onRetry(last.id)}
        className="rounded text-xs text-destructive underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {t("failed")}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
      {last.state === "pending" && <Clock className="size-3" aria-label={t("sending")} />}
      {time}
    </span>
  );
}
