import assert from "node:assert/strict";
import test from "node:test";
import { RecommendationBudget, loadVerifiedPricing, type RecommendationPricing } from "../../lib/recommendations/budget";

// Deliberately synthetic tariffs/context size, not Anthropic prices or human review.
const pricing: RecommendationPricing = { model:"synthetic-model",sourceUrl:"https://platform.claude.com/docs/en/about-claude/pricing",verifiedOn:"2026-10-05",reviewedBy:"synthetic-test-reviewer",
  contextWindowTokens:1_000,inputUsdPerMillion:1,outputUsdPerMillion:2,cacheReadUsdPerMillion:.1,cacheWriteUsdPerMillion:1.25,searchUsdPerThousand:10,fetchUsdPerThousand:0 };
function budget(limits={}) {return new RecommendationBudget({requestId:"synthetic-request",spendAllowed:true,pricing,limits:{maxCostUsd:1,...limits}});}
const usage={inputTokens:100,outputTokens:10,uncachedInputTokens:70,cacheReadTokens:20,cacheWriteTokens:10,searches:1,fetches:1,providerReportedSearches:1,providerReportedModelSteps:2};
test("zero spending remains disabled even with a price record",()=>assert.equal(new RecommendationBudget({requestId:"a",pricing}).readiness(),"spending_disabled"));
test("a key/spend flag cannot substitute for reviewed prices",()=>assert.equal(new RecommendationBudget({requestId:"a",spendAllowed:true,limits:{maxCostUsd:1}}).readiness(),"pricing_unverified"));
test("pricing loader fails closed for malformed, unknown rates or unofficial evidence",()=>{
  assert.equal(loadVerifiedPricing({WASL_RECOMMENDATIONS_PRICING_JSON:"{"}),null);
  assert.equal(loadVerifiedPricing({WASL_RECOMMENDATIONS_PRICING_JSON:JSON.stringify({...pricing,fetchUsdPerThousand:null})}),null);
  assert.equal(loadVerifiedPricing({WASL_RECOMMENDATIONS_PRICING_JSON:JSON.stringify({...pricing,sourceUrl:"https://example.invalid/pricing"})}),null);
});
test("native uses are reserved across retries and cannot be reset",()=>{
  const b=budget();const call=b.reserveCall(100,200,2,3,"synthetic-model");b.markUnknown(call);
  assert.equal(b.remainingSearches(),0);assert.equal(b.remainingFetches(),0);
  assert.throws(()=>b.reserveCall(100,200,1,0,"synthetic-model"),/tool_limit/);
  assert.equal(b.snapshot().costEstimateUsd,null);assert.equal(b.snapshot().usageKnown,false);
});
test("one active request cannot start overlapping paid calls",()=>{
  const b=budget();b.reserveCall(100,200,0,0,"synthetic-model");assert.throws(()=>b.reserveCall(100,200,0,0,"synthetic-model"),/request_running/);
});
test("private input uses bounded known bytes, not an entire context window",()=>{
  const b=new RecommendationBudget({requestId:"a",spendAllowed:true,pricing:{...pricing,contextWindowTokens:200_000},limits:{maxInputTokens:12_000,maxCostUsd:.15}});
  assert.doesNotThrow(()=>b.reserveCall(1_000,200,0,0,"synthetic-model"));
});
test("native context reservation refuses an unsupported 12k input cap",()=>{
  const b=new RecommendationBudget({requestId:"a",spendAllowed:true,pricing:{...pricing,contextWindowTokens:200_000},limits:{maxInputTokens:12_000,maxCostUsd:.15}});
  assert.throws(()=>b.reserveCall(100,200,2,3,"synthetic-model"),/input_token_limit/);
  assert.equal(b.snapshot().modelCalls,0);
});
test("all positive input/output/tool/call/step/time/cost limits are enforced before dispatch",()=>{
  assert.throws(()=>budget({maxInputBytes:99}).reserveCall(100,100,0,0,"synthetic-model"),/input_limit/);
  assert.throws(()=>budget({maxOutputTokens:99}).reserveCall(100,100,0,0,"synthetic-model"),/output_limit/);
  assert.throws(()=>budget({maxSearches:0}).reserveCall(100,100,1,0,"synthetic-model"),/tool_limit/);
  assert.throws(()=>budget({maxFetches:0}).reserveCall(100,100,0,1,"synthetic-model"),/tool_limit/);
  assert.throws(()=>budget({maxModelCalls:0}).reserveCall(100,100,0,0,"synthetic-model"),/model_limit/);
  assert.throws(()=>budget({maxModelSteps:0}).reserveCall(100,100,0,0,"synthetic-model"),/model_limit/);
  assert.throws(()=>budget({maxCostUsd:.00001}).reserveCall(100,100,1,0,"synthetic-model"),/cost_limit/);
  let now=0;const timed=new RecommendationBudget({requestId:"a",spendAllowed:true,pricing,limits:{maxCostUsd:1,timeoutMs:30},now:()=>now});now=31;
  assert.throws(()=>timed.reserveCall(1,1,0,0,"synthetic-model"),/timeout/);
});
test("usage keeps actual/cache/tool counters and does not double record a call",()=>{
  const b=budget();const id=b.reserveCall(100,200,1,1,"synthetic-model");b.recordCall(id,usage);b.recordCall(id,usage);
  assert.equal(b.snapshot().inputTokens,100);assert.equal(b.snapshot().cacheReadTokens,20);assert.equal(b.snapshot().cacheWriteTokens,10);
  assert.equal(b.snapshot().providerReportedSearches,1);assert.equal(b.snapshot().providerReportedModelSteps,2);
  assert.ok(Math.abs(b.snapshot().costEstimateUsd!-.0101045)<1e-12);assert.equal(b.snapshot().voiceCostUsd,0);
});
test("model mismatches and nonfinite configuration are rejected",()=>{
  assert.throws(()=>budget().reserveCall(1,1,0,0,"different-model"),/pricing_model_mismatch/);
  assert.throws(()=>budget({maxModelSteps:NaN}),/invalid_limits/);
});
test("unknown failed usage retains monetary reservation and a null cost, never zero",()=>{
  const b=budget();const id=b.reserveCall(100,200,0,0,"synthetic-model");const before=b.snapshot().reservedCostUsd;b.markUnknown(id);
  assert.equal(b.snapshot().reservedCostUsd,before);assert.equal(b.snapshot().costEstimateUsd,null);
});
test("failed durable reservation is not counted as a dispatched model call",()=>{
  const b=budget();const id=b.reserveCall(100,200,0,0,"synthetic-model");b.markNotDispatched(id);
  assert.equal(b.snapshot().modelCalls,0);assert.equal(b.snapshot().modelSteps,0);assert.equal(b.snapshot().costEstimateUsd,0);
  assert.ok(b.snapshot().reservedCostUsd>0); // Local retry allowance is deliberately retained.
});
