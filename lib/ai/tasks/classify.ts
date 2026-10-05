import "server-only";
import { z } from "zod";
import { CLASSIFY_SYSTEM } from "@/lib/ai/prompts/classify";
import { Locale } from "@/lib/ai/schemas";
import type { AITask } from "@/lib/ai/task";

export const TOPICS = ["quran", "prophet", "tawhid", "worship", "ethics", "doubts", "general"] as const;

export const ClassifySchema = z.object({
  topic: z.enum(TOPICS),
  language: Locale,
  depth: z.enum(["intro", "explain", "detailed"]),
  confidence: z.number().min(0).max(1),
});
export type ClassifyOutput = z.infer<typeof ClassifySchema>;

/** The question and the page locale only; never the asker's background. */
export type ClassifyInput = { question: string; locale: string };

/** Describes the question for routing. Below 0.5 confidence the topic becomes "general". */
export const classifyTask: AITask<ClassifyInput, ClassifyOutput> = {
  name: "classify",
  tier: "fast",
  schema: ClassifySchema,
  outputPolicy: "model_authored",
  ephemeralFields: [],
  rateLimit: { max: 30, windowMinutes: 60 },
  cacheMinutes: 60,
  buildPrompt(input) {
    return {
      system: CLASSIFY_SYSTEM,
      blocks: [{ tag: "question", content: input.question }],
      instruction: `Classify the question. The page language is ${input.locale}.`,
    };
  },
  postValidate(output) {
    return { ok: true, output: output.confidence < 0.5 ? { ...output, topic: "general" } : output };
  },
};
