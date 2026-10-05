import type { AuthorizedRecommendationContext, ContextMessage, RecommendationAudience, RecommendationRequest, RecommendationResult } from "./types";

export type RecommendationIdentity = {
  userId: string; anonymous: boolean; askerId: string | null;
  staffRole: "admin" | "daee" | null; staffId: string | null;
};
export type RecommendationConversation = {
  id: string; org_id: string; asker_id: string; daee_id: string | null;
  status: string; created_at: string; assigned_at: string | null;
  started_at: string | null; previous_conversation_id: string | null;
};
export type RecommendationSegment = { messages: ContextMessage[]; preAssignmentMessageIds: string[]; hasHumanMessage: boolean; requiresTrustedReceipt?: boolean };
export type AccessDependencies = {
  identity(): Promise<RecommendationIdentity | null>;
  activeStaff(): Promise<boolean>;
  conversation(id: string): Promise<RecommendationConversation | null>;
  segment(conversation: RecommendationConversation, audience: RecommendationAudience): Promise<RecommendationSegment>;
  aiEnabled(orgId: string): Promise<boolean>;
  chooseNeed(messages: ContextMessage[]): ContextMessage | null;
};
export type AccessResult = { ok: true; context: AuthorizedRecommendationContext } | { ok: false; error: "forbidden" | "stale" | "no_need" };

/** Requeue/deactivation can assign a different daee without an accepted transfer.
 * Once human dialogue started, only one recorded assignment proves the initial segment.
 * Missing or repeated assignment evidence therefore cannot grant pre-assignment context.
 */
export function requiresTrustedRecommendationReceipt(acceptedTransfers: number | null, startedAt: string | null, routedAssignments: number | null): boolean {
  return acceptedTransfers === null || acceptedTransfers > 0 || startedAt !== null && routedAssignments !== 1;
}

/** Next dev can canonicalize request.url to localhost while the browser uses its
 * real Host (127.0.0.1). Compare the browser origin with that Host and URL scheme.
 * Never trust arbitrary X-Forwarded-Host, cross-origin callers, or a null origin.
 */
