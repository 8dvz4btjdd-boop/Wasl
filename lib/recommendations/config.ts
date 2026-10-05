export const RECOMMENDATION_POLICY_VERSION = "contextual-v1-2026-10-05";
export const RECOMMENDATION_LIMITS = Object.freeze({
  cooldownMs: 20_000, timeoutMs: 30_000, maxContextMessages: 6, maxContextChars: 8_000,
  quick: { maxSearches: 2, maxFetches: 3, maxModelCalls: 2, maxModelSteps: 3, maxInputTokens: 12_000, maxOutputTokens: 1_200, maxCostUsd: 0.15 },
  expand: { maxSearches: 4, maxFetches: 5, maxModelCalls: 3, maxModelSteps: 5, maxInputTokens: 20_000, maxOutputTokens: 2_000, maxCostUsd: 0.35 },
  maxFetchBytes: 256_000, maxExcerptChars: 4_000,
});
/** Spending needs an explicit bounded authorization and runtime configuration.
 * A key alone cannot enable spending. Pricing must also be verified for the actual model.
 */
export function paidResearchAllowed(): boolean {
  return process.env.WASL_RECOMMENDATIONS_PAID_APPROVED === "true"
    && Number(process.env.WASL_RECOMMENDATIONS_TEST_BUDGET_USD) > 0;
}
