"use client";

import { useCallback, useEffect, useState } from "react";
import { sendMessage } from "@/lib/chat/actions";
import { MESSAGE_COLUMNS, type ChatMessage, type MessageRow } from "@/lib/chat/types";
import { createClient, subscribeWhenReady } from "@/lib/db/client";

function upsert(list: ChatMessage[], row: MessageRow): ChatMessage[] {
  const index = list.findIndex((m) => m.id === row.id);
  if (index === -1) {
    return [...list, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  // Keep the optimistic position (no jump) but take the saved row.
  const next = list.slice();
  next[index] = { ...row, created_at: list[index].created_at };
  return next;
}

/** Messages for one conversation: initial server rows, live inserts, optimistic sends. */
export function useMessages(conversationId: string, initial: MessageRow[], me: string, myRole: "asker" | "daee") {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const merge = (rows: MessageRow[]) => setMessages((prev) => rows.reduce(upsert, prev));
    const catchUp = async () => {
      const { data } = await supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId)
        .order("created_at");
      if (data) merge(data);
    };

    const unsubscribe = subscribeWhenReady((client) =>
      client
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => merge([payload.new as MessageRow]),
        )
        .subscribe((status) => {
          // Catch anything sent between the server render and the (re)subscription.
          if (status === "SUBSCRIBED") void catchUp();
        }),
    );

    // Background tabs can lose the socket; catch up when the person comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [conversationId]);

  const deliver = useCallback(
    async (id: string, body: string) => {
      const result = await sendMessage({ conversationId, id, body });
      setMessages((prev) =>
        result.ok ? upsert(prev, result.message) : prev.map((m) => (m.id === id ? { ...m, state: "failed" } : m)),
      );
    },
    [conversationId],
  );

  const send = useCallback(
    (body: string) => {
      const id = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id,
          conversation_id: conversationId,
          sender_id: me,
          sender_role: myRole,
          body,
          created_at: new Date().toISOString(),
          state: "pending",
        },
      ]);
      void deliver(id, body);
    },
    [conversationId, deliver, me, myRole],
  );

  const retry = useCallback(
    (id: string) => {
      const message = messages.find((m) => m.id === id);
      if (!message) return;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, state: "pending" } : m)));
      void deliver(id, message.body);
    },
    [deliver, messages],
  );

  return { messages, send, retry };
}
