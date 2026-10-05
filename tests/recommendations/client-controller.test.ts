import assert from "node:assert/strict";
import test from "node:test";
import {
  ContextualRecommendationController,
  RecommendationRequestError,
  type RecommendationClientState,
} from "../../lib/recommendations/client-controller";
import type { RecommendationRequest, RecommendationResult } from "../../lib/recommendations/types";

class Clock {
  time = 0;
  sequence = 0;
  timers = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  schedule = (callback: () => void, delay: number) => {
    const id = ++this.sequence;
    this.timers.set(id, { at: this.time + delay, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  cancel = (id: ReturnType<typeof setTimeout>) => { this.timers.delete(id as unknown as number); };
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const next = [...this.timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = target;
  }
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function result(contextVersion: string): RecommendationResult {
  return {
    requestId: "synthetic-request", contextVersion, status: "partial", reason: "test-fixture",
    materials: [], clarification: null, generatedReligiousAnswer: false,
    usage: {
      modelCalls: 0, modelSteps: 0, searches: 0, fetches: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, uncachedInputTokens: 0, costEstimateUsd: 0,
      elapsedMs: 1, pricingVerified: false, providerReportedSearches: null,
      voiceCostUsd: 0, codexDevelopmentCostIncluded: false,
    },
  };
}
function harness() {
  const clock = new Clock();
  const calls: Array<{
    request: RecommendationRequest; signal: AbortSignal;
    resolve: (result: RecommendationResult) => void; reject: (error: Error) => void;
  }> = [];
  const states: RecommendationClientState[] = [];
  const controller = new ContextualRecommendationController({
    now: clock.now, schedule: clock.schedule, cancel: clock.cancel, onChange: (state) => states.push(state),
    request: (request, signal) => new Promise<RecommendationResult>((resolve, reject) => calls.push({ request, signal, resolve, reject })),
  });
  const update = (version: string | null, enabled = true, conversationId = "synthetic-conversation") =>
    controller.update({ conversationId, contextVersion: version, locale: "ar", enabled });
  return { clock, calls, states, controller, update };
}

test("merges close saved needs, keeps only the latest, and never dispatches mere state refresh", async () => {
  const h = harness();
  h.update("first");
  h.clock.advance(200);
  h.update("correction");
  h.clock.advance(349);
  assert.equal(h.calls.length, 0);
  h.clock.advance(1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].request.contextVersion, "correction");
  h.calls[0].resolve(result("correction"));
  await flush();
  h.update("correction");
  h.clock.advance(120_000);
  assert.equal(h.calls.length, 1);
  assert.equal(h.states.at(-1)?.phase, "ready");
  h.controller.dispose();
});

test("preserves the newest need throughout the twenty-second cooldown", async () => {
  const h = harness();
  h.update("first"); h.clock.advance(350);
  h.calls[0].resolve(result("first")); await flush();
  h.clock.advance(1_000); h.update("second");
  h.clock.advance(1_000); h.update("third");
  h.clock.advance(17_999);
  assert.equal(h.calls.length, 1);
  assert.equal(h.states.at(-1)?.phase, "queued");
  h.clock.advance(1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].request.contextVersion, "third");
  h.controller.dispose();
});

test("aborts outdated context, ignores its result, and permits no overlapping client requests", async () => {
  const h = harness();
  h.update("first"); h.clock.advance(350);
  h.update("correction");
  assert.equal(h.calls[0].signal.aborted, true);
  h.clock.advance(25_000);
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve(result("first")); await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].request.contextVersion, "correction");
  assert.equal(h.states.some((state) => state.result?.contextVersion === "first"), false);
  h.calls[1].resolve(result("correction")); await flush();
  assert.equal(h.states.at(-1)?.result?.contextVersion, "correction");
  h.controller.dispose();
});

