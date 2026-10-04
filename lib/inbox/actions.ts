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

const RateInput = z.object({ conversationId: z.uuid(), sufficient: z.boolean() });

/** "Was the context enough to resume?" on a follow-up (rate_followup logs followup_rated). */
export async function rateFollowup(input: z.input<typeof RateInput>): Promise<{ ok: boolean }> {
  const parsed = RateInput.safeParse(input);
  if (!parsed.success || (await getStaff())?.role !== "daee") return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rate_followup", { conv: parsed.data.conversationId, sufficient: parsed.data.sufficient });
  if (error) {
    logServerError("rateFollowup", error, { conversationId: parsed.data.conversationId });
    return { ok: false };
  }
  return { ok: true };
}
