import type { RecommendationUsage } from "./types";
import { RECOMMENDATION_LIMITS as PRODUCT_LIMITS, paidResearchAllowed } from "./config";

export type RecommendationLimits = {
  timeoutMs: number; maxModelCalls: number; maxModelSteps: number;
  maxSearches: number; maxFetches: number; maxInputBytes: number;
  maxInputTokens: number; maxOutputTokens: number; maxFetchedTextChars: number;
  maxCostUsd: number;
};
export const RECOMMENDATION_LIMITS: Readonly<RecommendationLimits> = Object.freeze({
  timeoutMs: 30_000, maxModelCalls: 2, maxModelSteps: 3,
  maxSearches: 2, maxFetches: 3, maxInputBytes: 12_000,
  maxInputTokens: 1_200_000, maxOutputTokens: 1_200,
  maxFetchedTextChars: 4_000, maxCostUsd: 0,
});
/** Deployment must supply a reviewed, dated price and model-context record. No prices
 * are inferred from model names or from this test suite's synthetic values. */
export type RecommendationPricing = {
  model: string; sourceUrl: string; verifiedOn: string; reviewedBy: string;
  contextWindowTokens: number; inputUsdPerMillion: number; outputUsdPerMillion: number;
  cacheReadUsdPerMillion: number; cacheWriteUsdPerMillion: number;
  searchUsdPerThousand: number; fetchUsdPerThousand: number;
};
export type ProviderUsageObservation = {
  inputTokens: number; outputTokens: number; uncachedInputTokens: number;
  cacheReadTokens: number; cacheWriteTokens: number;
  searches: number; fetches: number; providerReportedSearches: number | null;
  providerReportedModelSteps: number | null;
};
export class RecommendationBudgetError extends Error {
  constructor(readonly reason: string) { super(reason); this.name = "RecommendationBudgetError"; }
}
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;
const integer = (value: number) => nonnegative(value) && Number.isInteger(value);
function validPricing(pricing: RecommendationPricing | null): pricing is RecommendationPricing {
  if (!pricing || !pricing.model || !pricing.reviewedBy || !/^\d{4}-\d{2}-\d{2}$/.test(pricing.verifiedOn)) return false;
  try { const url = new URL(pricing.sourceUrl); if (url.protocol !== "https:" || url.hostname !== "platform.claude.com" || !url.pathname.includes("pricing")) return false; } catch { return false; }
  return integer(pricing.contextWindowTokens) && pricing.contextWindowTokens > 0 &&
    [pricing.inputUsdPerMillion, pricing.outputUsdPerMillion, pricing.cacheReadUsdPerMillion,
      pricing.cacheWriteUsdPerMillion, pricing.searchUsdPerThousand, pricing.fetchUsdPerThousand].every(nonnegative);
}

/** Contains rates/links only, never an API key. Malformed/unreviewed records fail closed. */
export function loadVerifiedPricing(env: Record<string, string | undefined> = process.env): RecommendationPricing | null {
  try {
    const record: unknown = JSON.parse(env.WASL_RECOMMENDATIONS_PRICING_JSON ?? "null");
    if (!record || typeof record !== "object") return null;
    const candidate = record as RecommendationPricing;
    return validPricing(candidate) ? { ...candidate } : null;
  } catch { return null; }
}
export function getProviderBudget(requestId: string, mode: "automatic" | "refresh" | "expand"): RecommendationBudget {
  const preset = mode === "expand" ? PRODUCT_LIMITS.expand : PRODUCT_LIMITS.quick;
  const configuredTotal = Number(process.env.WASL_RECOMMENDATIONS_TEST_BUDGET_USD);
  const total = Number.isFinite(configuredTotal) && configuredTotal > 0 ? Math.min(configuredTotal, 5) : 0;
  return new RecommendationBudget({ requestId, spendAllowed: paidResearchAllowed(), pricing: loadVerifiedPricing(),
    limits: { ...preset, timeoutMs: PRODUCT_LIMITS.timeoutMs, maxFetchedTextChars: PRODUCT_LIMITS.maxExcerptChars,
      maxCostUsd: Math.max(0, Math.min(total, preset.maxCostUsd)) } });
}

