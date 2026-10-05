import { strict as assert } from "node:assert";
import test from "node:test";
import { orchestrateRecommendations, type AccessResult, type OrchestrationDependencies, type RecommendationClaim } from "../../lib/recommendations/access";
import type { AuthorizedRecommendationContext, RecommendationResult } from "../../lib/recommendations/types";

// Injected ledger/engine tests. Actual Postgres lease/RLS tests live in ledger.sql.
const context: AuthorizedRecommendationContext = { conversationId: "conversation", contextVersion: "need", orgId: "organization", actorId: "daee", audience: "daee", locale: "ar", messages: [], aiEnabled: true, status: "active", mode: "automatic" };
const result: RecommendationResult = { requestId: "request", contextVersion: "need", status: "partial", reason: "synthetic_fixture", materials: [], clarification: null, generatedReligiousAnswer: false,
  usage: { modelCalls: 0, modelSteps: 0, searches: 0, fetches: 1, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, uncachedInputTokens: 0, costEstimateUsd: 0, elapsedMs: 17, pricingVerified: false, providerReportedSearches: null, voiceCostUsd: 0, codexDevelopmentCostIncluded: false } };
function deps(overrides: Partial<OrchestrationDependencies> = {}) {
  const calls = { run: 0, validate: 0, finish: [] as Array<{ id: string; result: RecommendationResult | null; usage: RecommendationResult["usage"] | null }> };
  const value: OrchestrationDependencies = {
    authorize: async () => ({ ok: true, context }), claim: async () => ({ state: "start", requestId: "request" }),
    run: async () => { calls.run++; return result; }, validate: (data) => { calls.validate++; return data; },
    finish: async (id, data, usage) => { calls.finish.push({ id, result: data, usage }); },
    disabled: (ctx) => ({ ...result, contextVersion: ctx.contextVersion, status: "disabled", materials: [] }), ...overrides,
  };
  return { value, calls };
}
function sequentialAccess(values: AccessResult[]): () => Promise<AccessResult> {
  return async () => values.shift() ?? { ok: false, error: "forbidden" };
}

test("successful result is reauthorized/revalidated then stored with numeric usage", async () => {
  const { value, calls } = deps();
  const response = await orchestrateRecommendations(value);
  assert.equal(response.status, 200);
  assert.equal(calls.run, 1); assert.equal(calls.validate, 1);
  assert.deepEqual(calls.finish, [{ id: "request", result, usage: result.usage }]);
});
test("assignment revoked during request hides result while preserving actual usage", async () => {
  const { value, calls } = deps({ authorize: sequentialAccess([{ ok: true, context }, { ok: false, error: "forbidden" }]) });
  assert.equal((await orchestrateRecommendations(value)).status, 403);
  assert.deepEqual(calls.finish, [{ id: "request", result: null, usage: result.usage }]);
});
test("changed question during request returns 409 and cannot cache old source result", async () => {
  const { value, calls } = deps({ authorize: sequentialAccess([{ ok: true, context }, { ok: false, error: "stale" }]) });
  assert.equal((await orchestrateRecommendations(value)).status, 409);
  assert.equal(calls.finish[0].result, null);
});
test("AI off during request blocks output and preserves measured usage", async () => {
  const { value, calls } = deps({ authorize: sequentialAccess([{ ok: true, context }, { ok: true, context: { ...context, aiEnabled: false } }]) });
  const response = await orchestrateRecommendations(value);
  assert.equal(response.status, 200);
  assert.equal("status" in response.body ? response.body.status : null, "disabled");
  assert.equal(calls.finish[0].result, null);
  assert.deepEqual(calls.finish[0].usage, result.usage);
});
test("wrong actor/audience/version cache cannot bypass access", async () => {
  for (const change of [{ actorId: "admin" }, { audience: "asker" as const }, { contextVersion: "older" }]) {
    const claim: RecommendationClaim = { state: "cached", requestId: "request", actorId: context.actorId, audience: context.audience, contextVersion: context.contextVersion, result, ...change };
    const { value, calls } = deps({ claim: async () => claim });
    assert.equal((await orchestrateRecommendations(value)).status, 403);
    assert.equal(calls.run, 0); assert.equal(calls.validate, 0);
  }
});
test("cache hit rechecks authorization, AI switch and current source-release eligibility", async () => {
  const claim: RecommendationClaim = { state: "cached", requestId: "request", actorId: context.actorId, audience: context.audience, contextVersion: context.contextVersion, result };
  const success = deps({ claim: async () => claim, validate: (data) => ({ ...data, materials: [], reason: "release_withdrawn" }) });
  const response = await orchestrateRecommendations(success.value);
  assert.equal(response.status, 200);
  assert.equal("reason" in response.body ? response.body.reason : null, "release_withdrawn");
  assert.equal(success.calls.run, 0);
  for (const after of [{ ok: false, error: "forbidden" } as const, { ok: true, context: { ...context, aiEnabled: false } } as const]) {
    const guarded = deps({ claim: async () => claim, authorize: sequentialAccess([{ ok: true, context }, after]) });
    const guardedResponse = await orchestrateRecommendations(guarded.value);
    assert.ok(guardedResponse.status === 403 || "status" in guardedResponse.body && guardedResponse.body.status === "disabled");
    assert.equal(guarded.calls.run, 0);
  }
});
test("running/cooldown keeps latest client need queued without a second engine call", async () => {
  for (const state of ["running", "cooldown"] as const) {
    const { value, calls } = deps({ claim: async () => ({ state, retryAfterMs: 17000 }) });
    assert.deepEqual(await orchestrateRecommendations(value), { status: 429, body: { error: state, retryAfterMs: 17000 } });
    assert.equal(calls.run, 0);
  }
});
test("abort ignores completed old result but does not claim cost was undone", async () => {
  const abort = new AbortController();
  const { value, calls } = deps({ run: async () => { abort.abort(); return result; } });
  assert.equal((await orchestrateRecommendations(value, abort.signal)).status, 409);
  assert.equal(calls.finish[0].result, null);
  assert.deepEqual(calls.finish[0].usage, result.usage);
});
test("already closed request starts no new engine work", async () => {
  const abort = new AbortController(); abort.abort();
  const { value, calls } = deps();
  assert.equal((await orchestrateRecommendations(value, abort.signal)).status, 409);
  assert.equal(calls.run, 0);
  assert.deepEqual(calls.finish, []);
});
test("closed/failed engine releases lease with no private result", async () => {
  const { value, calls } = deps({ run: async () => { throw new Error("fixture_failure"); } });
  assert.equal((await orchestrateRecommendations(value)).status, 503);
  assert.deepEqual(calls.finish, [{ id: "request", result: null, usage: null }]);
});
