"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Surface } from "@/components/surface";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "@/i18n/navigation";
import { getDir, type Locale } from "@/i18n/routing";
import { fetchInbox, isUnread } from "@/lib/chat/inbox-query";
import type { ConversationSummary, MessageRow, Presence } from "@/lib/chat/types";
import { createClient, subscribeResilient } from "@/lib/db/client";
import type { VisibleCard } from "@/lib/db/queries/conversations";
import { endConversation, markConversationRead, setPresence } from "@/lib/inbox/actions";
import { isolate } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import type { AssistRequest } from "./assistant";
import { ContextPanel } from "./context-panel";
import { ConversationList, segmentOf, type Segment } from "./conversation-list";
import { ConversationPane } from "./conversation-pane";
import { PRESENCE } from "./presence-toggle";
import { usePresenceHeartbeat } from "./use-heartbeat";
import { Rail } from "./rail";
import { useMediaQuery } from "./use-media-query";
import { useStoredFlag } from "./use-stored-flag";

type InboxProps = {
  me: { id: string; name: string };
  initialPresence: Presence;
  conversations: ConversationSummary[];
  selected: ConversationSummary | null;
  messages: MessageRow[];
  pastCount: number | null;
  cards: VisibleCard[];
  transferPending: boolean;
  aiEnabled: boolean;
};

const CONTEXT_KEY = "wasl.inbox.context";
// First-strong isolates keep a Latin name and "(EN)" from scrambling inside Arabic text.

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function initialSegment(list: ConversationSummary[], selected: ConversationSummary | null): Segment {
  if (selected) return segmentOf(selected);
  if (list.some((c) => segmentOf(c) === "waiting")) return "waiting";
  if (list.some((c) => segmentOf(c) === "active")) return "active";
  return "waiting";
}

