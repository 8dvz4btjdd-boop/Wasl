import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import type { Database, Json } from "@/lib/db/types";
import { requiresTrustedRecommendationReceipt, type RecommendationClaim, type RecommendationConversation, type RecommendationSegment } from "@/lib/recommendations/access";
import type { AuthorizedRecommendationContext, RecommendationAudience, RecommendationResult } from "@/lib/recommendations/types";

// Overlay the new private RPCs and trusted receipt until the reviewed db:types run.
// This does not grant the browser a new table or function privilege.
type Messages = Database["public"]["Tables"]["messages"];
type RecommendationDatabase = Omit<Database, "public"> & { public: Omit<Database["public"], "Functions" | "Tables"> & {
  Tables: Omit<Database["public"]["Tables"], "messages"> & { messages: Omit<Messages, "Row"> & { Row: Messages["Row"] & { received_at: string | null } } };
  Functions: Database["public"]["Functions"] & {
  recommendation_claim: { Args: { p_conversation: string; p_audience: string; p_actor: string; p_context: string; p_mode: string; p_locale: string }; Returns: Json };
  recommendation_finish: { Args: { p_request: string; p_result: Json; p_usage: Json }; Returns: boolean };
  recommendation_reserve_budget: { Args: { p_request: string; p_org: string; p_amount: number; p_total_limit: number }; Returns: boolean };
} } };
const service = () => createServiceClient() as unknown as SupabaseClient<RecommendationDatabase>;

export async function readRecommendationConversation(id: string): Promise<RecommendationConversation | null> {
  const db = await createClient();
  const { data, error } = await db.from("conversations")
    .select("id, org_id, asker_id, daee_id, status, created_at, assigned_at, started_at, previous_conversation_id")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("recommendation_conversation_unavailable");
  return data;
}

export async function readRecommendationSegment(conversation: RecommendationConversation, audience: RecommendationAudience): Promise<RecommendationSegment> {
  const db = await createClient() as unknown as SupabaseClient<RecommendationDatabase>;
  const start = audience === "daee" ? conversation.assigned_at! : conversation.created_at;
  // Only metadata uses service role. Conversation bodies are always read via RLS.
  let transferred = false;
  if (audience === "daee") {
    const serviceDb = createServiceClient();
    const [transfers, routes] = await Promise.all([
      serviceDb.from("transfers").select("id", { count: "exact", head: true })
        .eq("conversation_id", conversation.id).eq("status", "accepted"),
      conversation.started_at !== null ? serviceDb.from("events").select("id", { count: "exact", head: true })
        .eq("org_id", conversation.org_id).eq("conversation_id", conversation.id).eq("type", "routed")
        : Promise.resolve({ count: null, error: null }),
    ]);
    if (transfers.error || routes.error) throw new Error("recommendation_segment_unavailable");
    transferred = requiresTrustedRecommendationReceipt(transfers.count, conversation.started_at, routes.count);
  }
  let messageQuery = db.from("messages").select("id, body, sender_role, sender_id, created_at, received_at")
    .eq("conversation_id", conversation.id).in("sender_role", audience === "asker" ? ["asker"] : ["asker", "daee"]);
  messageQuery = transferred ? messageQuery.gte("received_at", start).order("received_at", { ascending: false })
    : messageQuery.or(`received_at.gte.${start},and(received_at.is.null,created_at.gte.${start})`)
      .order("received_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const [messages, humans] = await Promise.all([
    messageQuery.limit(30),
    audience === "asker" ? db.from("messages").select("id", { count: "exact", head: true })
      .eq("conversation_id", conversation.id).eq("sender_role", "daee") : Promise.resolve({ count: 0, error: null }),
  ]);
  if (messages.error || humans.error) throw new Error("recommendation_messages_unavailable");
  const rows = messages.data ?? [];
  const preAssignmentMessageIds: string[] = [];
  if (audience === "daee" && !transferred) {
    // First assignment may include current-conversation waiting corrections. No archive
    // or previous daee message is queried, and legacy rows do not gain invented receipts.
    const waiting = await db.from("messages").select("id, body, sender_role, sender_id, created_at, received_at")
      .eq("conversation_id", conversation.id).eq("sender_id", conversation.asker_id)
      .eq("sender_role", "asker")
      .or(`and(received_at.gte.${conversation.created_at},received_at.lt.${conversation.assigned_at}),and(received_at.is.null,created_at.gte.${conversation.created_at},created_at.lt.${conversation.assigned_at})`)
      .order("received_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(30);
    if (waiting.error) throw new Error("recommendation_waiting_context_unavailable");
    for (const message of waiting.data ?? []) {
      preAssignmentMessageIds.push(message.id);
      rows.push(message);
    }
  }
  return { messages: rows, preAssignmentMessageIds, hasHumanMessage: (humans.count ?? 0) > 0, requiresTrustedReceipt: transferred };
}

export async function recommendationAIEnabled(orgId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().from("organizations").select("ai_enabled").eq("id", orgId).maybeSingle();
  if (error) throw new Error("recommendation_switch_unavailable");
  return data?.ai_enabled === true;
}

export async function claimRecommendation(context: AuthorizedRecommendationContext): Promise<RecommendationClaim> {
  const { data, error } = await service().rpc("recommendation_claim", {
    p_conversation: context.conversationId, p_audience: context.audience,
    p_actor: context.actorId, p_context: context.contextVersion,
    p_mode: context.mode, p_locale: context.locale,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("recommendation_ledger_unavailable");
  const row = data as Record<string, Json | undefined>;
  if (row.state === "start" && typeof row.requestId === "string") return { state: "start", requestId: row.requestId };
  if ((row.state === "running" || row.state === "cooldown") && typeof row.retryAfterMs === "number") return { state: row.state, retryAfterMs: Math.max(1, row.retryAfterMs) };
  if (row.state === "cached" && typeof row.requestId === "string" && typeof row.actorId === "string" && typeof row.contextVersion === "string" && (row.audience === "asker" || row.audience === "daee") && row.result && typeof row.result === "object" && !Array.isArray(row.result)) {
    return { state: "cached", requestId: row.requestId, result: row.result as unknown as RecommendationResult, actorId: row.actorId, contextVersion: row.contextVersion, audience: row.audience };
  }
  throw new Error("recommendation_ledger_invalid");
}

export async function finishRecommendation(requestId: string, result: RecommendationResult | null, usage: RecommendationResult["usage"] | null): Promise<void> {
  const { data, error } = await service().rpc("recommendation_finish", {
    p_request: requestId, p_result: result as unknown as Json,
    p_usage: usage as unknown as Json,
  });
  if (error || data !== true) throw new Error("recommendation_ledger_finish_failed");
}

/** A conservative, immutable reservation against the approved global test allowance.
 * This is an upper bound, separate from provider-reported actual token/tool usage.
 * Missing migration, wrong actor/job/org, or an exhausted allowance all fail closed.
 */
export async function reserveRecommendationBudget(requestId: string, orgId: string, amount: number, totalLimit: number): Promise<boolean> {
  if (!Number.isFinite(amount) || !Number.isFinite(totalLimit) || amount <= 0 || totalLimit <= 0) return false;
  const { data, error } = await service().rpc("recommendation_reserve_budget", {
    p_request: requestId, p_org: orgId, p_amount: amount, p_total_limit: Math.min(totalLimit, 5),
  });
  return !error && data === true;
}
