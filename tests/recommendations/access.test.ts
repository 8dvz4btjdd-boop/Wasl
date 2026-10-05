import { strict as assert } from "node:assert";
import test from "node:test";
import { authorizeRecommendation, isSameRecommendationOrigin, requiresTrustedRecommendationReceipt, type AccessDependencies, type RecommendationConversation, type RecommendationIdentity, type RecommendationSegment } from "../../lib/recommendations/access";
import type { ContextMessage, RecommendationRequest } from "../../lib/recommendations/types";

// Synthetic operational text; this suite proves access boundaries, not scientific quality.
const question: ContextMessage = { id: "need-1", body: "Explain this source", sender_role: "asker", sender_id: "asker", created_at: "2026-10-05T10:01:00Z" };
const conversation: RecommendationConversation = {
  id: "conversation", org_id: "organization", asker_id: "asker", daee_id: "daee",
  status: "waiting", created_at: "2026-10-05T10:00:00Z", assigned_at: "2026-10-05T10:00:30Z",
  started_at: null, previous_conversation_id: null,
};
const input: RecommendationRequest = { conversationId: "conversation", contextVersion: question.id, mode: "automatic", locale: "ar" };
function dependencies(overrides: Partial<AccessDependencies> = {}): AccessDependencies & { reads: { bodies: number; conversation: number } } {
  const reads = { bodies: 0, conversation: 0 };
  const identity: RecommendationIdentity = { userId: "daee", anonymous: false, askerId: null, staffRole: "daee", staffId: "daee" };
  const segment: RecommendationSegment = { messages: [question], preAssignmentMessageIds: [], hasHumanMessage: false };
  return { reads, identity: async () => identity, activeStaff: async () => true,
    conversation: async () => { reads.conversation++; return conversation; },
    segment: async () => { reads.bodies++; return segment; }, aiEnabled: async () => true,
    chooseNeed: (messages) => messages.filter((message) => message.sender_role === "asker").at(-1) ?? null,
    ...overrides };
}

test("browser origin uses actual Host despite Next dev's localhost URL", () => {
  assert.equal(isSameRecommendationOrigin("http://localhost:3060/api/recommendations/asker", "http://127.0.0.1:3060", "127.0.0.1:3060"), true);
  assert.equal(isSameRecommendationOrigin("https://internal.invalid/api/recommendations/asker", "https://wasl.example", "wasl.example"), true);
  assert.equal(isSameRecommendationOrigin("https://internal.invalid/api/recommendations/asker", "https://wasl.example", "wasl.example:443"), true);
  for (const origin of ["https://attacker.example", "http://wasl.example", "null", "https://user:pass@wasl.example", "https://wasl.example/", "https://wasl.example.attacker.example"]) {
    assert.equal(isSameRecommendationOrigin("https://internal.invalid/api/recommendations/asker", origin, "wasl.example"), false, origin);
  }
  assert.equal(isSameRecommendationOrigin("https://wasl.example/api/recommendations/asker", "https://attacker.example", "wasl.example"), false);
  assert.equal(isSameRecommendationOrigin("https://wasl.example/api/recommendations/asker", null, "wasl.example"), true);
});
test("human requeue without an accepted transfer still requires a current trusted receipt", () => {
  const started = "2026-10-05T10:01:00Z";
  assert.equal(requiresTrustedRecommendationReceipt(0, started, 1), false);
  assert.equal(requiresTrustedRecommendationReceipt(0, started, 2), true);
  assert.equal(requiresTrustedRecommendationReceipt(0, started, 0), true);
  assert.equal(requiresTrustedRecommendationReceipt(0, started, null), true);
  assert.equal(requiresTrustedRecommendationReceipt(1, started, 1), true);
});
test("rerouting an initial waiting question keeps its corrections; unknown transfer evidence fails closed", () => {
  assert.equal(requiresTrustedRecommendationReceipt(0, null, 2), false);
  assert.equal(requiresTrustedRecommendationReceipt(0, null, null), false);
  assert.equal(requiresTrustedRecommendationReceipt(1, null, 1), true);
  assert.equal(requiresTrustedRecommendationReceipt(null, null, 1), true);
});

