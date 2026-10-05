"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAsker } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";
import { isMajorEdit } from "./edits";
import { CARD_FIELD_MAX, CARD_FIELDS, DURATIONS, UNDEFINED_FIELD, VISIBILITIES } from "./types";

const Field = z.string().trim().max(CARD_FIELD_MAX);
const Ids = z.array(z.uuid());

const MasterInput = z.object({
  sourceCardIds: z.array(z.uuid()).min(1).max(50),
  fields: z.object({ follow_up: Field, covered: Field, remaining: Field, next_step: Field }),
  visibility: z.enum(VISIBILITIES),
  days: z.union([z.literal(DURATIONS[0]), z.literal(7), z.literal(14), z.literal(30)]),
  approve: z.boolean(),
  ai: z
    .object({
      draft: z.object({ follow_up: z.string(), covered: z.string(), remaining: z.string(), next_step: z.string() }),
      sources: z.object({ follow_up: Ids, covered: Ids, remaining: Ids, next_step: Ids }),
    })
    .nullable()
    .default(null),
});

/**
 * Saves the asker's master card as a new version (merged from approved session cards);
 * with `approve`, shares it under the chosen scope and expiry. Approved versions never
 * change; nothing is visible to any daee before approval.
 */
export async function submitMasterCard(input: z.input<typeof MasterInput>): Promise<{ ok: boolean; approved?: boolean }> {
  const asker = await getAsker();
  const parsed = MasterInput.safeParse(input);
  if (!asker || !parsed.success) return { ok: false };
  const { sourceCardIds, fields, visibility, days, approve, ai } = parsed.data;
  const supabase = await createClient();
  const service = createServiceClient();

  const [{ data: me }, { data: sessions }, { data: latest }, { data: lastConversation }] = await Promise.all([
    supabase.from("askers").select("org_id").eq("user_id", asker.user_id).single(),
    supabase.from("cards").select("id").eq("asker_id", asker.user_id).eq("scope", "session").eq("status", "approved").in("id", sourceCardIds),
    supabase.from("cards").select("version").eq("asker_id", asker.user_id).eq("scope", "master").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("conversations").select("daee_id").eq("asker_id", asker.user_id).not("daee_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!me || (sessions ?? []).length !== new Set(sourceCardIds).size) return { ok: false };

  const orUndefined = (value: string) => (value.trim() ? value.trim() : UNDEFINED_FIELD);
  const final = {
    follow_up: orUndefined(fields.follow_up),
    covered: orUndefined(fields.covered),
    remaining: orUndefined(fields.remaining),
    next_step: orUndefined(fields.next_step),
  };
  const allowed = new Set(sourceCardIds);
  const fieldSources = ai
    ? Object.fromEntries(CARD_FIELDS.map((f) => [f, final[f] === UNDEFINED_FIELD ? [] : ai.sources[f].filter((id) => allowed.has(id))]))
    : {};
  const editedMajor = ai ? isMajorEdit(ai.draft, final) : false;
  const origin = ai ? "ai" : "manual";
  const version = (latest?.version ?? 0) + 1;
  const preferred = lastConversation?.daee_id ?? null;

  const { data: card, error } = await supabase
    .from("cards")
    .insert({
      scope: "master",
      conversation_id: null,
      asker_id: asker.user_id,
      version,
      generated_by: origin,
      origin,
      ...final,
      source_card_ids: sourceCardIds,
      field_sources: fieldSources,
      ai_draft: ai ? ai.draft : null,
      edited_major: editedMajor,
      preferred_daee: preferred,
      visibility,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !card) {
    logServerError("submitMasterCard.insert", error);
    return { ok: false };
  }
  // The AI draft logged master_card_generated when it was generated.
  if (!ai && version === 1) {
    await service.from("events").insert({ org_id: me.org_id, type: "master_card_generated", actor_role: "asker", meta: { origin } });
  }
  if (!approve) return { ok: true, approved: false };

  const approvedAt = new Date();
  const expiresAt = days === "forever" ? null : new Date(approvedAt.getTime() + days * 24 * 3600 * 1000).toISOString();
  const { error: approveError } = await supabase
    .from("cards")
    .update({ status: "approved", approved_at: approvedAt.toISOString(), expires_at: expiresAt })
    .eq("id", card.id);
  if (approveError) {
    logServerError("submitMasterCard.approve", approveError);
    return { ok: false };
  }
  if (visibility === "this_daee" && preferred) {
    await supabase.from("card_access").upsert({ card_id: card.id, viewer_id: preferred, until: expiresAt ?? "infinity" });
  }
  await service.from("events").insert({
    org_id: me.org_id,
    type: "master_card_approved",
    actor_role: "asker",
    meta: { origin, edited_major: editedMajor },
  });
  revalidatePath("/[locale]/card/master", "page");
  return { ok: true, approved: true };
}

/** The asker deletes the master card (every version); daee access ends with the rows. */
export async function deleteMasterCard(): Promise<{ ok: boolean }> {
  const asker = await getAsker();
  if (!asker) return { ok: false };
  const { error } = await (await createClient()).rpc("delete_master_card");
  if (error) {
    logServerError("deleteMasterCard", error);
    return { ok: false };
  }
  return { ok: true };
}
