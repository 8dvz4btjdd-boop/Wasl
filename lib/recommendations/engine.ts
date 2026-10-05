import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { extractIntent, CONCEPTS, type Intent } from "./concepts";
import { RECOMMENDATION_LIMITS, paidResearchAllowed } from "./config";
import { SOURCES, findSourceForUrl, sourceDomains } from "./sources";
import { retrieveReleased, validateReleased } from "./library";
import { chooseNeed } from "./triggers";
import { fetchOriginalSource, sourceLookupUrl, type OriginalSourceResult } from "./fetch-source";
import { originalSourceCache } from "./source-cache";
import { getProviderBudget } from "./budget";
import { retrieveWithProvider, refinePrivateIntent } from "./provider";
import type { AuthorizedRecommendationContext, RecommendationResult, RecommendationUsage, SourceRecommendation } from "./types";

export function emptyUsage(): RecommendationUsage {
  return { modelCalls:0,modelSteps:0,searches:0,fetches:0,inputTokens:0,outputTokens:0,
    cacheReadTokens:0,cacheWriteTokens:0,uncachedInputTokens:0,costEstimateUsd:0,elapsedMs:0,
    pricingVerified:false,providerReportedSearches:null,voiceCostUsd:0,codexDevelopmentCostIncluded:false };
}
function referenceSuggestions(ids: string[],concepts: string[]): SourceRecommendation[] {
  return ids.flatMap(id => {
    const source = SOURCES.find(s => s.id===id);
    if (!source) return [];
    const specific=sourceLookupUrl(concepts,id);
    return [{id:`source:${id}`,sourceId:id,title:specific ? "الْإِيمَان — معجم المصطلحات" : source.title,sourceUrl:specific ?? source.entryUrls[0],
      locator:"",bodyVerbatim:null,contentHash:null,review:"source_only" as const}];
  });
}

/** Redirects never inherit the requested URL's source identity or qualification.
 * Only the final original source in this intent's allowed sections can be quoted.
 */
export function materialFromOriginalSource(original: OriginalSourceResult, intent: Intent): SourceRecommendation | null {
  if (!original.ok) return null;
  const source=findSourceForUrl(original.url);
  if (!source || !intent.sources.includes(source.id) || ["hadith","quran","tafseer"].includes(source.id)
    || !original.locator || !original.bodyVerbatim || original.bodyVerbatim.length>RECOMMENDATION_LIMITS.maxExcerptChars
    || !intent.concepts.some(id=>CONCEPTS[id].terms.test(original.bodyVerbatim))) return null;
  return {id:createHash("sha256").update(original.url).digest("hex"),sourceId:source.id,title:original.title,
    sourceUrl:original.url,locator:original.locator,bodyVerbatim:original.bodyVerbatim,
    contentHash:createHash("sha256").update(original.bodyVerbatim).digest("hex"),review:"daee_evaluation_required"};
}

/** Shared engine for two displays. Private dialogue never enters external search tools.
 * Only original fetch payloads or previously released passages can carry religious text.
 */
