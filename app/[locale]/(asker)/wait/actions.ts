"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { requireAsker } from "@/lib/auth/dal";
import { type FormState, LocaleField } from "@/lib/auth/forms";
import { QUESTION_MAX, TOPICS } from "@/lib/chat/types";
import { getDefaultOrg } from "@/lib/db/queries/org";
import { getOpenConversationId } from "@/lib/db/queries/conversations";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";
import { runAI } from "@/lib/ai/runAI";
import { classifyTask } from "@/lib/ai/tasks/classify";

const Input = z.object({
  locale: LocaleField,
  question: z.string().trim().min(1).max(QUESTION_MAX),
  topic: z.enum(TOPICS).optional().or(z.literal("").transform(() => undefined)),
  // Returning askers with a card choose who continues with them.
  resume: z.enum(["same", "substitute"]).optional().or(z.literal("").transform(() => undefined)),
});

/**
 * The question becomes an intake, a waiting conversation and the first message, then
 * routing tries to find a free daee. Nobody free is not an error. The AI guide classifies
 * the question first (question text and locale only); on any fallback the asker's chip,
 * or "general", is used instead.
 */
export async function startConversation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "questionInvalid" };
  const { locale, question } = parsed.data;

  const asker = await requireAsker(locale);
  const existing = await getOpenConversationId(asker.user_id);
  if (existing) return redirect({ href: `/chat/${existing}`, locale });

  let org: Awaited<ReturnType<typeof getDefaultOrg>>;
  try {
    org = await getDefaultOrg();
  } catch (error) {
    logServerError("startConversation.getDefaultOrg", error);
    return { error: "generic" };
  }

  const supabase = await createClient();
  const [followup, classified] = await Promise.all([
    getFollowupLink(asker.user_id, parsed.data.resume),
    runAI(classifyTask, { question, locale }, { orgId: org.id, actorId: asker.user_id }),
  ]);
  // A chip the asker picked wins; the AI's reading is still logged next to it.
  const chip = parsed.data.topic;
  const source = chip || !classified.ok ? ("chip" as const) : ("ai" as const);
  const topic = chip ?? (classified.ok ? classified.data.topic : "general");
  const depth = classified.ok ? classified.data.depth : null;
  const confidence = classified.ok ? classified.data.confidence : null;
  const aiTopic = classified.ok ? classified.data.topic : null;

  const { data: intake, error: intakeError } = await supabase
    .from("intakes")
    .insert({
      asker_id: asker.user_id,
      raw_text: question,
      language: asker.language,
      topic,
      depth,
      generated_by: source === "ai" ? "ai" : "manual",
      status: "routed",
    })
    .select("id")
    .single();
  if (intakeError) {
    logServerError("startConversation.insertIntake", intakeError);
    return { error: "generic" };
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      org_id: org.id,
      asker_id: asker.user_id,
      intake_id: intake.id,
      topic,
      depth,
      classified_by: source,
      status: "waiting",
      previous_conversation_id: followup?.previousId ?? null,
      card_id: followup?.cardId ?? null,
      followup_mode: followup?.mode ?? null,
      preferred_daee_id: followup?.preferredDaeeId ?? null,
    })
    .select("id")
    .single();
  if (convError) {
    logServerError("startConversation.insertConversation", convError);
    return { error: "generic" };
  }

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: asker.user_id,
    sender_role: "asker",
    body: question,
  });
  if (messageError) logServerError("startConversation.insertMessage", messageError);

  // Events are admin-only in RLS; written with the service client.
  const { error: eventError } = await createServiceClient().from("events").insert({
    org_id: org.id,
    type: "intake_created",
    conversation_id: conversation.id,
    actor_role: "asker",
    meta: { topic, language: asker.language, generated_by: source === "ai" ? "ai" : "manual" },
  });
  if (eventError) logServerError("startConversation.logIntakeCreated", eventError);
  const { error: classifiedError } = await createServiceClient().from("events").insert({
    org_id: org.id,
    type: "classified",
    conversation_id: conversation.id,
    actor_role: "system",
    meta: { topic, confidence, source, ai_topic: aiTopic },
  });
  if (classifiedError) logServerError("startConversation.logClassified", classifiedError);
  if (followup) {
    const { error } = await createServiceClient().from("events").insert({
      org_id: org.id,
      type: "followup_started",
      conversation_id: conversation.id,
      actor_role: "asker",
      meta: { mode: followup.mode },
    });
    if (error) logServerError("startConversation.logFollowupStarted", error);
  }

  // Logs `routed` itself when it assigns someone.
  const { error: routeError } = await supabase.rpc("route_conversation", { conv: conversation.id, p_topic: topic, ...(depth ? { p_depth: depth } : {}) });
  if (routeError) logServerError("startConversation.route", routeError, { conversationId: conversation.id });

  return redirect({ href: `/chat/${conversation.id}`, locale });
}

/**
 * A returning asker's new conversation follows their latest ended one. With an approved,
 * unexpired card it's a "manual" follow-up linked to that card (held for the card's
 * preferred daee when the asker asks for them, or when the card allows no substitute);
 * without one it's a follow-up with mode "none".
 */
async function getFollowupLink(askerId: string, resume: "same" | "substitute" | undefined) {
  const supabase = await createClient();
  const { data: previous } = await supabase
    .from("conversations")
    .select("id")
    .eq("asker_id", askerId)
    .eq("status", "ended")
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!previous) return null;

  const { data: card } = await supabase
    .from("cards")
    .select("id, preferred_daee, accept_substitute, origin")
    .eq("asker_id", askerId)
    .eq("status", "approved")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("scope", { ascending: true })
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!card) return { previousId: previous.id, cardId: null, mode: "none" as const, preferredDaeeId: null };

  const holdForPreferred = resume === "same" || !card.accept_substitute;
  return {
    previousId: previous.id,
    cardId: card.id,
    // The follow-up's mode is how its card was written: by the asker or drafted by the AI.
    mode: card.origin === "ai" ? ("ai" as const) : ("manual" as const),
    preferredDaeeId: holdForPreferred ? card.preferred_daee : null,
  };
}

/** The asker corrects the AI's topic: stored, logged (classification_corrected) and re-routed. */
export async function correctTopic(conversationId: string, topic: string): Promise<{ ok: boolean }> {
  const ok = z.uuid().safeParse(conversationId).success && (TOPICS as readonly string[]).includes(topic);
  if (!ok) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_topic", { conv: conversationId, p_topic: topic });
  if (error) {
    logServerError("correctTopic", error, { conversationId });
    return { ok: false };
  }
  return { ok: true };
}
