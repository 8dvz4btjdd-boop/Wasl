import "server-only";
import { z } from "zod";
import { runAI, type AIOptions, type BoundedAIOptions, type RunContext } from "@/lib/ai/runAI";
import type { AITask } from "@/lib/ai/task";
import { RECOMMENDATION_INTENT_SYSTEM, RECOMMENDATION_WEB_SYSTEM } from "@/lib/ai/prompts/recommendations";
import { reserveRecommendationBudget } from "@/lib/db/queries/recommendations";
import { RecommendationBudget, RecommendationBudgetError } from "./budget";
import { CONCEPTS, type ConceptId } from "./concepts";
import { findSourceForUrl, sourceDomains } from "./sources";
import type { ContextMessage, RecommendationUsage } from "./types";

const OriginalSource = z.object({ url: z.string().url(), title: z.string().max(600), bodyVerbatim: z.string().min(1).max(4_000), retrievedAt: z.string().nullable() }).strict();
export type RetrievedOriginalSource = z.infer<typeof OriginalSource>;
const SourcesOutput = z.object({ sources: z.array(OriginalSource).max(3) }).strict();
export type ProviderResult = { ok: true; sources: RetrievedOriginalSource[]; usage: RecommendationUsage } | { ok: false; reason: string; usage: RecommendationUsage };
const conceptIds = Object.keys(CONCEPTS) as [ConceptId, ...ConceptId[]];
const IntentOutput = z.object({ concepts: z.array(z.enum(conceptIds)).max(2), personal: z.boolean(), ambiguous: z.boolean() }).strict();
export type RefinedIntent = z.infer<typeof IntentOutput>;
export type PrivateIntentResult = ({ ok: true } & RefinedIntent & { usage: RecommendationUsage }) | { ok: false; reason: string; usage: RecommendationUsage };

/** Public queries are constructed from reviewed editorial topic labels only. No raw
 * user substring, email, name, location, or belief enters a provider web-tool context. */
export function isSafeKnowledgeQuery(query: string): boolean {
  if (!query || query.length > 600) return false;
  const parts = query.split("؛ ");
  const allowed = new Set<string>(Object.values(CONCEPTS).map((concept) => concept.query));
  return parts.length <= 2 && new Set(parts).size === parts.length && parts.every((part) => allowed.has(part));
}
function configured(budget: RecommendationBudget): string | null {
  const reason = budget.readiness(); if (reason) return reason;
  if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL_FAST) return "not_configured";
  if (budget.pricing?.model !== process.env.ANTHROPIC_MODEL_FAST) return "pricing_model_mismatch";
  if (budget.remainingMs() === 0) return "timeout";
  return null;
}
function boundedOptions(budget: RecommendationBudget, ctx: RunContext, maxOutputTokens: number): BoundedAIOptions {
  return {
    timeoutMs: Math.max(1, budget.remainingMs()), maxOutputTokens,
    async reserve(inputBytes, outputTokens, searches, fetches, model) {
      const id = budget.reserveCall(inputBytes, outputTokens, searches, fetches, model);
      // The durable pool reserves the entire immutable per-request ceiling once.
      // Repeating this same amount is idempotent across private + native calls.
      const amount = budget.limits.maxCostUsd;
      const configuredTotal = Number(process.env.WASL_RECOMMENDATIONS_TEST_BUDGET_USD);
      const total = Number.isFinite(configuredTotal) && configuredTotal > 0 ? Math.min(configuredTotal, 5) : 0;
      try {
        if (!Number.isFinite(total) || total <= 0 || !await reserveRecommendationBudget(budget.requestId, ctx.orgId, amount, total)) throw new RecommendationBudgetError("spending_ledger_unavailable");
      } catch {
        budget.markNotDispatched(id); throw new RecommendationBudgetError("spending_ledger_unavailable");
      }
      return id;
    },
    record: (id, usage) => budget.recordCall(id, usage),
    unknown: (id) => budget.markUnknown(id),
  };
}

/** Caller must already hold a server-authorized context. This API accepts no messages;
 * the separate private-intent task cannot accidentally pass a transcript to web tools. */