export function isSameRecommendationOrigin(requestUrl: string, origin: string | null, host: string | null): boolean {
  if (origin === null) return true; // Non-browser authenticated clients still need DAL access.
  try {
    const caller = new URL(origin);
    const request = new URL(requestUrl);
    if (!["https:", "http:"].includes(caller.protocol) || caller.origin !== origin || caller.protocol !== request.protocol) return false;
    if (!host) return caller.origin === request.origin;
    if (/[\s/@\\?#]/u.test(host)) return false;
    const publicUrl = new URL(`${request.protocol}//${host}`);
    return caller.host === publicUrl.host;
  } catch { return false; }
}

/** Every request, including a cache hit, builds its identity from the authenticated DAL.
 * The browser cannot grant itself an audience, a message selection, or an old segment.
 */
export async function authorizeRecommendation(deps: AccessDependencies, audience: RecommendationAudience, input: RecommendationRequest): Promise<AccessResult> {
  const identity = await deps.identity();
  if (!identity) return { ok: false, error: "forbidden" };
  if (audience === "asker" ? identity.askerId !== identity.userId : identity.anonymous || identity.staffRole !== "daee" || identity.staffId !== identity.userId) {
    return { ok: false, error: "forbidden" };
  }
  if (audience === "daee" && !await deps.activeStaff()) return { ok: false, error: "forbidden" };
  const conversation = await deps.conversation(input.conversationId);
  if (!conversation || conversation.id !== input.conversationId) return { ok: false, error: "forbidden" };
  if (audience === "asker") {
    if (conversation.asker_id !== identity.userId || conversation.status !== "waiting" || conversation.started_at !== null) return { ok: false, error: "forbidden" };
  } else if (conversation.daee_id !== identity.userId || !conversation.assigned_at || !["waiting", "active"].includes(conversation.status)) {
    return { ok: false, error: "forbidden" };
  }
  const enabled = await deps.aiEnabled(conversation.org_id);
  // No conversation body is needed merely to tell an authorized participant that AI is off.
  if (!enabled) return { ok: true, context: {
    conversationId: conversation.id, contextVersion: input.contextVersion,
    orgId: conversation.org_id, actorId: identity.userId, audience,
    locale: input.locale, messages: [], aiEnabled: false,
    status: conversation.status as "waiting" | "active", mode: input.mode,
  } };
  const segment = await deps.segment(conversation, audience);
  if (audience === "asker" && segment.hasHumanMessage) return { ok: false, error: "forbidden" };
  const start = Date.parse(audience === "daee" ? conversation.assigned_at! : conversation.created_at);
  const permitted = segment.messages.filter((message) => {
    if (message.sender_role === "asker" ? message.sender_id !== conversation.asker_id : message.sender_role !== "daee" || message.sender_id !== conversation.daee_id) return false;
    if (audience === "asker" && message.sender_role !== "asker") return false;
    // received_at is immutable and set by the DB, unlike client-insertable created_at.
    // Existing rows were deliberately not backfilled with an invented receipt time.
    if (segment.requiresTrustedReceipt && !message.received_at) return false;
    const at = Date.parse(message.received_at ?? message.created_at);
    return Number.isFinite(at) && (at >= start || message.sender_role === "asker"
      && !segment.requiresTrustedReceipt && segment.preAssignmentMessageIds.includes(message.id) && at >= Date.parse(conversation.created_at));
  }).map((message) => ({ ...message, created_at: message.received_at ?? message.created_at }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const need = deps.chooseNeed(permitted);
  if (!need) return { ok: false, error: "no_need" };
  if (need.id !== input.contextVersion) return { ok: false, error: "stale" };
  // Preserve whole messages and negation. Drop older context instead of truncating a clause.
  const untilNeed = permitted.filter((message) => message.created_at <= need.created_at);
  const messages: ContextMessage[] = [];
  let chars = 0;
  for (const message of untilNeed.slice().reverse()) {
    if (message.body.length > 8_000 || chars + message.body.length > 8_000 || messages.length >= 6) continue;
    messages.unshift(message);
    chars += message.body.length;
  }
  if (!messages.some((message) => message.id === need.id)) return { ok: false, error: "no_need" };
  return { ok: true, context: {
    conversationId: conversation.id, contextVersion: need.id, orgId: conversation.org_id,
    actorId: identity.userId, audience, locale: input.locale, messages,
    aiEnabled: true, status: conversation.status as "waiting" | "active", mode: input.mode,
  } };
}

export type RecommendationClaim =
  | { state: "start"; requestId: string }
  | { state: "cached"; requestId: string; result: RecommendationResult; actorId: string; contextVersion: string; audience: RecommendationAudience }
  | { state: "running"; retryAfterMs: number }
  | { state: "cooldown"; retryAfterMs: number };
export type RecommendationResponse = { status: number; body: RecommendationResult | { error: string; retryAfterMs?: number } };
export type OrchestrationDependencies = {
  authorize(): Promise<AccessResult>;
  claim(context: AuthorizedRecommendationContext): Promise<RecommendationClaim>;
  run(context: AuthorizedRecommendationContext, options: { signal?: AbortSignal; requestId: string }): Promise<RecommendationResult>;
  validate(result: RecommendationResult, context: AuthorizedRecommendationContext): RecommendationResult;
  finish(requestId: string, result: RecommendationResult | null, usage: RecommendationResult["usage"] | null): Promise<void>;
  disabled(context: AuthorizedRecommendationContext): RecommendationResult;
};

const denied = (error: "forbidden" | "stale" | "no_need"): RecommendationResponse => ({ status: error === "stale" ? 409 : error === "no_need" ? 422 : 403, body: { error } });

/** Access and current release policy are rechecked after asynchronous work and on hits.
 * Jobs retain one identity across retries; a failed request cannot reset a paid budget.
 */
export async function orchestrateRecommendations(deps: OrchestrationDependencies, signal?: AbortSignal): Promise<RecommendationResponse> {
  const access = await deps.authorize();
  if (!access.ok) return denied(access.error);
  const context = access.context;
  if (!context.aiEnabled) return { status: 200, body: deps.disabled(context) };
  if (signal?.aborted) return { status: 409, body: { error: "stale" } };
  const claim = await deps.claim(context);
  if (claim.state === "running" || claim.state === "cooldown") return { status: 429, body: { error: claim.state, retryAfterMs: claim.retryAfterMs } };
  if (claim.state === "cached") {
    if (claim.actorId !== context.actorId || claim.contextVersion !== context.contextVersion || claim.audience !== context.audience) return denied("forbidden");
    const current = await deps.authorize();
    if (!current.ok) return denied(current.error);
    if (!current.context.aiEnabled) return { status: 200, body: deps.disabled(current.context) };
    if (signal?.aborted) return { status: 409, body: { error: "stale" } };
    return { status: 200, body: deps.validate(claim.result, current.context) };
  }
  let result: RecommendationResult | null = null;
  try {
    result = await deps.run(context, { signal, requestId: claim.requestId });
    const current = await deps.authorize();
    if (!current.ok || !current.context.aiEnabled || signal?.aborted) {
      await deps.finish(claim.requestId, null, result.usage);
      return !current.ok ? denied(current.error) : !current.context.aiEnabled ? { status: 200, body: deps.disabled(current.context) } : { status: 409, body: { error: "stale" } };
    }
    const validated = deps.validate(result, current.context);
    await deps.finish(claim.requestId, validated, result.usage);
    return { status: 200, body: validated };
  } catch {
    await deps.finish(claim.requestId, null, result?.usage ?? null).catch(() => undefined);
    return { status: 503, body: { error: "unavailable" } };
  }
}
