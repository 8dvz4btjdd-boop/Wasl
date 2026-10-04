"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { Elapsed } from "@/components/chat/elapsed";
import { MessageList } from "@/components/chat/message-list";
import { useMessages } from "@/components/chat/use-messages";
import { Button } from "@/components/ui/button";
import { MESSAGE_MAX, type ConversationSummary, type MessageRow } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type ConversationPaneProps = {
  me: string;
  conversation: ConversationSummary;
  initialMessages: MessageRow[];
  onEnd: () => Promise<boolean>;
  /** Shift+E from the inbox asks to end; the pane shows the inline confirm. */
  endRequest: number;
  /** "/" from the inbox focuses the reply box. */
  focusRequest: number;
  pending: boolean;
};

export function ConversationPane({
  me,
  conversation,
  initialMessages,
  onEnd,
  endRequest,
  focusRequest,
  pending,
}: ConversationPaneProps) {
  const t = useTranslations("Inbox");
  const tChat = useTranslations("Chat");
  const tTopic = useTranslations("Topics");
  const { messages, send, retry } = useMessages(conversation.id, initialMessages, me, "daee");
  const composer = useRef<ComposerHandle>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const ended = conversation.status === "ended";

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

  async function confirmEnd() {
    setEnding(true);
    const ok = await onEnd();
    setEnding(false);
    if (ok) setConfirming(false);
  }

  const asker = conversation.asker;

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col transition-opacity duration-150", pending && "opacity-60")}>
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-semibold">{asker?.pseudonym}</h2>
            <span className="rounded border px-1.5 text-[11px] leading-5 text-muted-foreground uppercase">
              {asker?.language}
            </span>
            {conversation.topic && (
              <span className="text-xs text-muted-foreground">{tTopic(conversation.topic as never)}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {ended ? (
              t("ended")
            ) : conversation.status === "waiting" ? (
              <>
                {t("waitingLabel")} <Elapsed since={conversation.created_at} />
              </>
            ) : (
              conversation.started_at && <Elapsed since={conversation.started_at} />
            )}
          </p>
        </div>

        {!ended &&
          (confirming ? (
            <div className="flex items-center gap-2">
              <Button ref={confirmButton} size="sm" variant="destructive" disabled={ending} onClick={confirmEnd}>
                {t("confirmEnd")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" title={`${t("end")} (Shift+E)`} onClick={() => setConfirming(true)}>
              {t("end")}
            </Button>
          ))}
      </header>

      {asker?.background && (
        <p className="border-b bg-muted/50 px-6 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("about")}: </span>
          {asker.background}
        </p>
      )}

      <MessageList messages={messages} me={me} onRetry={retry} size="compact" />

      <div className="border-t px-6 py-3">
        {ended ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{t("ended")}</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {conversation.status === "waiting" && <p className="text-xs text-muted-foreground">{t("notStarted")}</p>}
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