export async function runRecommendations(context: AuthorizedRecommendationContext,
  options: {signal?:AbortSignal;requestId?:string} = {}): Promise<RecommendationResult> {
  const start=Date.now();
  const result:RecommendationResult={requestId:options.requestId ?? randomUUID(),contextVersion:context.contextVersion,
    status:"unavailable",reason:"no_eligible_material",materials:[],clarification:null,usage:emptyUsage(),generatedReligiousAnswer:false};
  const done = () => { result.usage.elapsedMs=Date.now()-start; return validateResult(result,context); };
  if (!context.aiEnabled) {result.status="disabled";result.reason="ai_disabled";return done();}
  const need=chooseNeed(context.messages);
  if (!need || need.id!==context.contextVersion) {result.status="unchanged";result.reason="no_new_need";return done();}
  if (context.messages.length>RECOMMENDATION_LIMITS.maxContextMessages || context.messages.reduce((n,m)=>n+m.body.length,0)>RECOMMENDATION_LIMITS.maxContextChars) {
    result.reason="context_limit";return done();
  }
  let intent=extractIntent(context.messages.filter(m=>m.sender_role==="asker" && m.created_at<=need.created_at));
  if (intent.personal) {result.status="refer";result.reason="personal_question";return done();}
  result.materials=retrieveReleased(intent,context.locale);
  if (result.materials.length) {result.status="sufficient";result.reason="released_material";return done();}
  const signal=options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(RECOMMENDATION_LIMITS.timeoutMs)]) : AbortSignal.timeout(RECOMMENDATION_LIMITS.timeoutMs);
  const fetchLimit=context.mode==="expand" ? RECOMMENDATION_LIMITS.expand.maxFetches : RECOMMENDATION_LIMITS.quick.maxFetches;
  const budget=getProviderBudget(result.requestId,context.mode);
  if (paidResearchAllowed() && budget.readiness()===null && process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL_FAST) {
    const privateIntent=await refinePrivateIntent(context.messages,{budget,signal,requestId:result.requestId},
      {orgId:context.orgId,actorId:context.actorId,conversationId:context.conversationId});
    result.usage=privateIntent.usage;
    if (privateIntent.ok) {
      intent={concepts:privateIntent.concepts,personal:privateIntent.personal,ambiguous:privateIntent.ambiguous,
        query:privateIntent.concepts.length ? privateIntent.concepts.map(id=>CONCEPTS[id].query).join("؛ ") : null,
        sources:[...new Set(privateIntent.concepts.flatMap(id=>[...CONCEPTS[id].sources]))].slice(0,2)};
      if (intent.personal) {result.status="refer";result.reason="personal_question";return done();}
      result.materials=retrieveReleased(intent,context.locale);
      if (result.materials.length) {result.status="sufficient";result.reason="released_material";return done();}
    } else result.reason=privateIntent.reason;
  }
  if (intent.ambiguous || !intent.query) {result.status="needs_clarification";result.reason="unclear_intent";result.clarification="specific_question";return done();}
  result.materials=referenceSuggestions(intent.sources,intent.concepts);
  if (paidResearchAllowed()) {
    const fetched=await retrieveWithProvider(intent.query,{sourceDomains:sourceDomains(intent.sources),signal,requestId:result.requestId,budget},
      {orgId:context.orgId,actorId:context.actorId,conversationId:context.conversationId});
    result.usage=fetched.usage;
    if (fetched.ok && context.audience==="daee") {
      result.materials=[];
      for (const source of fetched.sources) {
        const registered=findSourceForUrl(source.url);
        if (!registered || !intent.sources.includes(registered.id)) continue;
        const suggestion:SourceRecommendation={id:createHash("sha256").update(source.url).digest("hex"),sourceId:registered.id,title:source.title,
          sourceUrl:source.url,locator:"",bodyVerbatim:null,contentHash:null,review:"source_only"};
        // A provider's flattened document can include comments or omit edition/grade
        // metadata. It is discovery evidence, not blanket passage qualification.
        if (["hadith","quran","tafseer"].includes(registered.id) || result.usage.fetches>=fetchLimit) {
          result.materials.push(suggestion);continue;
        }
        result.usage.fetches+=1;
        const original=await fetchOriginalSource(source.url,{signal});
        const material=materialFromOriginalSource(original,intent);
        if (original.ok && material) {
          result.materials.push(material);
          originalSourceCache.put(original.url,original);
          break;
        }
        result.materials.push(suggestion);
      }
      result.reason="source_needs_evaluation";
    } else result.reason=fetched.ok ? "asker_release_required" : fetched.reason;
  } else {
    result.reason=context.mode==="expand" ? "paid_research_disabled" : "source_suggestions_only";
  }
    // Free, single-source fallback is explicit runtime configuration; never a site sweep.
    if (process.env.WASL_RECOMMENDATIONS_FREE_FETCH === "true" && context.audience==="daee" &&
      result.materials.every(m=>!m.bodyVerbatim) && result.usage.fetches<fetchLimit) {
      const candidate=result.materials.find(s=>sourceLookupUrl(intent.concepts,s.sourceId)!==null);
      if (candidate) {
        const url=sourceLookupUrl(intent.concepts,candidate.sourceId)!;
        const cached=originalSourceCache.get(url);
        if (!cached) result.usage.fetches+=1;
        const original=cached ?? await fetchOriginalSource(url,{signal});
        const material=materialFromOriginalSource(original,intent);
        if (original.ok && material) {
          if (!cached) originalSourceCache.put(original.url,original);
          result.materials=[material];
          result.reason="source_needs_evaluation";
        } else result.reason=original.ok ? "insufficient_source" : original.reason;
      }
    }
  // Fresh material still requires scientific evaluation; a keyword match is not completeness.
  result.status=result.materials.length ? "partial" : "unavailable";
  return done();
}

/** Re-run source, audience and current release checks even for durable cache hits. */
export function validateResult(result:RecommendationResult,context:AuthorizedRecommendationContext):RecommendationResult {
  if (!context.aiEnabled) return {...result,status:"disabled",reason:"ai_disabled",materials:[],clarification:null};
  if (result.contextVersion!==context.contextVersion) return {...result,status:"unchanged",reason:"stale_context",materials:[],clarification:null};
  const materials=result.materials.filter(m=> {
    const source=findSourceForUrl(m.sourceUrl);
    if (!source || source.id!==m.sourceId) return false;
    if (m.bodyVerbatim===null) return m.review==="source_only" && m.contentHash===null;
    if (!m.bodyVerbatim || m.bodyVerbatim.length>RECOMMENDATION_LIMITS.maxExcerptChars || !m.locator ||
      createHash("sha256").update(m.bodyVerbatim).digest("hex")!==m.contentHash) return false;
    if (m.review==="released") return validateReleased(m);
    if (["hadith","quran","tafseer"].includes(source.id)) return false; // Edition/grade qualification required before quoting.
    return context.audience==="daee" && m.review==="daee_evaluation_required";
  });
  if (materials.length!==result.materials.length) return {...result,status:"unavailable",reason:"material_validation",materials:[],generatedReligiousAnswer:false};
  return {...result,materials,generatedReligiousAnswer:false};
}
