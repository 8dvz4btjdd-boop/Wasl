"use client";

import { Check, IdCard } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Composer } from "@/components/chat/composer";
import { Elapsed } from "@/components/chat/elapsed";
import { MessageList, type SystemLine } from "@/components/chat/message-list";
import { useMessages } from "@/components/chat/use-messages";
import { NewReturnCode } from "@/components/asker/new-code";
import { Readings } from "@/components/ai/readings";
import { ClassificationConfirm, MatchLine, type MatchReasons } from "@/components/ai/routing";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { Surface } from "@/components/surface";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { checkTransferTarget, requeueTransfer, transferNow } from "@/lib/cards/actions";
import { isolate } from "@/lib/bidi";
import { MESSAGE_MAX, type ConversationStatus, type MessageRow } from "@/lib/chat/types";
import { createClient, subscribeResilient } from "@/lib/db/client";
import { fadeUp, pulse } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  daee_id: string | null;
  status: ConversationStatus;
  created_at: string;
  assigned_at: string | null;
  ended_at: string | null;
  topic?: string | null;
  classified_by?: string | null;
  match_quality?: string | null;
  match_reasons?: unknown;
};

export type TransferLine = { id: string; status: "pending" | "accepted" | "declined"; created_at: string; to_name: string | null; requeued_at: string | null };

type AskerChatProps = {
  me: string;
  initialConversation: Conversation;
  initialDaeeName: string | null;
  initialMessages: MessageRow[];
  initialTransfers: TransferLine[];
  initialCardApproved: boolean;
  /** The asker's language, for "understood as … · Arabic". */
  language: string;
  /** Off: no classification card (the chip decided). */
  aiEnabled: boolean;
};

/** Transfers of this conversation with the receiving daee's name (the asker can read both). */
async function loadTransfers(conversationId: string): Promise<TransferLine[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transfers")
    .select("id, status, created_at, to_daee, requeued_at")
    .eq("conversation_id", conversationId)
    .order("created_at");
  if (!data?.length) return [];
  const { data: names } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", data.map((tr) => tr.to_daee));
  const nameOf = new Map((names ?? []).map((n) => [n.user_id, n.display_name]));
  return data.map((tr) => ({ id: tr.id, status: tr.status, created_at: tr.created_at, to_name: nameOf.get(tr.to_daee) ?? null, requeued_at: tr.requeued_at }));
}

const QUEUE_POLL_MS = 15_000;

