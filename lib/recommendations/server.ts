import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAsker, getSessionUser, getStaff } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { routing } from "@/i18n/routing";
import { claimRecommendation, finishRecommendation, readRecommendationConversation, readRecommendationSegment, recommendationAIEnabled } from "@/lib/db/queries/recommendations";
import { authorizeRecommendation, isSameRecommendationOrigin, orchestrateRecommendations, type AccessDependencies } from "./access";
import { chooseNeed } from "./triggers";
import { runRecommendations, validateResult } from "./engine";
import type { AuthorizedRecommendationContext, RecommendationAudience, RecommendationResult, RecommendationUsage } from "./types";

const Body = z.object({
  conversationId: z.uuid(), contextVersion: z.string().min(1).max(256),
  mode: z.enum(["automatic", "refresh", "expand"]), locale: z.enum(routing.locales),
  confirmedTranscript: z.boolean().optional(),
}).strict();

async function readSmallBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 12_000) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export function disabledRecommendation(context: AuthorizedRecommendationContext): RecommendationResult {
  const usage: RecommendationUsage = {
    modelCalls: 0, modelSteps: 0, searches: 0, fetches: 0, inputTokens: 0,
    outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, uncachedInputTokens: 0,
    costEstimateUsd: 0, elapsedMs: 0, pricingVerified: false,
    providerReportedSearches: null, voiceCostUsd: 0, codexDevelopmentCostIncluded: false,
  };
  return { requestId: randomUUID(), contextVersion: context.contextVersion,
    status: "disabled", reason: "ai_disabled", materials: [], clarification: null,
    usage, generatedReligiousAnswer: false };
}

function dependencies(audience: RecommendationAudience): AccessDependencies {
  return {
    async identity() {
      const [user, asker, staff] = await Promise.all([getSessionUser(), getAsker(), getStaff()]);
      if (!user) return null;
      // React's DAL cache is useful within pages, but authorization after await must
      // notice a revoked/changed role rather than reuse the initial cached profile.
      const db = await createClient();
      const currentUser = await db.auth.getUser();
      if (currentUser.error || currentUser.data.user?.id !== user.id) return null;
      const current = audience === "asker"
        ? await db.from("askers").select("user_id").eq("user_id", user.id).maybeSingle()
        : await db.from("profiles").select("user_id, role").eq("user_id", user.id).maybeSingle();
      if (current.error || !current.data) return null;
      const currentRole = "role" in current.data && (current.data.role === "daee" || current.data.role === "admin") ? current.data.role : null;
      if (audience === "asker" && asker?.user_id !== current.data.user_id) return null;
      if (audience === "daee" && (!staff || staff.role !== currentRole)) return null;
      return { userId: user.id, anonymous: currentUser.data.user.is_anonymous === true,
        askerId: audience === "asker" ? current.data.user_id : null,
        staffId: audience === "daee" ? current.data.user_id : null,
        staffRole: audience === "daee" ? currentRole : null };
    },
    async activeStaff() {
      const db = await createClient();
      const { data, error } = await db.rpc("me_active");
      return !error && data === true;
    },
    conversation: readRecommendationConversation,
    segment: readRecommendationSegment,
    aiEnabled: recommendationAIEnabled,
    chooseNeed,
  };
}

/** Fixed asker/daee routes only; neither role nor message bodies are accepted from a browser.
 * Durable RPCs fail closed when migration 0011 has not been reviewed/applied.
 */
export async function recommendationPOST(request: Request, audience: RecommendationAudience): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!isSameRecommendationOrigin(request.url, origin, request.headers.get("host"))) return Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (Number(request.headers.get("content-length")) > 12_000) return Response.json({ error: "bad_request" }, { status: 400 });
  const text = await readSmallBody(request);
  if (text === null) return Response.json({ error: "bad_request" }, { status: 400 });
  let value: unknown;
  try { value = JSON.parse(text); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  const parsed = Body.safeParse(value);
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const deps = dependencies(audience);
  try {
    const result = await orchestrateRecommendations({
      authorize: () => authorizeRecommendation(deps, audience, parsed.data),
      claim: claimRecommendation, run: runRecommendations, validate: validateResult,
      finish: finishRecommendation, disabled: disabledRecommendation,
    }, request.signal);
    const retryAfterMs = "retryAfterMs" in result.body ? result.body.retryAfterMs : undefined;
    return Response.json(result.body, { status: result.status,
      headers: { "Cache-Control": "no-store, private", ...(retryAfterMs ? { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } : {}) } });
  } catch {
    // Do not print SDK errors: URLs/requests can contain private content or credentials.
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store, private" } });
  }
}
