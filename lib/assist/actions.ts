"use server";

import { z } from "zod";
import { runAI } from "@/lib/ai/runAI";
import { assistToneTask, type ToneOutput } from "@/lib/ai/tasks/assist";
import { getStaff } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { getReadings, type Reading } from "@/lib/sources/readings";

const RECENT = 6;
const Id = z.uuid();

type ContextMessage = { id: string; sender_role: string; body: string; created_at: string };

/**
 * The assigned daee's view of a conversation for the assistant: only the assigned daee, and
 * after a transfer the receiver's context starts at the transfer time.
 */
async function assistContext(conversationId: string) {
  const staff = await getStaff();
  if (staff?.role !== "daee" || !Id.safeParse(conversationId).success) return null;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("conversations")
    .select("id, org_id, daee_id, topic, level, depth, asker:askers(language)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!c || c.daee_id !== staff.user_id) return null;
  const { data: transfer } = await supabase
    .from("transfers")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("to_daee", staff.user_id)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let query = supabase.from("messages").select("id, sender_role, body, created_at").eq("conversation_id", conversationId).order("created_at");
  if (transfer) query = query.gte("created_at", transfer.created_at);
  const { data: messages } = await query;
  return { staff, c, since: transfer?.created_at ?? null, messages: (messages ?? []) as ContextMessage[] };
}

/** What the asker was shown while waiting (readings recorded for this conversation). */
export async function getAskerReadings(conversationId: string): Promise<Reading[] | null> {
  const ctx = await assistContext(conversationId);
  if (!ctx) return null;
  const { data } = await createServiceClient()
    .from("conversation_readings")
    .select("items, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.items as Reading[] | undefined) ?? [];
}

const SearchInput = z.object({
  conversationId: z.uuid(),
  messageIds: z.array(z.uuid()).max(10).default([]),
  query: z.string().trim().max(500).default(""),
});

/**
 * Searches the approved sources for the daee: for one or several asker messages (with the
 * last six messages as context) or for what the daee typed. Citations only, never an answer;
 * the fence applies with audience daee (fiqh allowed and labeled, hadith only with a grading).
 */
export async function assistSearch(input: z.input<typeof SearchInput>): Promise<{ ok: boolean; items: Reading[] }> {
  const parsed = SearchInput.safeParse(input);
  if (!parsed.success) return { ok: false, items: [] };
  const ctx = await assistContext(parsed.data.conversationId);
  if (!ctx) return { ok: false, items: [] };
  const { messageIds, query } = parsed.data;
  // Only asker messages the daee can see in this context (after a transfer: since it).
  const selected = ctx.messages.filter((m) => m.sender_role === "asker" && messageIds.includes(m.id));
  const need = query || selected.map((m) => m.body).join("\n");
  if (!need.trim()) return { ok: false, items: [] };
  const lastSelected = selected.length ? ctx.messages.findIndex((m) => m.id === selected[selected.length - 1].id) : ctx.messages.length - 1;
  const recent = ctx.messages
    .slice(Math.max(0, lastSelected - RECENT + 1), lastSelected + 1)
    .map((m) => ({ role: m.sender_role === "asker" ? ("asker" as const) : ("daee" as const), text: m.body }));
  const result = await getReadings({
    orgId: ctx.c.org_id,
    actorId: ctx.staff.user_id,
    conversationId: ctx.c.id,
    need,
    recent,
    topic: ctx.c.topic ?? "general",
    level: "b",
    locale: (ctx.c.asker as { language: string } | null)?.language ?? "ar",
    audience: "daee",
  });
  return { ok: true, items: result.items };
}

/**
 * How the asker's last six messages read: one of a closed set of labels, describing the
 * messages, never the person. Computed on demand, returned once, never stored (not even in
 * ai_runs). Null when AI is off or nothing can be said.
 */
export async function assistTone(conversationId: string): Promise<ToneOutput["tone"] | null> {
  const ctx = await assistContext(conversationId);
  if (!ctx) return null;
  const asker = ctx.messages.filter((m) => m.sender_role === "asker").slice(-RECENT).map((m) => m.body);
  if (!asker.length) return "undefined";
  const result = await runAI(assistToneTask, { messages: asker }, { orgId: ctx.c.org_id, actorId: ctx.staff.user_id, conversationId: ctx.c.id });
  return result.ok ? result.data.tone : null;
}
