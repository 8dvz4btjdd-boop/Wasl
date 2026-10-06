import type { z } from "zod";

export type Tier = "fast" | "card";

/** A block of user-provided content. Rendered as <tag>…</tag> with `<` escaped inside. */
export type DataBlock = { tag: string; content: string };

export type Prompt = { system: string; blocks: DataBlock[]; instruction?: string };

export type PostValidation<O> = { ok: true; output: O } | { ok: false; reason: string };

/**
 * One AI feature = one task file. runAI runs every task through the same pipeline.
 * asker_sourced: the output restates the asker's own words (the card); model_authored:
 * the model writes new text, so the religious-ruling policy check also runs.
 */
export type AITask<I, O> = {
  name: string;
  tier: Tier;
  schema: z.ZodType<O>;
  buildPrompt: (input: I) => Prompt;
  postValidate: (output: O, input: I) => PostValidation<O>;
  outputPolicy: "asker_sourced" | "model_authored";
  /** Dot paths redacted before the output is stored in ai_runs. */
  ephemeralFields: string[];
  rateLimit: { max: number; windowMinutes: number } | null;
  /** Reuse a validated output for the same input (sha256) within this many minutes. */
  cacheMinutes?: number;
  /** Total time for the call (default 12 s). */
  timeoutMs?: number;
  /**
   * A task that can't go through the SDK (e.g. web search citations) makes its own call;
   * runAI still owns the switch, rate limit, timeout, validation, policy and logging.
   */
  execute?: (call: { model: string; system: string; userText: string; signal: AbortSignal; input: I }) => Promise<unknown>;
  /** false: the output is never stored, not even redacted (ai_runs keeps output null). */
  persistOutput?: boolean;
  /** Top-level output fields the policy check skips (verbatim source text, never model prose). */
  policyExempt?: string[];
};
