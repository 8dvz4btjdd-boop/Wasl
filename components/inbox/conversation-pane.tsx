"use client";

import { ChevronLeft, PanelRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { formatElapsed } from "@/components/chat/elapsed";
import { formatDuration, formatTime } from "@/components/chat/format";
import { MessageList, type SystemLine } from "@/components/chat/message-list";
import { useHydrated, useNow } from "@/components/chat/use-clock";
import { useMessages } from "@/components/chat/use-messages";
import { Button } from "@/components/ui/button";
import { MESSAGE_MAX, type ConversationSummary, type MessageRow } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { isolate } from "@/lib/bidi";
import { Avatar } from "./avatar";
import { EndFollowupPanel } from "./end-panel";
import { IntakeStrip } from "@/components/ai/routing";
import { TransferMenu } from "./transfer-menu";

type ConversationPaneProps = {
  me: { id: string; name: string };
  conversation: ConversationSummary;
  initialMessages: MessageRow[];
  onEnd: () => Promise<boolean>;
  /** Shift+E from the inbox asks to end; the pane shows the inline confirm. */
  endRequest: number;
  /** "/" from the inbox focuses the reply box. */
  focusRequest: number;
  pending: boolean;
  contextOpen: boolean;
  onToggleContext: () => void;
  onBack: () => void;
  /** A card-first transfer is waiting for the asker. */
  transferPending: boolean;
  onTransferred: (status: "completed" | "pending") => void;
  /** A follow-up was rated while ending (null: that question skipped). */
  onRated: (sufficient: boolean | null) => void;
  /** A follow-up's starting point: the master card's next step (or what to follow up on). */
  resumeFrom?: string | null;
};

export function ConversationPane({
  me,
  conversation: c,
  initialMessages,
  onEnd,
  endRequest,
  focusRequest,
  pending,
  contextOpen,
  onToggleContext,
  onBack,
  transferPending,
  onTransferred,
  onRated,
  resumeFrom,
}: ConversationPaneProps) {
  const t = useTranslations("Inbox");
  const tChat = useTranslations("Chat");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const hydrated = useHydrated();
  const { messages, send, retry } = useMessages(c.id, initialMessages, me.id, "daee");
  const composer = useRef<ComposerHandle>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const ended = c.status === "ended";

  const [seenEnd, setSeenEnd] = useState(endRequest);
  if (endRequest !== seenEnd) {
    setSeenEnd(endRequest);
    if (!ended) setConfirming(true);
  }

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (focusRequest) composer.current?.focus();
  }, [focusRequest]);

  // Ending a follow-up asks the two resumption questions first (EndFollowupPanel).
  const followup = Boolean(c.previous_conversation_id);

  async function confirmEnd() {
    setEnding(true);
    const ok = await onEnd();
    setEnding(false);
    if (ok) setConfirming(false);
  }

  const system = useMemo<SystemLine[]>(() => {
    const lines: SystemLine[] = [];
    if (c.assigned_at) lines.push({ id: "joined", at: c.assigned_at, text: tChat("joined", { name: isolate(me.name) }) });
    if (c.ended_at) lines.push({ id: "ended", at: c.ended_at, text: tChat("endedBy", { name: isolate(me.name) }) });
    return lines;
  }, [c.assigned_at, c.ended_at, me.name, tChat]);

  const name = c.asker?.pseudonym ?? "–";

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-150", pending && "opacity-60")}>
      <header className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
        >
          <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
        </button>
        <Avatar name={name} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate font-semibold">{name}</h2>
            {c.asker && (
              <span className="rounded border px-1.5 text-[11px] leading-5 text-muted-foreground uppercase">{c.asker.language}</span>
            )}
            {c.topic && (
              <span className="rounded-full bg-muted px-2 text-[11px] leading-5 text-muted-foreground">{tTopic(c.topic as never)}</span>
            )}
            {!ended && <StatusPill conversation={c} />}
          </div>
          {c.asker?.background && <p dir="auto" className="truncate text-xs text-muted-foreground">{c.asker.background}</p>}
          {!ended && c.previous_conversation_id && resumeFrom && (
            <p data-testid="resume-from" className="truncate text-xs text-teal-fg">
              {t("resumeFrom", { text: isolate(resumeFrom) })}
            </p>
          )}
          {!ended && !c.started_at && <IntakeStrip topic={c.topic} depth={c.depth ?? null} by={c.classified_by ?? null} level={c.level ?? null} />}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!ended && !confirming &&
            (transferPending ? (
              <span className="rounded-full bg-warning-bg px-2.5 text-xs leading-6 font-medium text-warning-fg">{t("transferPending")}</span>
            ) : (
              <TransferMenu conversationId={c.id} askerLanguage={c.asker?.language ?? "ar"} onDone={onTransferred} />
            ))}
          {!ended &&
            (confirming && followup ? null : confirming ? (
              <>
                <Button ref={confirmButton} size="sm" variant="destructive" disabled={ending} onClick={confirmEnd}>
                  {t("confirmEnd")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  {t("cancel")}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" title={`${t("end")} (Shift+E)`} onClick={() => setConfirming(true)}>
                {t("end")}
              </Button>
            ))}
          <Button
            size="icon-sm"
            variant={contextOpen ? "secondary" : "ghost"}
            aria-pressed={contextOpen}
            aria-label={t("details")}
            title={t("details")}
            onClick={onToggleContext}
          >
            <PanelRight className="rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </header>

      {confirming && followup && !ended && (
        <EndFollowupPanel conversation={c} ending={ending} onEnd={confirmEnd} onCancel={() => setConfirming(false)} onRated={onRated} />
      )}

      <MessageList messages={messages} me={me.id} system={system} onRetry={retry} size="compact" />

      <div className="border-t px-4 py-3 md:px-6">
        {ended ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {hydrated && c.ended_at
              ? t("endedFooter", {
                  time: formatTime(c.ended_at, locale),
                  duration: formatDuration(Date.parse(c.ended_at) - Date.parse(c.started_at ?? c.created_at), locale),
                })
              : null}
          </p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {c.status === "waiting" && <p className="text-xs text-muted-foreground">{t("notStarted")}</p>}
            <Composer
              ref={composer}
              onSend={send}
              placeholder={t("reply")}
              sendLabel={tChat("send")}
              maxLength={MESSAGE_MAX}
              size="compact"
              onEscape={() => (document.activeElement as HTMLElement | null)?.blur()}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** "تنتظر 03:12" (amber) or "نشطة منذ 6 د" (teal), live. */
function StatusPill({ conversation: c }: { conversation: ConversationSummary }) {
  const t = useTranslations("Inbox");
  const locale = useLocale();
  const now = useNow();
  if (now === null) return null;
  if (c.status === "waiting") {
    return (
      <span className="rounded-full bg-warning-bg px-2 text-[11px] leading-5 font-medium text-warning-fg tabular-nums">
        {t("statusWaiting", { time: formatElapsed(now - Date.parse(c.created_at)) })}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-teal-bg px-2 text-[11px] leading-5 font-medium text-teal-fg">
      {t("statusActive", { duration: formatDuration(now - Date.parse(c.started_at ?? c.created_at), locale, "narrow") })}
    </span>
  );
}
