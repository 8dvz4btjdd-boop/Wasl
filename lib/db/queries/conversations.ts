import "server-only";
import { fetchInbox } from "@/lib/chat/inbox-query";
import { CARD_COLUMNS, type Card } from "@/lib/cards/types";
import { MESSAGE_COLUMNS, type ConversationSummary, type MessageRow } from "@/lib/chat/types";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";

// Reads run as the signed-in user, so RLS decides what each person can see.

/** The asker's waiting or active conversation, if any. */
export async function getOpenConversationId(askerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("asker_id", askerId)
    .in("status", ["waiting", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) logServerError("getOpenConversationId", error);
  return data?.id ?? null;
}

export async function getConversation(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, asker_id, daee_id, status, created_at, assigned_at, started_at, ended_at, topic, depth, classified_by, match_quality, match_reasons")
    .eq("id", id)
    .maybeSingle();
  if (error) logServerError("getConversation", error, { id });
  return data;
}

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at");
  if (error) logServerError("getMessages", error, { conversationId });
  return data ?? [];
}

export async function getDaeeName(daeeId: string | null) {
  if (!daeeId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("display_name").eq("user_id", daeeId).maybeSingle();
  return data?.display_name ?? null;
}

/** The daee's inbox (see fetchInbox). */
export async function getInbox(selectedId: string | null): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const inbox = await fetchInbox(supabase, selectedId);
  if (!inbox) logServerError("getInbox", "inbox query failed");
  return inbox ?? [];
}

/**
 * How many other conversations this asker has had. Counted with the service client because
 * the daee can only see conversations assigned to them; no content is read.
 */
export async function getPastConversationCount(askerId: string, excludeId: string) {
  const { count, error } = await createServiceClient()
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("asker_id", askerId)
    .neq("id", excludeId);
  if (error) logServerError("getPastConversationCount", error);
  return count ?? 0;
}

export type VisibleCard = Card & { preferred_name: string | null; from_previous: boolean };

/**
 * Approved cards this daee may see for an asker: their master card (newest approved
 * version) and the session cards (newest approved version per conversation), newest first.
 * RLS (can_view_card) decides; no access means no rows.
 */
export async function getVisibleCards(conversationId: string, askerId: string): Promise<VisibleCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("asker_id", askerId)
    .eq("status", "approved")
    .order("version", { ascending: false });
  if (error) logServerError("getVisibleCards", error, { conversationId });
  const cards = (data ?? []) as Card[];
  const preferred = [...new Set(cards.map((c) => c.preferred_daee).filter(Boolean))] as string[];
  const { data: names } = preferred.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", preferred)
    : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.user_id, n.display_name]));
  // The newest version counts: one master, one per conversation.
  const latest = new Map<string, Card>();
  for (const c of cards) {
    const key = c.scope === "master" ? "master" : (c.conversation_id ?? c.id);
    if (!latest.has(key)) latest.set(key, c);
  }
  return [...latest.values()]
    .sort((a, b) => (a.scope === b.scope ? Date.parse(b.approved_at ?? "") - Date.parse(a.approved_at ?? "") : a.scope === "master" ? -1 : 1))
    .map((c) => ({
      ...c,
      preferred_name: c.preferred_daee ? (nameOf.get(c.preferred_daee) ?? null) : null,
      from_previous: c.scope === "session" && c.conversation_id !== conversationId,
    }));
}

/** A card-first transfer this daee started and the asker hasn't answered yet. */
export async function getPendingTransfer(conversationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transfers")
    .select("id, to_daee")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .maybeSingle();
  return data;
}
