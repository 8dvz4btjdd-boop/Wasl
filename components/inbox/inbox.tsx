"use client";

import { Inbox as InboxIcon, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Elapsed } from "@/components/chat/elapsed";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "@/i18n/navigation";
import { getDir, type Locale } from "@/i18n/routing";
import { signOut } from "@/lib/auth/actions";
import { SUMMARY_COLUMNS, type ConversationSummary, type MessageRow, type Presence } from "@/lib/chat/types";
import { createClient, subscribeWhenReady } from "@/lib/db/client";
import { endConversation, markConversationRead, setPresence } from "@/lib/inbox/actions";
import { cn } from "@/lib/utils";
import { ConversationPane } from "./conversation-pane";
import { PRESENCE, PresenceDot, PresenceToggle } from "./presence-toggle";

type InboxProps = {
  me: { id: string; name: string };
  initialPresence: Presence;
  conversations: ConversationSummary[];
  selected: ConversationSummary | null;
  messages: MessageRow[];
  initialUnread: number;
};

const isolate = (text: string) => `\u2068${text}\u2069`;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function Inbox({ me, initialPresence, conversations: initial, selected, messages, initialUnread }: InboxProps) {
  const t = useTranslations("Inbox");
  const tToast = useTranslations("Toasts");
  const tTopic = useTranslations("Topics");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [conversations, setConversations] = useState(initial);
  const [presence, setPresenceState] = useState(initialPresence);
  const [unread, setUnread] = useState(initialUnread);
  const [endRequest, setEndRequest] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);

  // Server data wins whenever the page re-renders (navigation, refresh).
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setConversations(initial);
  }

  const selectedId = selected?.id ?? null;
  const current = conversations.find((c) => c.id === selectedId) ?? selected;
  const { waiting, active, ordered } = useMemo(() => {
    const waiting = conversations.filter((c) => c.status === "waiting");
    const active = conversations.filter((c) => c.status === "active");
    return { waiting, active, ordered: [...waiting, ...active] };
  }, [conversations]);

  const open = useCallback(
    (id: string) => startTransition(() => router.push(`/daee/${id}`)),
    [router],
  );

  const reload = useCallback(async () => {
    const filter = selectedId ? `status.in.(waiting,active),id.eq.${selectedId}` : "status.in.(waiting,active)";
    const { data } = await createClient().from("conversations").select(SUMMARY_COLUMNS).or(filter).order("created_at");
    if (data) setConversations(data as ConversationSummary[]);
  }, [selectedId]);

  // Live list and routed-to-you notifications. RLS limits both to this daee.
  useEffect(
    () =>
      subscribeWhenReady((client) =>
        client
          .channel(`inbox:${me.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => void reload())
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${me.id}` },
            (payload) => {
              const p = (payload.new as { payload: { conversation_id: string; pseudonym: string; language: string } })
                .payload;
              setUnread((n) => n + 1);
              void reload();
              // First-strong isolates keep a Latin name and "(EN)" from scrambling inside Arabic text.
              toast(tToast("routed", { pseudonym: isolate(p.pseudonym), language: isolate(p.language.toUpperCase()) }), {
                action: { label: tToast("open"), onClick: () => open(p.conversation_id) },
              });
            },
          )
          .subscribe(),
      ),
    [me.id, reload, open, tToast],
  );

  useEffect(() => {
    if (!selectedId) return;
    void markConversationRead(selectedId).then((count) => {
      if (count !== null) setUnread(count);
    });
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

  const end = useCallback(async () => {
    if (!selectedId) return false;
    const { ok } = await endConversation(selectedId);
    if (ok) {
      setConversations((list) => list.map((c) => (c.id === selectedId ? { ...c, status: "ended" } : c)));
      startTransition(() => router.refresh());
    }
    return ok;
  }, [selectedId, router]);

  // Keyboard: J/K or arrows move, / replies, Shift+E ends, 1/2/3 set presence.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const index = ordered.findIndex((c) => c.id === selectedId);
      if (event.key === "j" || event.key === "ArrowDown") {
        const next = ordered[Math.min(index + 1, ordered.length - 1)];
        if (next && next.id !== selectedId) open(next.id);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        const prev = ordered[Math.max(index - 1, 0)];
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
  }, [ordered, selectedId, open, changePresence]);

  const rtl = getDir(locale) === "rtl";

  return (
    <Surface kind="workspace" className="grid h-dvh grid-cols-[56px_320px_minmax(0,1fr)] overflow-hidden">
      <nav aria-label={t("title")} className="flex flex-col items-center gap-2 border-e bg-sidebar py-3">
        <Logo size={22} />
        <span
          aria-current="page"
          title={t("title")}
          className="relative mt-3 grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"
        >
          <InboxIcon className="size-4" aria-hidden />
          <span className="sr-only">{t("title")}</span>
          {unread > 0 && (
            <span
              aria-label={t("unread", { count: unread })}
              className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-violet px-1 text-[10px] font-semibold text-white tabular-nums"
            >
              {unread}
            </span>
          )}
        </span>
        <form action={signOut} className="mt-auto">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="to" value="/login" />
          <button
            type="submit"
            title={t("signOut")}
            aria-label={t("signOut")}
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
          </button>
        </form>
      </nav>

      <aside className="flex min-h-0 flex-col border-e">
        <header className="flex flex-col gap-3 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold">{t("title")}</h1>
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <PresenceDot value={presence} />
              {me.name}
            </span>
          </div>
          <PresenceToggle value={presence} onChange={changePresence} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {ordered.length === 0 ? (
            <div className="flex flex-col gap-1 px-4 py-10 text-center">
              <p className="text-sm font-medium">{t("empty")}</p>
              {presence !== "available" && <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>}
            </div>
          ) : (
            <>
              <ConversationGroup label={t("waiting")} items={waiting} selectedId={selectedId} onOpen={open} tTopic={tTopic} />
              <ConversationGroup label={t("active")} items={active} selectedId={selectedId} onOpen={open} tTopic={tTopic} />
            </>
          )}
        </div>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">{t("shortcuts")}</p>
      </aside>

      <main className="flex min-h-0 flex-col">
        {current ? (
          <ConversationPane
            key={current.id}
            me={me.id}
            conversation={current}
            initialMessages={messages}
            onEnd={end}
            endRequest={endRequest}
            focusRequest={focusRequest}
            pending={isPending}
          />
        ) : (
          <div className="grid flex-1 place-items-center">
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="font-medium">{t("selectTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("selectHint")}</p>
            </div>
          </div>
        )}
      </main>

      <Toaster position={rtl ? "bottom-left" : "bottom-right"} dir={rtl ? "rtl" : "ltr"} duration={4000} />
    </Surface>
  );
}

type GroupProps = {
  label: string;
  items: ConversationSummary[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  tTopic: ReturnType<typeof useTranslations<"Topics">>;
};

function ConversationGroup({ label, items, selectedId, onOpen, tTopic }: GroupProps) {
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="flex items-center justify-between px-4 pt-4 pb-1 text-xs font-medium text-muted-foreground">
        {label}
        <span className="tabular-nums">{items.length}</span>
      </h2>
      <ul>
        {items.map((c) => {
          const selected = c.id === selectedId;
          return (
            <li key={c.id}>
              <a
                href={`/${locale}/daee/${c.id}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onOpen(c.id);
                }}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex flex-col gap-0.5 border-s-2 px-4 py-2.5 transition-colors duration-150 focus-visible:bg-muted focus-visible:outline-none",
                  selected ? "border-s-teal-fg bg-muted" : "border-s-transparent hover:bg-muted/60",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.asker?.pseudonym}</span>
                  <span className="rounded border px-1 text-[10px] leading-4 text-muted-foreground uppercase">
                    {c.asker?.language}
                  </span>
                  <Elapsed
                    since={c.status === "active" && c.started_at ? c.started_at : c.created_at}
                    className="ms-auto text-xs text-muted-foreground"
                  />
                </span>
                {c.topic && <span className="truncate text-xs text-muted-foreground">{tTopic(c.topic as never)}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
