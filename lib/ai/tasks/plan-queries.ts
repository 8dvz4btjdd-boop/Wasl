import "server-only";
import { z } from "zod";
import { PLAN_QUERIES_SYSTEM } from "@/lib/ai/prompts/plan-queries";
import type { AITask } from "@/lib/ai/task";

export const PlanSchema = z.object({ queries: z.array(z.string()).min(1).max(4) });
export type PlanOutput = z.infer<typeof PlanSchema>;

export type PlanInput = {
  question: string;
  /** Up to 6 recent messages, oldest first, for what the question refers to. */
  recent: { role: "asker" | "daee"; text: string }[];
  topic: string;
  locale: string;
};

const MAX_QUERY_WORDS = 8;

/**
 * The search plan: 2 or 3 short concept queries for the approved sources, never an answer.
 * Model-authored, so the ruling/citation policy check runs on the queries.
 */
export const planQueriesTask: AITask<PlanInput, PlanOutput> = {
  name: "plan_queries",
  tier: "fast",
  schema: PlanSchema,
  outputPolicy: "model_authored",
  ephemeralFields: [],
  rateLimit: { max: 60, windowMinutes: 60 },
  cacheMinutes: 60,
  buildPrompt(input) {
    return {
      system: PLAN_QUERIES_SYSTEM.replace("{locale}", input.locale),
      blocks: [
        { tag: "question", content: input.question },
        { tag: "recent_messages", content: input.recent.slice(-6).map((m) => `${m.role}: ${m.text}`).join("\n") || "(none)" },
      ],
      instruction: `Topic hint: ${input.topic}. Write 2 or 3 search queries.`,
    };
  },
  postValidate(output) {
    // Short concept queries only; a long sentence is not a query (it reads like an answer).
    const queries = [...new Set(output.queries.map((q) => q.replace(/\s+/g, " ").trim()))].filter(
      (q) => q.length > 1 && q.split(" ").length <= MAX_QUERY_WORDS,
    );
    if (!queries.length) return { ok: false, reason: "no_queries" };
    return { ok: true, output: { queries: queries.slice(0, 3) } };
  },
};