export function Inbox({
  me,
  initialPresence,
  conversations: initial,
  selected,
  messages,
  pastCount,
  cards,
  transferPending: initialTransferPending,
  aiEnabled,
}: InboxProps) {
  const tToast = useTranslations("Toasts");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [conversations, setConversations] = useState(initial);
  const [presence, setPresenceState] = useState(initialPresence);
  usePresenceHeartbeat(setPresenceState);
  const [segment, setSegment] = useState<Segment>(() => initialSegment(initial, selected));
  const [query, setQuery] = useState("");
  // Wide screens: the panel sits beside the conversation and its state is remembered.
  // Narrow screens: it opens over the conversation, so it starts closed each time.
  const wide = useMediaQuery("(min-width: 1280px)");
  const [storedContext, setStoredContext] = useStoredFlag(CONTEXT_KEY, true);
  const [overlayContext, setOverlayContext] = useState(false);
  const contextOpen = wide ? storedContext : overlayContext;
  const [contextTab, setContextTab] = useState<"details" | "assistant">("details");
  const [assistRequest, setAssistRequest] = useState<AssistRequest>(null);
  const [insertRequest, setInsertRequest] = useState<{ text: string; nonce: number } | null>(null);
  // A sparkle opens the panel on the assistant tab and runs the search there.
  const assist = useCallback(
    (messageIds: string[]) => {
      if (wide) setStoredContext(true);
      else setOverlayContext(true);
      setContextTab("assistant");
      setAssistRequest({ messageIds, nonce: Date.now() });
    },
    [wide, setStoredContext],
  );
  const [endRequest, setEndRequest] = useState(0);
  const [transferPending, setTransferPending] = useState(initialTransferPending);
  const [seenPending, setSeenPending] = useState(initialTransferPending);
  if (initialTransferPending !== seenPending) {
    setSeenPending(initialTransferPending);
    setTransferPending(initialTransferPending);
  }
  const [focusRequest, setFocusRequest] = useState(0);


  // Server data wins whenever the page re-renders (navigation, refresh).
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setConversations(initial);
  }
  // The list follows the open conversation: opening it, or its status changing (e.g. ended),
  // shows the segment it now belongs to.
  const selectedId = selected?.id ?? null;
  const selectedSegment = (() => {
    const c = conversations.find((x) => x.id === selectedId) ?? selected;
    return c ? segmentOf(c) : null;
  })();
  const [seenSelected, setSeenSelected] = useState(`${selectedId}:${selectedSegment}`);
  if (`${selectedId}:${selectedSegment}` !== seenSelected) {
    setSeenSelected(`${selectedId}:${selectedSegment}`);
    if (selectedSegment) setSegment(selectedSegment);
  }

  const toggleContext = useCallback(
    () => (wide ? setStoredContext(!storedContext) : setOverlayContext((open) => !open)),
    [wide, storedContext, setStoredContext],
  );

  const current = conversations.find((c) => c.id === selectedId) ?? selected;
  const unread = useMemo(() => conversations.filter(isUnread).length, [conversations]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const activity = (c: ConversationSummary) => c.last_message?.created_at ?? c.ended_at ?? c.created_at;
    return conversations
      .filter((c) => segmentOf(c) === segment)
      .filter(
        (c) =>
          !q ||
          c.asker?.pseudonym.toLocaleLowerCase().includes(q) ||
          c.last_message?.body.toLocaleLowerCase().includes(q),
      )
      // Waiting: longest wait first. Others: most recent activity first.
      .sort((a, b) =>
        segment === "waiting" ? a.created_at.localeCompare(b.created_at) : activity(b).localeCompare(activity(a)),
      );
  }, [conversations, segment, query]);

  const open = useCallback(
    (id: string) => startTransition(() => router.push(`/daee/${id}`)),
    [router],
  );

  const reload = useCallback(async () => {
    const data = await fetchInbox(createClient(), selectedId);
    if (data) setConversations(data);
  }, [selectedId]);

  // Latest callbacks for the long-lived subscription, so it isn't torn down on every render.
  const handlers = useRef({ reload, open, tToast, router });
  useEffect(() => {
    handlers.current = { reload, open, tToast, router };
  });

  // Live list: conversation changes, new messages (preview, unread) and routed-to-you
  // notifications. RLS limits all three to this daee.
  useEffect(
    () =>
      subscribeResilient({
        name: `inbox:${me.id}`,
        configure: (channel) =>
          channel
            .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
              void handlers.current.reload();
            })
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
              void handlers.current.reload();
            })
            // An asker approved (or a new version of) a card this daee may see.
            .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, () => {
              handlers.current.router.refresh();
            })
            .on(
              "postgres_changes",
              { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${me.id}` },
              (payload) => {
                const note = payload.new as {
                  type: string;
                  payload: { conversation_id: string; pseudonym: string; language: string };
                };
                const p = note.payload;
                const { reload, open, tToast } = handlers.current;
                void reload();
                const key = note.type === "conversation_transferred" ? "transferred" : "routed";
                toast(tToast(key, { pseudonym: isolate(p.pseudonym), language: isolate(p.language.toUpperCase()) }), {
                  action: { label: tToast("open"), onClick: () => open(p.conversation_id) },
                });
              },
            ),
        onResync: () => handlers.current.reload(),
      }),
    [me.id],
  );

  useEffect(() => {
    if (selectedId) void markConversationRead(selectedId);
  }, [selectedId]);

  const changePresence = useCallback(
    async (next: Presence) => {
      const previous = presence;
      setPresenceState(next);
      const { ok } = await setPresence(next);
      if (!ok) setPresenceState(previous);
      else if (next === "available") void reload();
    },
    [presence, reload],
  );

  const transferred = useCallback(
    (status: "completed" | "pending") => {
      if (status === "pending") return setTransferPending(true);
      // The conversation now belongs to a colleague (and RLS hides it from this daee).
      startTransition(() => router.push("/daee"));
    },
    [router],
  );

  const rated = useCallback(
    (sufficient: boolean | null) =>
      setConversations((list) => list.map((c) => (c.id === selectedId ? { ...c, followup_sufficient: sufficient } : c))),
    [selectedId],
  );

  const end = useCallback(async () => {
    if (!selectedId) return false;
    const { ok } = await endConversation(selectedId);
    if (ok) {
      const endedAt = new Date().toISOString();
      setConversations((list) => list.map((c) => (c.id === selectedId ? { ...c, status: "ended", ended_at: endedAt } : c)));
      startTransition(() => router.refresh());
    }
    return ok;
  }, [selectedId, router]);

  // Keyboard: J/K or arrows move through the current list, / replies, Shift+E ends, 1/2/3 presence.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const index = visible.findIndex((c) => c.id === selectedId);
      if (event.key === "j" || event.key === "ArrowDown") {
        const next = visible[Math.min(index + 1, visible.length - 1)];
        if (next && next.id !== selectedId) open(next.id);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        const prev = visible[Math.max(index - 1, 0)];
        if (prev && prev.id !== selectedId) open(prev.id);
      } else if (event.key === "/" && selectedId) {
        setFocusRequest((n) => n + 1);
      } else if (event.key === "E" && event.shiftKey && selectedId) {
        setEndRequest((n) => n + 1);
      } else if (["1", "2", "3"].includes(event.key)) {
        void changePresence(PRESENCE[Number(event.key) - 1]);
      } else {
        return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, open, changePresence]);

  const rtl = getDir(locale) === "rtl";

  return (
    <Surface kind="workspace" className="h-dvh overflow-hidden">
      {/* The toaster stays outside the grid: as a fourth child it would add a row and steal height. */}
      <div className="grid h-full grid-cols-1 md:grid-cols-[56px_340px_minmax(0,1fr)]">
      <Rail name={me.name} presence={presence} onPresence={changePresence} unread={unread} />

      {/* min-w-0 + a minmax(0,1fr) column: long previews truncate instead of widening the column. */}
      <div className={cn("min-h-0 min-w-0 grid-cols-1", current ? "hidden md:grid" : "grid")}>
        <ConversationList
          me={me}
          presence={presence}
          onPresence={changePresence}
          conversations={conversations}
          visible={visible}
          segment={segment}
          onSegment={setSegment}
          query={query}
          onQuery={setQuery}
          selectedId={selectedId}
          onOpen={open}
        />
      </div>

      <main className={cn("relative min-h-0 min-w-0", current ? "flex" : "hidden md:flex")}>
        {current ? (
          <>
            <ConversationPane
              key={current.id}
              me={me}
              conversation={current}
              initialMessages={messages}
              onEnd={end}
              endRequest={endRequest}
              focusRequest={focusRequest}
              pending={isPending}
              contextOpen={contextOpen}
              onToggleContext={toggleContext}
              onBack={() => startTransition(() => router.push("/daee"))}
              transferPending={transferPending}
              onTransferred={transferred}
              onRated={rated}
              onAssist={assist}
              insertRequest={insertRequest}
              resumeFrom={(() => {
                const source = cards.find((k) => k.scope === "master") ?? cards.find((k) => k.id === current.card_id);
                if (!source) return null;
                return [source.next_step, source.follow_up].find((v) => v && v !== "غير محدد") ?? null;
              })()}
            />
            {contextOpen && (
              <ContextPanel
                tab={contextTab}
                onTab={setContextTab}
                aiEnabled={aiEnabled}
                assistRequest={assistRequest}
                onInsert={(text) => setInsertRequest({ text, nonce: Date.now() })}
                conversation={current}
                pastCount={pastCount}
                cards={cards}
                onClose={toggleContext}
                // Beside the conversation on wide screens, over it on narrower ones.
                className="absolute inset-y-0 end-0 z-20 shadow-lg xl:static xl:z-auto xl:shadow-none"
              />
            )}
          </>
        ) : (
          <EmptyPane />
        )}
      </main>
      </div>

      <Toaster position={rtl ? "bottom-left" : "bottom-right"} dir={rtl ? "rtl" : "ltr"} duration={4000} />
    </Surface>
  );
}

function EmptyPane() {
  const t = useTranslations("Inbox");
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="flex max-w-xs flex-col items-center gap-2 text-center">
        <p className="font-medium">{t("selectTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("selectHint")}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("shortcuts")}</p>
      </div>
    </div>
  );
}
