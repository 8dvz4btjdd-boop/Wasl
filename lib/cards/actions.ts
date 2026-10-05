"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAsker } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";
import { CARD_FIELD_MAX, DURATIONS, UNDEFINED_FIELD, VISIBILITIES } from "./types";

const Field = z.string().trim().max(CARD_FIELD_MAX);

const SubmitInput = z.object({
  conversationId: z.uuid(),
  sourceMessageIds: z.array(z.uuid()).min(1).max(200),
  fields: z.object({ follow_up: Field, covered: Field, remaining: Field, next_step: Field }),
  acceptSubstitute: z.boolean(),
  visibility: z.enum(VISIBILITIES),
  days: z.union([z.literal(DURATIONS[0]), z.literal(7), z.literal(14), z.literal(30)]),
  approve: z.boolean(),
});

export type SubmitCardResult = { ok: true; cardId: string; approved: boolean; transferred: boolean } | { ok: false };

/**
 * Saves the asker's card as a new version; with `approve`, shares it under the asker's
 * chosen scope and expiry. Nothing is visible to any daee before approval.
 */
export async function submitCard(input: z.input<typeof SubmitInput>): Promise<SubmitCardResult> {
  const asker = await getAsker();
  const parsed = SubmitInput.safeParse(input);
  if (!asker || !parsed.success) return { ok: false };
  const { conversationId, sourceMessageIds, fields, acceptSubstitute, visibility, days, approve } = parsed.data;

  const supabase = await createClient();
  const service = createServiceClient();

  // The conversation is the asker's (RLS), and every selected message belongs to it.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, org_id, daee_id")
    .eq("id", conversationId)
    .eq("asker_id", asker.user_id)
    .maybeSingle();
  if (!conversation) return { ok: false };
  const { count: owned } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .in("id", sourceMessageIds);
  if (owned !== new Set(sourceMessageIds).size) return { ok: false };

  const { data: latest } = await supabase
    .from("cards")
    .select("version")
    .eq("conversation_id", conversationId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (latest?.version ?? 0) + 1;
  const orUndefined = (value: string) => (value.trim() ? value.trim() : UNDEFINED_FIELD);

  const { data: card, error: insertError } = await supabase
    .from("cards")
    .insert({
      conversation_id: conversationId,
      asker_id: asker.user_id,
      version,
      generated_by: "manual",
      follow_up: orUndefined(fields.follow_up),
      covered: orUndefined(fields.covered),
      remaining: orUndefined(fields.remaining),
      next_step: orUndefined(fields.next_step),
      // "Same daee" is whoever the asker is talking to when they make the card.
      preferred_daee: conversation.daee_id,
      accept_substitute: acceptSubstitute,
      visibility,
      source_message_ids: sourceMessageIds,
      status: "draft",
    })
    .select("id")
    .single();
  if (insertError || !card) {
    logServerError("submitCard.insert", insertError, { conversationId });
    return { ok: false };
  }
  if (version === 1) {
    const { error } = await service.from("events").insert({
      org_id: conversation.org_id,
      type: "card_generated",
      conversation_id: conversationId,
      actor_role: "asker",
      meta: { origin: "manual" },
    });
    if (error) logServerError("submitCard.cardGenerated", error);
  }
  if (!approve) return { ok: true, cardId: card.id, approved: false, transferred: false };

  const approvedAt = new Date();
  const expiresAt = days === "forever" ? null : new Date(approvedAt.getTime() + days * 24 * 3600 * 1000).toISOString();
  const { error: approveError } = await supabase
    .from("cards")
    .update({ status: "approved", approved_at: approvedAt.toISOString(), expires_at: expiresAt })
    .eq("id", card.id);
  if (approveError) {
    logServerError("submitCard.approve", approveError, { cardId: card.id });
    return { ok: false };
  }
  if (visibility === "this_daee" && conversation.daee_id) {
    const { error } = await supabase
      .from("card_access")
      .upsert({ card_id: card.id, viewer_id: conversation.daee_id, until: expiresAt ?? "infinity" });
    if (error) logServerError("submitCard.access", error, { cardId: card.id });
  }
  const { error: eventError } = await service.from("events").insert({
    org_id: conversation.org_id,
    type: "card_approved",
    conversation_id: conversationId,
    actor_role: "asker",
    meta: { origin: "manual", edited_major: false },
  });
  if (eventError) logServerError("submitCard.cardApproved", eventError);

  // A daee asked for this card before handing the conversation over: complete that now.
  const transferred = await completePendingTransfer(conversationId);
  revalidatePath("/[locale]/chat/[id]", "page");
  return { ok: true, cardId: card.id, approved: true, transferred };
}

async function completePendingTransfer(conversationId: string) {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("transfers")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .maybeSingle();
  if (!pending) return false;
  const { data, error } = await supabase.rpc("complete_transfer", { t: pending.id });
  if (error) logServerError("completePendingTransfer", error, { conversationId });
  return data === true;
}

async function pendingTransferId(conversationId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transfers")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .maybeSingle();
  return data?.id ?? null;
}

/** Whether the colleague a card-first transfer is waiting on can still take it. */
export async function checkTransferTarget(conversationId: string): Promise<{ available: boolean }> {
  const asker = await getAsker();
  if (!asker || !z.uuid().safeParse(conversationId).success) return { available: true };
  const id = await pendingTransferId(conversationId);
  if (!id) return { available: true };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_target_available", { t: id });
  if (error) {
    logServerError("checkTransferTarget", error, { conversationId });
    return { available: true };
  }
  return { available: data === true };
}

/** The target left: drop the transfer and return the conversation to the queue. */
export async function requeueTransfer(conversationId: string): Promise<{ ok: boolean }> {
  const asker = await getAsker();
  if (!asker || !z.uuid().safeParse(conversationId).success) return { ok: false };
  const id = await pendingTransferId(conversationId);
  if (!id) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("requeue_transfer", { t: id });
  if (error) {
    logServerError("requeueTransfer", error, { conversationId });
    return { ok: false };
  }
  revalidatePath("/[locale]/chat/[id]", "page");
  return { ok: true };
}

/** The asker deletes the card (every version). Daee access ends with the rows. */
export async function deleteCard(conversationId: string): Promise<{ ok: boolean }> {
  const asker = await getAsker();
  if (!asker || !z.uuid().safeParse(conversationId).success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_card", { conv: conversationId });
  if (error) {
    logServerError("deleteCard", error, { conversationId });
    return { ok: false };
  }
  revalidatePath("/[locale]/chat/[id]", "page");
  revalidatePath("/[locale]/card/[id]", "page");
  return { ok: true };
}

/** The asker lets a pending transfer go ahead without a card. */
export async function transferNow(conversationId: string): Promise<{ ok: boolean }> {
  const asker = await getAsker();
  if (!asker || !z.uuid().safeParse(conversationId).success) return { ok: false };
  return { ok: await completePendingTransfer(conversationId) };
}