export function AskerChat({
  me,
  initialConversation,
  initialDaeeName,
  initialMessages,
  initialTransfers,
  initialCardApproved,
  language,
  aiEnabled,
}: AskerChatProps) {
  const t = useTranslations("Chat");
  const [conversation, setConversation] = useState(initialConversation);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [cardApproved, setCardApproved] = useState(initialCardApproved);
  const [moving, startMoving] = useTransition();
  const refreshTransfers = useCallback(
    () => loadTransfers(initialConversation.id).then(setTransfers),
    [initialConversation.id],
  );
  const [daeeName, setDaeeName] = useState(initialDaeeName);
  const [position, setPosition] = useState<number | null>(null);
  const { messages, send, retry } = useMessages(conversation.id, initialMessages, me, "asker");

  const waiting = conversation.status === "waiting" && !conversation.daee_id;
  const ended = conversation.status === "ended";

  // Assignment, transfers, start and end arrive as updates to this conversation, its
  // transfers and its cards.
  useEffect(
    () =>
      subscribeResilient({
        name: `conversation:${conversation.id}`,
        configure: (channel) =>
          channel
            .on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversation.id}` },
              (payload) => setConversation((prev) => ({ ...prev, ...(payload.new as Partial<Conversation>) })),
            )
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "transfers", filter: `conversation_id=eq.${conversation.id}` },
              () => void refreshTransfers(),
            )
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "cards", filter: `conversation_id=eq.${conversation.id}` },
              (payload) => {
                if ((payload.new as { status?: string }).status === "approved") setCardApproved(true);
              },
            ),
        onResync: async () => {
          const { data } = await createClient()
            .from("conversations")
            .select("id, daee_id, status, created_at, assigned_at, ended_at, topic, classified_by, match_quality, match_reasons")
            .eq("id", conversation.id)
            .maybeSingle();
          if (data) setConversation((prev) => ({ ...prev, ...data }));
          void refreshTransfers();
        },
      }),
    [conversation.id, refreshTransfers],
  );

  useEffect(() => {
    if (!conversation.daee_id) return;
    let cancelled = false;
    createClient()
      .from("profiles")
      .select("display_name")
      .eq("user_id", conversation.daee_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setDaeeName(data.display_name);
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.daee_id]);

  // Other askers' rows are hidden by RLS, so the position is polled, not pushed.
  useEffect(() => {
    if (!waiting) return;
    const supabase = createClient();
    const load = () =>
      supabase.rpc("queue_position", { conv: conversation.id }).then(({ data }) => {
        if (typeof data === "number") setPosition(data);
      });
    void load();
    const timer = setInterval(load, QUEUE_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, conversation.id]);

  const accepted = useMemo(() => transfers.filter((tr) => tr.status === "accepted"), [transfers]);
  const pendingTransfer = transfers.find((tr) => tr.status === "pending") ?? null;
  const pendingId = pendingTransfer?.id ?? null;
  // Whether the colleague a card-first transfer waits on is still free (null: not checked yet).
  const [targetAvailable, setTargetAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pendingId) return;
    let active = true;
    const check = () => checkTransferTarget(conversation.id).then((r) => active && setTargetAvailable(r.available));
    void check();
    const timer = window.setInterval(check, QUEUE_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pendingId, conversation.id]);
  const targetGone = pendingTransfer !== null && targetAvailable === false;

  const system = useMemo<SystemLine[]>(() => {
    const lines: SystemLine[] = [];
    // After a transfer, assigned_at is the hand-over time; the transfer lines tell the story.
    if (daeeName && conversation.assigned_at && accepted.length === 0) {
      lines.push({ id: "joined", at: conversation.assigned_at, text: t("joined", { name: isolate(daeeName) }) });
    }
    for (const tr of accepted) {
      lines.push({ id: `transfer-${tr.id}`, at: tr.created_at, text: t("transferred", { name: isolate(tr.to_name ?? "") }) });
    }
    for (const tr of transfers) {
      if (tr.requeued_at) lines.push({ id: `requeued-${tr.id}`, at: tr.requeued_at, text: t("requeued") });
    }
    if (daeeName && conversation.ended_at) lines.push({ id: "ended", at: conversation.ended_at, text: t("endedBy", { name: isolate(daeeName) }) });
    return lines;
  }, [conversation.assigned_at, conversation.ended_at, daeeName, accepted, transfers, t]);

  const assignedNotStarted = Boolean(conversation.daee_id) && conversation.status === "waiting";

  return (
    <Surface kind="asker" className="flex h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo size={26} />
          <div className="flex min-w-0 flex-col">
            <motion.p key={daeeName ?? "waiting"} variants={fadeUp} initial="hidden" animate="visible" className="truncate font-semibold">
              {daeeName ? t("with", { name: isolate(daeeName) }) : t("waitingTitle")}
            </motion.p>
            <p className="text-sm text-muted-foreground">
              {waiting && (
                <>
                  {t("waitingLabel")} <Elapsed since={conversation.created_at} />
                </>
              )}
              {assignedNotStarted && daeeName && t("replySoon", { name: isolate(daeeName) })}
            </p>
          </div>
          {messages.length > 0 && (
            <Link
              href={`/card/${conversation.id}`}
              className={cn(
                "ms-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                cardApproved ? "border-brand-teal/60 text-teal-fg" : "text-muted-foreground",
              )}
            >
              {cardApproved ? <Check className="size-4" aria-hidden /> : <IdCard className="size-4" aria-hidden />}
              {cardApproved ? t("cardApproved") : t("cardButton")}
            </Link>
          )}
        </div>
      </header>

      <MessageList
        messages={messages}
        me={me}
        system={system}
        onRetry={retry}
        footer={waiting ? <WaitingState position={position} conversationId={conversation.id} /> : null}
      />

      <footer className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-2 pb-4 sm:px-6">
        {aiEnabled && conversation.classified_by === "ai" && conversation.topic && conversation.status === "waiting" && (
          <ClassificationConfirm conversationId={conversation.id} topic={conversation.topic} language={language} />
        )}
        {conversation.status === "waiting" && conversation.match_quality && conversation.match_reasons ? (
          <MatchLine quality={conversation.match_quality as "full" | "partial" | "none"} reasons={conversation.match_reasons as MatchReasons} />
        ) : null}
        {pendingTransfer && !ended && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-3 rounded-2xl border border-brand-teal/40 bg-teal-bg p-4"
          >
            <div className="flex flex-col gap-1">
              <p className="font-medium">{t("transferAsk", { from: isolate(daeeName ?? ""), to: isolate(pendingTransfer.to_name ?? "") })}</p>
              <p id="transfer-reason" className="text-sm text-muted-foreground">
                {targetGone
                  ? t("transferUnavailable", { to: isolate(pendingTransfer.to_name ?? "") })
                  : t("transferAskHint", { to: isolate(pendingTransfer.to_name ?? "") })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {targetGone ? (
                <Button
                  size="lg"
                  disabled={moving}
                  onClick={() =>
                    startMoving(async () => {
                      await requeueTransfer(conversation.id);
                      await refreshTransfers();
                    })
                  }
                >
                  {t("requeue")}
                </Button>
              ) : (
                <Link href={`/card/${conversation.id}`} className={buttonVariants({ size: "lg" })}>
                  {t("transferCreateCard")}
                </Link>
              )}
              <Button
                variant="outline"
                size="lg"
                disabled={moving || targetGone}
                aria-describedby={targetGone ? "transfer-reason" : undefined}
                onClick={() =>
                  startMoving(async () => {
                    const r = await transferNow(conversation.id);
                    if (!r.ok) setTargetAvailable(false);
                    await refreshTransfers();
                  })
                }
              >
                {t("transferNow")}
              </Button>
            </div>
          </motion.div>
        )}
        {ended ? (
          <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <p className="text-lg font-semibold">{t("endedTitle")}</p>
            <p className="text-muted-foreground">{t("endedBody")}</p>
            <div className="flex flex-wrap gap-2">
              {!cardApproved && (
                <Link href={`/card/${conversation.id}`} className={buttonVariants({ size: "lg" })}>
                  {t("createCard")}
                </Link>
              )}
              <SignOutButton label={t("comeBack")} to="/" />
            </div>
            <NewReturnCode />
          </motion.div>
        ) : (
          <Composer onSend={send} placeholder={t("placeholder")} sendLabel={t("send")} maxLength={MESSAGE_MAX} autoFocus />
        )}
      </footer>
    </Surface>
  );
}

function WaitingState({ position, conversationId }: { position: number | null; conversationId: string }) {
  const t = useTranslations("Chat");
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <motion.div
        key={position ?? "unknown"}
        variants={pulse}
        initial="idle"
        animate="pulse"
        className="grid size-20 place-items-center rounded-full border-2 border-brand-teal"
      >
        <span dir="ltr" className="text-3xl font-semibold tabular-nums">
          {position ?? "–"}
        </span>
      </motion.div>
      {position !== null && <p className="font-medium">{t("position", { position })}</p>}
      <p className="max-w-sm text-sm text-muted-foreground">{t("keepWriting")}</p>
      <Readings conversationId={conversationId} className="mt-4 w-full max-w-xl text-start" />
    </div>
  );
}