/** A ledger belongs to one durable request ID and survives every retry/continuation.
 * Native tools get a reservation BEFORE the HTTP call. Failed/aborted calls never
 * refund that reservation because missing usage cannot prove zero expenditure. */
export class RecommendationBudget {
  readonly limits: Readonly<RecommendationLimits>;
  readonly pricing: RecommendationPricing | null;
  readonly requestId: string;
  private readonly now: () => number;
  private readonly started: number;
  private readonly spendAllowed: boolean;
  private reservedCostUsd = 0;
  private reservedInputTokens = 0;
  private reservedOutputTokens = 0;
  private reservedSearches = 0;
  private reservedFetches = 0;
  private allocatedCalls = 0;
  private pendingCalls = new Set<number>();
  private completedCalls = new Set<number>();
  private usageKnown = true;
  private providerSteps: number | null = null;
  private totals = { modelCalls: 0, modelSteps: 0, searches: 0, fetches: 0,
    inputTokens: 0, outputTokens: 0, uncachedInputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, costEstimateUsd: 0,
    providerReportedSearches: null as number | null };

  constructor(options: { requestId: string; spendAllowed?: boolean; pricing?: RecommendationPricing | null; limits?: Partial<RecommendationLimits>; now?: () => number }) {
    this.requestId = options.requestId;
    this.limits = Object.freeze({ ...RECOMMENDATION_LIMITS, ...options.limits });
    for (const [key, value] of Object.entries(this.limits)) {
      if (!nonnegative(value) || key !== "maxCostUsd" && !integer(value)) throw new RecommendationBudgetError("invalid_limits");
    }
    if (!options.requestId || this.limits.timeoutMs === 0 || this.limits.maxInputBytes === 0 || this.limits.maxOutputTokens === 0) throw new RecommendationBudgetError("invalid_limits");
    this.pricing = validPricing(options.pricing ?? null) ? Object.freeze({ ...options.pricing! }) : null;
    this.spendAllowed = options.spendAllowed === true;
    this.now = options.now ?? Date.now; this.started = this.now();
  }
  readiness(): string | null {
    if (!this.spendAllowed || this.limits.maxCostUsd === 0) return "spending_disabled";
    if (!this.pricing) return "pricing_unverified";
    return null;
  }
  remainingMs() { return Math.max(0, this.limits.timeoutMs - (this.now() - this.started)); }
  remainingSearches() { return Math.max(0, this.limits.maxSearches - this.reservedSearches); }
  remainingFetches() { return Math.max(0, this.limits.maxFetches - this.reservedFetches); }
  remainingOutputTokens() { return Math.max(0, this.limits.maxOutputTokens - this.reservedOutputTokens); }
  /** Conservative reservation accounts for opaque native generations: no advisor,
   * code execution or compaction, at most one generation around each allowed tool.
   * The reviewed model context-window ceiling bounds input, not max_content_tokens. */
  reserveCall(inputBytes: number, outputTokens: number, searches: number, fetches: number, model: string): number {
    const blocked = this.readiness(); if (blocked) throw new RecommendationBudgetError(blocked);
    if (this.remainingMs() === 0) throw new RecommendationBudgetError("timeout");
    if (!integer(inputBytes) || inputBytes > this.limits.maxInputBytes || !integer(outputTokens) || outputTokens === 0 || !integer(searches) || !integer(fetches)) throw new RecommendationBudgetError("input_limit");
    if (model !== this.pricing!.model) throw new RecommendationBudgetError("pricing_model_mismatch");
    if (this.pendingCalls.size > 0) throw new RecommendationBudgetError("request_running");
    if (this.allocatedCalls >= this.limits.maxModelCalls || this.allocatedCalls >= this.limits.maxModelSteps) throw new RecommendationBudgetError("model_limit");
    if (searches > this.remainingSearches() || fetches > this.remainingFetches()) throw new RecommendationBudgetError("tool_limit");
    if (this.reservedOutputTokens + outputTokens > this.limits.maxOutputTokens) throw new RecommendationBudgetError("output_limit");
    const rounds = 1 + searches + fetches;
    // A no-tool private task has known UTF-8 input; reserve bytes plus a bounded
    // schema/envelope margin, not the model's entire context window.
    const reservedInput = searches + fetches > 0 ? rounds * this.pricing!.contextWindowTokens : inputBytes + 4_096;
    if (this.reservedInputTokens + reservedInput > this.limits.maxInputTokens) throw new RecommendationBudgetError("input_token_limit");
    const maxInputPrice = Math.max(this.pricing!.inputUsdPerMillion, this.pricing!.cacheReadUsdPerMillion, this.pricing!.cacheWriteUsdPerMillion);
    const reserve = (reservedInput * maxInputPrice + rounds * outputTokens * this.pricing!.outputUsdPerMillion) / 1_000_000 +
      (searches * this.pricing!.searchUsdPerThousand + fetches * this.pricing!.fetchUsdPerThousand) / 1_000;
    if (this.reservedCostUsd + reserve > this.limits.maxCostUsd) throw new RecommendationBudgetError("cost_limit");
    this.reservedInputTokens += reservedInput; this.reservedOutputTokens += outputTokens;
    this.reservedSearches += searches; this.reservedFetches += fetches; this.reservedCostUsd += reserve;
    this.totals.modelCalls++; this.totals.modelSteps++;
    const id = ++this.allocatedCalls; this.pendingCalls.add(id); return id;
  }
  recordCall(id: number, usage: ProviderUsageObservation) {
    if (this.completedCalls.has(id)) return;
    if (!this.pendingCalls.delete(id)) throw new RecommendationBudgetError("unknown_call");
    this.completedCalls.add(id);
    for (const key of ["inputTokens", "outputTokens", "uncachedInputTokens", "cacheReadTokens", "cacheWriteTokens", "searches", "fetches"] as const) {
      if (!integer(usage[key])) { this.usageKnown = false; throw new RecommendationBudgetError("invalid_usage"); }
      this.totals[key] += usage[key];
    }
    if (usage.providerReportedSearches !== null) this.totals.providerReportedSearches = (this.totals.providerReportedSearches ?? 0) + usage.providerReportedSearches;
    if (usage.providerReportedModelSteps !== null) this.providerSteps = (this.providerSteps ?? 0) + usage.providerReportedModelSteps;
    const pricing = this.pricing!;
    this.totals.costEstimateUsd += (usage.uncachedInputTokens * pricing.inputUsdPerMillion + usage.outputTokens * pricing.outputUsdPerMillion +
      usage.cacheReadTokens * pricing.cacheReadUsdPerMillion + usage.cacheWriteTokens * pricing.cacheWriteUsdPerMillion) / 1_000_000 +
      (usage.searches * pricing.searchUsdPerThousand + usage.fetches * pricing.fetchUsdPerThousand) / 1_000;
    if (this.totals.searches > this.reservedSearches || this.totals.fetches > this.reservedFetches || this.totals.inputTokens > this.reservedInputTokens ||
      this.totals.outputTokens > this.reservedOutputTokens || this.totals.costEstimateUsd > this.limits.maxCostUsd) throw new RecommendationBudgetError("provider_limit_exceeded");
  }
  markUnknown(id: number) { if (this.completedCalls.has(id)) return; this.pendingCalls.delete(id); this.completedCalls.add(id); this.usageKnown = false; }
  /** A refused durable reservation is known to precede the API call. Keep the local
   * retry reservation, but never count it as actual model usage or an unknown bill. */
  markNotDispatched(id: number) {
    if (!this.pendingCalls.delete(id) || this.completedCalls.has(id)) return;
    this.completedCalls.add(id); this.totals.modelCalls--; this.totals.modelSteps--;
  }
  snapshot(): RecommendationUsage & { usageKnown: boolean; reservedCostUsd: number; providerReportedModelSteps: number | null } {
    return { ...this.totals, costEstimateUsd: this.usageKnown && this.pendingCalls.size === 0 ? this.totals.costEstimateUsd : null,
      elapsedMs: Math.max(0, this.now() - this.started), pricingVerified: this.pricing !== null,
      voiceCostUsd: 0, codexDevelopmentCostIncluded: false, usageKnown: this.usageKnown && this.pendingCalls.size === 0,
      reservedCostUsd: this.reservedCostUsd, providerReportedModelSteps: this.providerSteps };
  }
}
