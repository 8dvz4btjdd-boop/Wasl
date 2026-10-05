"use server";

import { z } from "zod";
import { runAI } from "@/lib/ai/runAI";
import { classifyTask } from "@/lib/ai/tasks/classify";
import { intakeTask, MAX_GUIDE_QUESTIONS, type GuideTurn, type IntakeOutput } from "@/lib/ai/tasks/intake";
import { getAsker } from "@/lib/auth/dal";
import { TOPICS } from "@/lib/chat/types";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import type { Json } from "@/lib/db/types";
import { logServerError } from "@/lib/log";

const Turn = z.object({ role: z.enum(["asker", "guide"]), text: z.string().trim().min(1).max(2000) });
const StepInput = z.object({ conversationId: z.uuid(), turns: z.array(Turn).max(MAX_GUIDE_QUESTIONS * 2 + 4), locale: z.string() });

export type GuideSummary = NonNullable<IntakeOutput["summary"]>;
export type GuideStep =
  | { kind: "question"; question: string; refused: boolean }
  | { kind: "summary"; summary: GuideSummary; refused: boolean }
  | { kind: "stopped" }
  | { kind: "fallback" };

/** The asker's own conversation, while the guide may still run (waiting, nobody assigned). */
async function guideContext(conversationId: string) {
  const asker = await getAsker();
  if (!asker) return null;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("conversations")
    .select("id, org_id, status, daee_id, topic, depth, level, guide_summary, intake:intakes(raw_text)")
    .eq("id", conversationId)
    .eq("asker_id", asker.user_id)
    .maybeSingle();
  if (!c) return null;
  return { asker, c, firstMessage: (c.intake as { raw_text: string } | null)?.raw_text ?? "" };
}

async function logEvent(orgId: string, conversationId: string, type: string, meta: Json = {}) {
  const { error } = await createServiceClient().from("events").insert({ org_id: orgId, type, conversation_id: conversationId, actor_role: "asker", meta });
  if (error) logServerError(`guide.${type}`, error);
}

/**
 * One step of the guide: the next question, or the summary (classified on the summary's
 * question). Stops as soon as a daee is assigned. Any AI failure: fallback (the asker waits
 * as before, nothing is lost).
 */
export async function guideStep(input: z.input<typeof StepInput>): Promise<GuideStep> {
  const parsed = StepInput.safeParse(input);
  if (!parsed.success) return { kind: "fallback" };
  const ctx = await guideContext(parsed.data.conversationId);
  if (!ctx) return { kind: "fallback" };
  const { asker, c, firstMessage } = ctx;
  if (c.status !== "waiting" || c.daee_id) return { kind: "stopped" };
  const turns = parsed.data.turns as GuideTurn[];
  if (turns.length === 0) await logEvent(c.org_id, c.id, "guide_started");

  const result = await runAI(intakeTask, { firstMessage, turns, locale: parsed.data.locale }, { orgId: c.org_id, actorId: asker.user_id, conversationId: c.id });
  if (!result.ok) return { kind: "fallback" };
  const step = result.data;
  if (step.refusedReligiousQuestion) await logEvent(c.org_id, c.id, "guide_refused");

  if (!step.done && step.nextQuestion) {
    await logEvent(c.org_id, c.id, "guide_question", { n: turns.filter((t) => t.role === "guide").length + 1 });
    return { kind: "question", question: step.nextQuestion, refused: step.refusedReligiousQuestion };
  }
  const summary = step.summary!;
  // Classification runs on the summary's question, not the first message.
  const classified = await runAI(classifyTask, { question: summary.question, locale: parsed.data.locale }, { orgId: c.org_id, actorId: asker.user_id, conversationId: c.id });
  const topic = classified.ok ? classified.data.topic : summary.topic;
  return { kind: "summary", summary: { ...summary, topic }, refused: step.refusedReligiousQuestion };
}

const FinishInput = z.object({
  conversationId: z.uuid(),
  summary: z
    .object({
      question: z.string().trim().min(1).max(1000),
      topic: z.enum(TOPICS),
      depth: z.enum(["intro", "explain", "detailed"]),
      level: z.enum(["a", "b", "c", "d"]),
    })
    .nullable(),
  /** The topic the guide proposed, when the asker changed it in the confirmation card. */
  proposedTopic: z.enum(TOPICS).nullable(),
  questions: z.number().int().min(0).max(MAX_GUIDE_QUESTIONS),
  skipped: z.boolean(),
});

/**
 * The guide ends: confirmed (the summary becomes the conversation's question, topic, depth
 * and level, and routing runs again if nobody is assigned yet), skipped, or stopped because a
 * daee joined (an existing summary is still used).
 */
export async function guideFinish(input: z.input<typeof FinishInput>): Promise<{ ok: boolean }> {
  const parsed = FinishInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await guideContext(parsed.data.conversationId);
  if (!ctx) return { ok: false };
  const { c } = ctx;
  const { summary, proposedTopic, questions, skipped } = parsed.data;
  await logEvent(c.org_id, c.id, "guide_done", { questions, skipped });
  if (!summary) return { ok: true };

  const changed = proposedTopic !== null && proposedTopic !== summary.topic;
  const { error } = await createServiceClient()
    .from("conversations")
    .update({ guide_summary: summary.question, topic: summary.topic, depth: summary.depth, level: summary.level, classified_by: changed ? "chip" : "ai" })
    .eq("id", c.id);
  if (error) {
    logServerError("guideFinish.update", error);
    return { ok: false };
  }
  await logEvent(c.org_id, c.id, "classified", { topic: summary.topic, source: changed ? "chip" : "ai", ai_topic: proposedTopic ?? summary.topic, level: summary.level, from: "guide" });
  if (changed) await logEvent(c.org_id, c.id, "classification_corrected", { from: proposedTopic, to: summary.topic });

  // Nobody assigned yet: route on the confirmed topic and depth.
  if (c.status === "waiting" && !c.daee_id) {
    const { error: routeError } = await (await createClient()).rpc("route_conversation", { conv: c.id, p_topic: summary.topic, p_depth: summary.depth });
    if (routeError) logServerError("guideFinish.route", routeError);
  }
  return { ok: true };
}