test("AI off cancels pending work and closing the panel prevents future requests", async () => {
  const h = harness();
  h.update("first"); h.clock.advance(350);
  h.update("second");
  h.update("second", false);
  assert.equal(h.calls[0].signal.aborted, true);
  h.calls[0].reject(new Error("aborted")); await flush();
  h.clock.advance(100_000);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.states.at(-1), { phase: "idle", result: null, error: null });
  h.controller.dispose(); h.update("third");
  h.clock.advance(100_000);
  assert.equal(h.calls.length, 1);
});

test("retry and explicit expansion retain the context ID and share the cooldown", async () => {
  const h = harness();
  h.update("first"); h.clock.advance(350);
  h.calls[0].reject(new RecommendationRequestError("network")); await flush();
  assert.equal(h.states.at(-1)?.phase, "error");
  h.controller.manual("refresh"); h.controller.manual("expand");
  h.clock.advance(19_999); assert.equal(h.calls.length, 1);
  h.clock.advance(1); assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].request.mode, "refresh");
  assert.equal(h.calls[1].request.contextVersion, "first");
  h.calls[1].resolve(result("first")); await flush();
  h.controller.manual("expand"); h.clock.advance(20_000);
  assert.equal(h.calls[2].request.mode, "expand");
  assert.equal(h.calls[2].request.contextVersion, "first");
  h.controller.dispose();
});

test("a disconnected browser request is bounded and cannot leak a stale result into another conversation", async () => {
  const h = harness();
  h.update("first"); h.clock.advance(350); h.clock.advance(35_000);
  assert.equal(h.calls[0].signal.aborted, true);
  h.update("other", true, "other-conversation");
  h.calls[0].resolve(result("first")); await flush();
  h.clock.advance(350);
  assert.equal(h.calls[1].request.conversationId, "other-conversation");
  assert.equal(h.states.some((state) => state.result?.contextVersion === "first"), false);
  h.controller.dispose();
});

test("server cooldown retains the need and bounds repeated lease retries without resetting its context", async () => {
  const h = harness();
  h.update("first"); h.clock.advance(350);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    h.calls[attempt].reject(new RecommendationRequestError("retry_later", 25_000)); await flush();
    if (attempt < 2) {
      assert.equal(h.states.at(-1)?.phase, "queued");
      h.clock.advance(24_999); assert.equal(h.calls.length, attempt + 1);
      h.clock.advance(1); assert.equal(h.calls.length, attempt + 2);
      assert.equal(h.calls[attempt + 1].request.contextVersion, "first");
      assert.equal(h.calls[attempt + 1].request.mode, "automatic");
    }
  }
  assert.equal(h.states.at(-1)?.phase, "error");
  h.clock.advance(120_000); assert.equal(h.calls.length, 3);
  h.controller.dispose();
});

test("a changed question replaces a queued server-cooldown retry", async () => {
  const h = harness();
  h.update("first"); h.clock.advance(350);
  h.calls[0].reject(new RecommendationRequestError("retry_later", 25_000)); await flush();
  h.update("correction"); h.clock.advance(25_000);
  assert.equal(h.calls[1].request.contextVersion, "correction");
  h.controller.dispose();
});

test("default browser timers are called with their own global receiver, never the controller", async (t) => {
  let scheduled = 0;
  let cancelled = 0;
  t.mock.method(globalThis, "setTimeout", function (this: unknown) {
    assert.ok(this === undefined || this === globalThis, "browser timer received an invalid object");
    scheduled += 1;
    return scheduled as unknown as ReturnType<typeof setTimeout>;
  });
  t.mock.method(globalThis, "clearTimeout", function (this: unknown) {
    assert.ok(this === undefined || this === globalThis, "browser cancellation received an invalid object");
    cancelled += 1;
  });
  const states: RecommendationClientState[] = [];
  const controller = new ContextualRecommendationController({
    cooldownMs: 0, coalesceMs: 0,
    onChange: (state) => states.push(state),
    request: async (request) => result(request.contextVersion),
  });
  controller.update({ conversationId: "synthetic", contextVersion: "first", enabled: true, locale: "ar" });
  await flush();
  assert.equal(scheduled, 1);
  assert.equal(cancelled, 1);
  assert.equal(states.at(-1)?.phase, "ready");
  controller.dispose();
});
