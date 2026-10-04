"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Composer } from "@/components/chat/composer";
import { Elapsed } from "@/components/chat/elapsed";
import { MessageList, type SystemLine } from "@/components/chat/message-list";
import { useMessages } from "@/components/chat/use-messages";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { Surface } from "@/components/surface";
import { MESSAGE_MAX, type ConversationStatus, type MessageRow } from "@/lib/chat/types";
import { createClient, subscribeWhenReady } from "@/lib/db/client";
import { fadeUp, pulse } from "@/lib/motion";

type Conversation = {
  id: string;
  daee_id: string | null;
  status: ConversationStatus;
  created_at: string;
  assigned_at: string | null;
};

type AskerChatProps = {
  me: string;
  initialConversation: Conversation;
  initialDaeeName: string | null;
  initialMessages: MessageRow[];
};

const QUEUE_POLL_MS = 15_000;

export function AskerChat({ me, initialConversation, initialDaeeName, initialMessages }: AskerChatProps) {
  const t = useTranslations("Chat");
  const [conversation, setConversation] = useState(initialConversation);
  const [daeeName, setDaeeName] = useState(initialDaeeName);
  const [position, setPosition] = useState<number | null>(null);
  const { messages, send, retry } = useMessages(conversation.id, initialMessages, me, "asker");

  const waiting = conversation.status === "waiting" && !conversation.daee_id;
  const ended = conversation.status === "ended";

  // Assignment, start and end arrive as updates to this conversation row.
  useEffect(
    () =>
      subscribeWhenReady((client) =>
        client
          .channel(`conversation:${conversation.id}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversation.id}` },
            (payload) => setConversation((prev) => ({ ...prev, ...(payload.new as Partial<Conversation>) })),
          )
          .subscribe(),
      ),
    [conversation.id],
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

  const system = useMemo<SystemLine[]>(
    () =>
      conversation.assigned_at && daeeName
        ? [{ id: "joined", at: conversation.assigned_at, text: t("joined", { name: daeeName }) }]
        : [],
    [conversation.assigned_at, daeeName, t],
  );

  const assignedNotStarted = Boolean(conversation.daee_id) && conversation.status === "waiting";

  return (
    <Surface kind="asker" className="flex h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo size={26} />
          <div className="flex min-w-0 flex-col">
            <motion.p key={daeeName ?? "waiting"} variants={fadeUp} initial="hidden" animate="visible" className="truncate font-semibold">
              {daeeName ? t("with", { name: daeeName }) : t("waitingTitle")}
            </motion.p>
            <p className="text-sm text-muted-foreground">
              {waiting && (
                <>
                  {t("waitingLabel")} <Elapsed since={conversation.created_at} />
                </>
              )}
              {assignedNotStarted && daeeName && t("replySoon", { name: daeeName })}
            </p>
          </div>
        </div>
      </header>

      <MessageList
        messages={messages}
        me={me}
        system={system}
        onRetry={retry}
        footer={waiting ? <WaitingState position={position} /> : null}
      />

      <footer className="mx-auto w-full max-w-2xl px-4 pt-2 pb-4 sm:px-6">
        {ended ? (
          <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <p className="text-lg font-semibold">{t("endedTitle")}</p>
            <p className="text-muted-foreground">{t("endedBody")}</p>
            <div>
              <SignOutButton label={t("comeBack")} to="/" />
            </div>
          </motion.div>
        ) : (
          <Composer onSend={send} placeholder={t("placeholder")} sendLabel={t("send")} maxLength={MESSAGE_MAX} autoFocus />
        )}
      </footer>
    </Surface>
  );
}

function WaitingState({ position }: { position: number | null }) {
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
    </div>
  );
}
