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
