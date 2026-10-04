import "server-only";
import { fetchInbox } from "@/lib/chat/inbox-query";
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
    .select("id, asker_id, daee_id, status, created_at, assigned_at, started_at, ended_at")
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
