"use server";

import { z } from "zod";
import { runAI } from "@/lib/ai/runAI";
import { classifyTask } from "@/lib/ai/tasks/classify";
import { intakeTask, MAX_GUIDE_QUESTIONS, type GuideTurn, type IntakeOutput } from "@/lib/ai/tasks/intake";
import { getAsker } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import type { Json } from "@/lib/db/types";
import { logServerError } from "@/lib/log";

const Turn = z.object({ role: z.enum(["asker", "guide"]), text: z.string().trim().min(1).max(2000) });
const StepInput = z.object({
  firstMessage: z.string().trim().min(1).max(2000),
  turns: z.array(Turn).max(MAX_GUIDE_QUESTIONS * 2 + 4),
  locale: z.string().max(8),
});

export type GuideSummary = NonNullable<IntakeOutput["summary"]>;
export type GuideStep =
  | { kind: "question"; question: string; refused: boolean }
  | { kind: "summary"; summary: GuideSummary; refused: boolean }
  | { kind: "fallback"; reason: string };

async function askerOrg() {
  const asker = await getAsker();
  if (!asker) return null;
  const { data } = await (await createClient()).from("askers").select("org_id").eq("user_id", asker.user_id).single();
  return data ? { asker, orgId: data.org_id } : null;
}

async function logEvent(orgId: string, type: string, meta: Json = {}, conversationId: string | null = null) {
  const { error } = await createServiceClient().from("events").insert({ org_id: orgId, type, conversation_id: conversationId, actor_role: "asker", meta });
  if (error) logServerError(`guide.${type}`, error);
}

/**
 * One step of the guide on the entry flow, before any conversation exists: the next
 * question, or the summary (classified on its own question). Never throws: any failure is
 * a fallback with a reason, logged, so the asker drops to the plain question box.
 */
export async function guideStep(input: z.input<typeof StepInput>): Promise<GuideStep> {
  const ctx = await askerOrg().catch(() => null);
  if (!ctx) return { kind: "fallback", reason: "no_asker" };
  try {
    const parsed = StepInput.safeParse(input);
    if (!parsed.success) return { kind: "fallback", reason: "invalid_input" };
    const { firstMessage, locale } = parsed.data;
    const turns = parsed.data.turns as GuideTurn[];
    if (turns.length === 0) await logEvent(ctx.orgId, "guide_started");

    const result = await runAI(intakeTask, { firstMessage, turns, locale }, { orgId: ctx.orgId, actorId: ctx.asker.user_id });
    if (!result.ok) {
      await logEvent(ctx.orgId, "guide_error", { reason: result.reason });
      return { kind: "fallback", reason: result.reason };
    }
    const step = result.data;
    if (step.refusedReligiousQuestion) await logEvent(ctx.orgId, "guide_refused");
    if (!step.done && step.nextQuestion) {
      await logEvent(ctx.orgId, "guide_question", { n: turns.filter((t) => t.role === "guide").length + 1 });
      return { kind: "question", question: step.nextQuestion, refused: step.refusedReligiousQuestion };
    }
    // Classification runs on the summary's question, not the first message.
    const summary = step.summary!;
    const classified = await runAI(classifyTask, { question: summary.question, locale }, { orgId: ctx.orgId, actorId: ctx.asker.user_id });
    return { kind: "summary", summary: { ...summary, topic: classified.ok ? classified.data.topic : summary.topic }, refused: step.refusedReligiousQuestion };
  } catch (error) {
    logServerError("guideStep", error);
    await logEvent(ctx.orgId, "guide_error", { reason: "exception" }).catch(() => {});
    return { kind: "fallback", reason: "exception" };
  }
}

/** The asker skipped the guide (or it fell back): logged, nothing else changes. */
export async function guideSkipped(input: { questions: number; reason: "skip" | "fallback" }): Promise<void> {
  const ctx = await askerOrg().catch(() => null);
  if (!ctx) return;
  await logEvent(ctx.orgId, "guide_done", { questions: Math.max(0, Math.min(MAX_GUIDE_QUESTIONS, input.questions | 0)), skipped: input.reason === "skip", fallback: input.reason === "fallback" });
}