export async function retrieveWithProvider(query: string, options: { sourceDomains: string[]; signal: AbortSignal; requestId: string; budget: RecommendationBudget }, ctx: RunContext): Promise<ProviderResult> {
  const { budget } = options;
  const fallback = (reason: string): ProviderResult => ({ ok: false, reason, usage: budget.snapshot() });
  if (options.requestId !== budget.requestId) return fallback("budget_request_mismatch");
  if (!isSafeKnowledgeQuery(query)) return fallback("unsafe_web_query");
  const permittedDomains = new Set(sourceDomains(Object.values(CONCEPTS).flatMap((concept) => [...concept.sources])));
  if (!options.sourceDomains.length || options.sourceDomains.some((domain) => !permittedDomains.has(domain))) return fallback("invalid_source_scope");
  if (options.signal.aborted) return fallback("aborted");
  const blocked = configured(budget); if (blocked) return fallback(blocked);
  const task: AITask<string, z.infer<typeof SourcesOutput>> = {
    name: "contextual_sourced_web_v1", tier: "fast", schema: SourcesOutput,
    buildPrompt: (publicQuery) => ({ system: RECOMMENDATION_WEB_SYSTEM, blocks: [{ tag: "public_knowledge_query", content: publicQuery }] }),
    postValidate: (output) => {
      if (!output.sources.length) return { ok: false, reason: "insufficient_source" };
      if (output.sources.some((source) => !findSourceForUrl(source.url) || !options.sourceDomains.includes(new URL(source.url).hostname))) return { ok: false, reason: "source_scope" };
      return { ok: true, output };
    },
    outputPolicy: "model_authored", ephemeralFields: [], rateLimit: { max: 6, windowMinutes: 10 },
  };
  const nativeWeb: NonNullable<AIOptions["nativeWeb"]> = {
    ...boundedOptions(budget, ctx, budget.remainingOutputTokens()),
    allowedDomains: [...options.sourceDomains], maxSearches: budget.remainingSearches(), maxFetches: budget.remainingFetches(),
    maxContentTokens: 4_000, maxSourceChars: Math.min(4_000, budget.limits.maxFetchedTextChars),
  };
  const result = await runAI(task, query, ctx, { nativeWeb, signal: options.signal });
  return result.ok ? { ok: true, sources: result.data.sources, usage: budget.snapshot() } : fallback(result.reason);
}

/** No tools and no freely generated search query: enum labels are converted to public
 * editorial queries only after this private model call completes. The same budget
 * instance covers private understanding and the subsequent native research request. */
export async function refinePrivateIntent(messages: readonly ContextMessage[], options: { budget: RecommendationBudget; signal: AbortSignal; requestId: string }, ctx: RunContext): Promise<PrivateIntentResult> {
  const { budget } = options;
  const fallback = (reason: string): PrivateIntentResult => ({ ok: false, reason, usage: budget.snapshot() });
  if (options.requestId !== budget.requestId) return fallback("budget_request_mismatch");
  if (messages.length === 0 || messages.length > 6 || messages.reduce((sum, message) => sum + message.body.length, 0) > 8_000 || messages.some((message) => !["asker", "daee"].includes(message.sender_role))) return fallback("context_limit");
  if (options.signal.aborted) return fallback("aborted");
  const blocked = configured(budget); if (blocked) return fallback(blocked);
  const task: AITask<readonly ContextMessage[], RefinedIntent> = {
    name: "contextual_private_intent_v1", tier: "fast", schema: IntentOutput,
    buildPrompt: (context) => ({ system: RECOMMENDATION_INTENT_SYSTEM,
      instruction: `Allowed topic IDs: ${conceptIds.join(", ")}.`,
      blocks: [{ tag: "authorized_private_dialogue", content: JSON.stringify(context.map(({ sender_role, body }) => ({ role: sender_role, text: body }))) }] }),
    postValidate: (output) => new Set(output.concepts).size === output.concepts.length
      ? { ok: true, output: { ...output, ambiguous: output.ambiguous || output.concepts.length === 0 } }
      : { ok: false, reason: "duplicate_concepts" },
    outputPolicy: "model_authored", ephemeralFields: [], rateLimit: { max: 6, windowMinutes: 10 },
  };
  const result = await runAI(task, messages, ctx, { signal: options.signal, bounded: boundedOptions(budget, ctx, Math.min(200, budget.remainingOutputTokens())) });
  return result.ok ? { ok: true, ...result.data, usage: budget.snapshot() } : fallback(result.reason);
}
