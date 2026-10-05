import "server-only";
import { z } from "zod";
import { INTAKE_SYSTEM } from "@/lib/ai/prompts/intake";
import type { AITask } from "@/lib/ai/task";

export const MAX_GUIDE_QUESTIONS = 3;
const MAX_QUESTION_WORDS = 20;

export const IntakeSchema = z.object({
  done: z.boolean(),
  nextQuestion: z.string().nullable(),
  refusedReligiousQuestion: z.boolean(),
  summary: z
    .object({
      question: z.string(),
      topic: z.enum(["quran", "prophet", "tawhid", "worship", "ethics", "doubts", "general"]),
      depth: z.enum(["intro", "explain", "detailed"]),
      level: z.enum(["a", "b", "c", "d"]),
    })
    .nullable(),
});
export type IntakeOutput = z.infer<typeof IntakeSchema>;

export type GuideTurn = { role: "asker" | "guide"; text: string };
export type IntakeInput = { firstMessage: string; turns: GuideTurn[]; locale: string };

// A question about the person rather than the question: never asked (fixed limit 3).
const ABOUT_THE_PERSON =
  /(تؤمن|إيمانك|دينك|ديانتك|عقيدتك|معتقدك|هل أنت مسلم|هل أنتِ مسلمة|خلفيتك|اقتناعك|مقتنع|believe|your faith|your religion|religious background|are you (a )?muslim|your background|convinced|convert)/i;
// The asker asks what they themselves may or should do: a personal ruling (level d).
const PERSONAL_RULING = /(هل يجوز لي|هل يحل لي|هل يحرم علي|ما حكم .{0,40}(لي|علي)|ماذا يجب علي|is it (halal|haram|permissible|allowed) for me|am i allowed|can i .{0,30}(halal|haram)|should i)/i;

/**
 * The guide's next step. postValidate enforces the rules the prompt states: at most three
 * questions, short questions, never about the person, and a personal ruling is level d.
 */
export const intakeTask: AITask<IntakeInput, IntakeOutput> = {
  name: "intake",
  tier: "fast",
  schema: IntakeSchema,
  outputPolicy: "model_authored",
  // The summary restates the asker's own question (which may say حلال or حرام); the
  // policy applies to what the guide says itself: its question.
  policyExempt: ["summary"],
  ephemeralFields: ["nextQuestion", "summary.question"],
  rateLimit: { max: 40, windowMinutes: 60 },
  buildPrompt(input) {
    return {
      system: INTAKE_SYSTEM.replaceAll("{locale}", input.locale),
      blocks: [
        { tag: "first_message", content: input.firstMessage },
        { tag: "guide_conversation", content: input.turns.map((t) => `${t.role}: ${t.text}`).join("\n") || "(none yet)" },
      ],
      instruction: `Questions asked so far: ${input.turns.filter((t) => t.role === "guide").length} of ${MAX_GUIDE_QUESTIONS}. Decide the next step.`,
    };
  },
  postValidate(output, input) {
    const asked = input.turns.filter((t) => t.role === "guide").length;
    let out = { ...output };
    // After the third question the guide is done, with whatever summary it has.
    if (asked >= MAX_GUIDE_QUESTIONS) out = { ...out, done: true, nextQuestion: null };
    if (out.done) {
      if (!out.summary) return { ok: false, reason: "no_summary" };
      out.nextQuestion = null;
    } else {
      const q = out.nextQuestion?.trim() ?? "";
      if (!q) return { ok: false, reason: "no_question" };
      if (q.split(/\s+/).length >= MAX_QUESTION_WORDS) return { ok: false, reason: "question_too_long" };
      if (ABOUT_THE_PERSON.test(q)) return { ok: false, reason: "about_the_person" };
      out.nextQuestion = q;
    }
    const askerText = [input.firstMessage, ...input.turns.filter((t) => t.role === "asker").map((t) => t.text)].join("\n");
    if (out.summary && (PERSONAL_RULING.test(askerText) || PERSONAL_RULING.test(out.summary.question))) {
      out.summary = { ...out.summary, level: "d" };
    }
    return { ok: true, output: out };
  },
};
