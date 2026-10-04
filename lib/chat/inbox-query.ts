import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { ORG_TIME_ZONE, SUMMARY_COLUMNS, type ConversationSummary, type LastMessage } from "./types";

/** Start of today in the organization's time zone, as an ISO instant. */
export function startOfOrgDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Offset of the zone right now, then midnight local expressed in UTC.
  const zoned = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = zoned - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offset).toISOString();
}

const PREVIEW_LIMIT = 500;

/**
 * The daee's inbox: waiting and active conversations, those ended today, and the one being
 * viewed. RLS limits every row to conversations assigned to the caller. Works with both
 * the server and the browser client, so live reloads match the first render exactly.
 */
export async function fetchInbox(
  supabase: SupabaseClient<Database>,
  selectedId: string | null,
): Promise<ConversationSummary[] | null> {
  const filters = ["status.in.(waiting,active)", `and(status.eq.ended,ended_at.gte.${startOfOrgDay()})`];
  if (selectedId) filters.push(`id.eq.${selectedId}`);
  const { data, error } = await supabase
    .from("conversations")
    .select(SUMMARY_COLUMNS)
    .or(filters.join(","))
    .order("created_at");
  if (error || !data) return null;

  const conversations = data as unknown as ConversationSummary[];
  if (conversations.length === 0) return conversations;

  // Newest message per conversation, for the one-line preview and the unread dot.
  const { data: recent } = await supabase
    .from("messages")
    .select("conversation_id, body, sender_role, created_at")
    .in(
      "conversation_id",
      conversations.map((c) => c.id),
    )
    .order("created_at", { ascending: false })
    .limit(PREVIEW_LIMIT);
  const last = new Map<string, LastMessage>();
  for (const m of recent ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);
  return conversations.map((c) => ({ ...c, last_message: last.get(c.id) ?? null }));
}

/** Waiting for the daee: open, and the asker spoke last. The rail badge counts exactly these. */
export function isUnread(c: ConversationSummary): boolean {
  return c.status !== "ended" && c.last_message?.sender_role === "asker";
}