test("assigned active daee obtains only authorized current conversation messages", async () => {
  const result = await authorizeRecommendation(dependencies(), "daee", input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.context.messages, [question]);
});
test("admin is rejected before any conversation body read", async () => {
  const deps = dependencies({ identity: async () => ({ userId: "admin", anonymous: false, askerId: null, staffId: "admin", staffRole: "admin" }) });
  assert.deepEqual(await authorizeRecommendation(deps, "daee", input), { ok: false, error: "forbidden" });
  assert.deepEqual(deps.reads, { bodies: 0, conversation: 0 });
});
test("unassigned daee and anonymous staff cannot obtain recommendations", async () => {
  const other = dependencies({ conversation: async () => ({ ...conversation, daee_id: "someone-else" }) });
  assert.equal((await authorizeRecommendation(other, "daee", input)).ok, false);
  assert.equal(other.reads.bodies, 0);
  const anonymous = dependencies({ identity: async () => ({ userId: "daee", anonymous: true, askerId: null, staffId: "daee", staffRole: "daee" }) });
  assert.equal((await authorizeRecommendation(anonymous, "daee", input)).ok, false);
  assert.equal(anonymous.reads.bodies, 0);
});
test("banned/deactivated daee is rejected before content read", async () => {
  const deps = dependencies({ activeStaff: async () => false });
  assert.equal((await authorizeRecommendation(deps, "daee", input)).ok, false);
  assert.equal(deps.reads.bodies, 0);
});
test("current assignment cutoff excludes previous segment, foreign senders and system text", async () => {
  const old = { ...question, id: "old-secret", body: "UNSELECTED OLD SECRET", created_at: "2026-10-05T10:00:10Z" };
  const foreign = { ...question, id: "foreign-secret", sender_id: "stranger", created_at: "2026-10-05T10:03:00Z" };
  const system = { ...question, id: "system", sender_role: "system", created_at: "2026-10-05T10:04:00Z" };
  const deps = dependencies({ segment: async () => ({ messages: [old, question, foreign, system], preAssignmentMessageIds: [], hasHumanMessage: false }) });
  const result = await authorizeRecommendation(deps, "daee", input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.context.messages.map((m) => m.id), [question.id]);
});
test("explicit current-conversation initial question is allowed on first assignment, including a return", async () => {
  const initial = { ...question, created_at: "2026-10-05T10:00:10Z" };
  const deps = dependencies({ conversation: async () => ({ ...conversation, previous_conversation_id: "previous-never-read" }),
    segment: async () => ({ messages: [initial], preAssignmentMessageIds: [initial.id], hasHumanMessage: false }) });
  const result = await authorizeRecommendation(deps, "daee", input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.context.messages, [initial]);
});
test("first assignment preserves a waiting correction rather than reverting to the initial topic", async () => {
  const original = { ...question, id: "prayer-need", body: "كيف الصلاة؟", created_at: "2026-10-05T10:00:10Z" };
  const correction = { ...question, id: "faith-correction", body: "لا أقصد الصلاة، أقصد معنى الإيمان", created_at: "2026-10-05T10:00:20Z" };
  for (const previous of [null, "old-archive-never-read"]) {
    const deps = dependencies({ conversation: async () => ({ ...conversation, previous_conversation_id: previous }),
      segment: async () => ({ messages: [original, correction], preAssignmentMessageIds: [original.id, correction.id], hasHumanMessage: false }) });
    const result = await authorizeRecommendation(deps, "daee", { ...input, contextVersion: correction.id });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.context.contextVersion, correction.id);
      assert.deepEqual(result.context.messages, [original, correction]);
    }
    assert.deepEqual(await authorizeRecommendation(deps, "daee", { ...input, contextVersion: original.id }), { ok: false, error: "stale" });
  }
});
test("transferred segment excludes all pre-assignment corrections even when they are in the same conversation", async () => {
  const oldCorrection = { ...question, id: "before-transfer", body: "A prior private correction", created_at: "2026-10-05T10:00:20Z" };
  const deps = dependencies({ segment: async () => ({ messages: [oldCorrection, question], preAssignmentMessageIds: [], hasHumanMessage: false }) });
  const result = await authorizeRecommendation(deps, "daee", input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.context.messages, [question]);
});
test("transfer scope uses immutable receipt, rejects legacy/future-dated archive and accepts a newly received backdated question", async () => {
  const old = { ...question, id: "old-future-date", body: "Unshared old context", created_at: "2099-01-01T00:00:00Z", received_at: "2026-10-05T10:00:20Z" };
  const legacy = { ...old, id: "legacy-no-receipt", received_at: null };
  const current = { ...question, id: "current-receipt", created_at: "2000-01-01T00:00:00Z", received_at: "2026-10-05T10:01:00Z" };
  const deps = dependencies({ segment: async () => ({ messages: [old, legacy, current], preAssignmentMessageIds: [old.id, legacy.id], hasHumanMessage: false, requiresTrustedReceipt: true }) });
  const result = await authorizeRecommendation(deps, "daee", { ...input, contextVersion: current.id });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.context.messages.map((m) => m.id), [current.id]);
    assert.equal(result.context.messages[0].created_at, current.received_at);
  }
});
test("transferred legacy-only context fails closed until a fresh current-segment question", async () => {
  const legacy = { ...question, received_at: null };
  const deps = dependencies({ segment: async () => ({ messages: [legacy], preAssignmentMessageIds: [legacy.id], hasHumanMessage: false, requiresTrustedReceipt: true }) });
  assert.deepEqual(await authorizeRecommendation(deps, "daee", input), { ok: false, error: "no_need" });
});
test("stale need is rejected rather than exposing the previous response", async () => {
  const correction = { ...question, id: "need-2", body: "Correction: not the prior subject", created_at: "2026-10-05T10:02:00Z" };
  const deps = dependencies({ segment: async () => ({ messages: [question, correction], preAssignmentMessageIds: [], hasHumanMessage: false }) });
  assert.deepEqual(await authorizeRecommendation(deps, "daee", input), { ok: false, error: "stale" });
});
test("AI off returns metadata-only disabled context without reading messages", async () => {
  const deps = dependencies({ aiEnabled: async () => false });
  const result = await authorizeRecommendation(deps, "daee", input);
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.context.aiEnabled, false); assert.deepEqual(result.context.messages, []); }
  assert.equal(deps.reads.bodies, 0);
});
test("asker guide stops on first human message even if status is still waiting", async () => {
  const deps = dependencies({ identity: async () => ({ userId: "asker", anonymous: true, askerId: "asker", staffId: null, staffRole: null }),
    segment: async () => ({ messages: [question], preAssignmentMessageIds: [], hasHumanMessage: true }) });
  assert.deepEqual(await authorizeRecommendation(deps, "asker", input), { ok: false, error: "forbidden" });
});
test("different asker, active dialogue and ended conversation do not start guide work", async () => {
  for (const change of [{ asker_id: "different" }, { status: "active" }, { status: "ended" }, { started_at: "2026-10-05T10:02:00Z" }]) {
    const deps = dependencies({ identity: async () => ({ userId: "asker", anonymous: true, askerId: "asker", staffId: null, staffRole: null }),
      conversation: async () => ({ ...conversation, ...change }) });
    assert.equal((await authorizeRecommendation(deps, "asker", input)).ok, false);
    assert.equal(deps.reads.bodies, 0);
  }
});
test("only whole latest context fits max six messages/eight thousand characters", async () => {
  const messages = Array.from({ length: 9 }, (_, i) => ({ ...question, id: `need-${i}`, body: `Correction ${i}: not understood ` + "x".repeat(1200), created_at: `2026-10-05T10:0${i + 1}:00Z` }));
  const deps = dependencies({ segment: async () => ({ messages, preAssignmentMessageIds: [], hasHumanMessage: false }) });
  const result = await authorizeRecommendation(deps, "daee", { ...input, contextVersion: "need-8" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.context.messages.length <= 6);
    assert.ok(result.context.messages.reduce((sum, message) => sum + message.body.length, 0) <= 8000);
    assert.ok(result.context.messages.every((message) => message.body.startsWith("Correction") && message.body.endsWith("x".repeat(1200))));
  }
});
