"use server";

import { z } from "zod";
import { getStaff } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";

const PresenceInput = z.enum(["available", "busy", "offline"]);

/** Becoming available pulls matching waiting conversations in (set_presence). */
export async function setPresence(status: z.input<typeof PresenceInput>): Promise<{ ok: boolean }> {
  const parsed = PresenceInput.safeParse(status);
  if (!parsed.success || (await getStaff())?.role !== "daee") return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_presence", { p_status: parsed.data });
  if (error) {
    logServerError("setPresence", error, { status: parsed.data });
    return { ok: false };
  }
  return { ok: true };
}

export async function endConversation(conversationId: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(conversationId).success || (await getStaff())?.role !== "daee") return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_conversation", { conv: conversationId });
  if (error) {
    logServerError("endConversation", error, { conversationId });
    return { ok: false };
  }
  return { ok: true };
}

/** Marks this conversation's notifications read and returns the remaining unread count. */
export async function markConversationRead(conversationId: string): Promise<number | null> {
  if (!z.uuid().safeParse(conversationId).success) return null;
  const staff = await getStaff();
  if (staff?.role !== "daee") return null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", staff.user_id)
    .eq("payload->>conversation_id", conversationId)
    .is("read_at", null);
  if (error) logServerError("markConversationRead", error, { conversationId });

  const { count, error: countError } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", staff.user_id)
    .is("read_at", null);
  if (countError) logServerError("markConversationRead.count", countError);
  return count ?? 0;
}

export type TransferCandidate = { user_id: string; display_name: string; open: number; capacity: number };

/** Available colleagues who speak the asker's language and have room (transfer_candidates). */
export async function getTransferCandidates(conversationId: string): Promise<TransferCandidate[] | null> {
  if (!z.uuid().safeParse(conversationId).success || (await getStaff())?.role !== "daee") return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_candidates", { conv: conversationId });
  if (error) {
    logServerError("getTransferCandidates", error, { conversationId });
    return null;
  }
  return data;
}

const TransferInput = z.object({ conversationId: z.uuid(), toDaee: z.uuid(), askCard: z.boolean() });

/** Hands the conversation over now, or asks the asker for a card first ("pending"). */
export async function transferConversation(
  input: z.input<typeof TransferInput>,
): Promise<{ ok: true; status: "completed" | "pending" } | { ok: false }> {
  const parsed = TransferInput.safeParse(input);
  if (!parsed.success || (await getStaff())?.role !== "daee") return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_conversation", {
    conv: parsed.data.conversationId,
    to_daee: parsed.data.toDaee,
    ask_card: parsed.data.askCard,
  });
  if (error) {
    logServerError("transferConversation", error, { conversationId: parsed.data.conversationId });
    return { ok: false };
  }
  return { ok: true, status: data === "pending" ? "pending" : "completed" };
}

const RateInput = z.object({ conversationId: z.uuid(), sufficient: z.boolean().nullable(), cardAccurate: z.boolean().nullable() });

/** The two end-of-follow-up questions (rate_followup logs followup_rated). Null = skipped. */
export async function rateFollowup(input: z.input<typeof RateInput>): Promise<{ ok: boolean }> {
  const parsed = RateInput.safeParse(input);
  if (!parsed.success || (await getStaff())?.role !== "daee") return { ok: false };
  const supabase = await createClient();
  // Postgres takes null for a skipped answer; the generated types don't mark these args nullable.
  const { error } = await supabase.rpc("rate_followup", {
    conv: parsed.data.conversationId,
    sufficient: parsed.data.sufficient as boolean,
    card_accurate: parsed.data.cardAccurate as boolean,
  });
  if (error) {
    logServerError("rateFollowup", error, { conversationId: parsed.data.conversationId });
    return { ok: false };
  }
  return { ok: true };
}

export type MyProfile = {
  name: string;
  email: string | null;
  languages: string[];
  topics: string[];
  capacity: number;
  status: "available" | "busy" | "offline";
  handledToday: number;
  medianFirstReplySeconds: number | null;
};

const RIYADH_OFFSET_MS = 3 * 3600 * 1000;

/** Start of today in the organization's time zone (Asia/Riyadh, UTC+3, no DST). */
function startOfToday(): Date {
  const local = new Date(Date.now() + RIYADH_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - RIYADH_OFFSET_MS);
}

/**
 * The daee's own profile (read-only; the admin edits it) and today's numbers: conversations
 * handled (where they sent a message today) and the median time from assignment to their
 * first message, over conversations assigned to them today. Read through RLS as themselves.
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const staff = await getStaff();
  if (staff?.role !== "daee") return null;
  const supabase = await createClient();
  const since = startOfToday().toISOString();
  const [{ data: user }, { data: profile }, { data: sent }, { data: assigned }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("display_name, languages, topics, capacity, status").eq("user_id", staff.user_id).single(),
    supabase.from("messages").select("conversation_id").eq("sender_id", staff.user_id).gte("created_at", since),
    supabase.from("conversations").select("id, assigned_at").eq("daee_id", staff.user_id).gte("assigned_at", since),
  ]);
  if (!profile) return null;

  const waits: number[] = [];
  if (assigned?.length) {
    const { data: firsts } = await supabase
      .from("messages")
      .select("conversation_id, created_at")
      .eq("sender_id", staff.user_id)
      .in("conversation_id", assigned.map((c) => c.id))
      .order("created_at");
    const first = new Map<string, string>();
    for (const m of firsts ?? []) if (!first.has(m.conversation_id)) first.set(m.conversation_id, m.created_at);
    for (const c of assigned) {
      const at = first.get(c.id);
      if (at && c.assigned_at) waits.push((Date.parse(at) - Date.parse(c.assigned_at)) / 1000);
    }
  }
  waits.sort((a, b) => a - b);
  const mid = Math.floor(waits.length / 2);
  const median = waits.length === 0 ? null : waits.length % 2 ? waits[mid] : (waits[mid - 1] + waits[mid]) / 2;

  return {
    name: profile.display_name,
    email: user.user?.email ?? null,
    languages: profile.languages,
    topics: profile.topics,
    capacity: profile.capacity,
    status: profile.status,
    handledToday: new Set((sent ?? []).map((m) => m.conversation_id)).size,
    medianFirstReplySeconds: median === null ? null : Math.max(0, Math.round(median)),
  };
}
