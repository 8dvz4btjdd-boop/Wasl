// A small reproducible comparison of intent selection. Same accessible source inventory
// for both methods. It is not a human judgement of religious usefulness/correctness.
import {performance} from "node:perf_hooks";
import {mkdirSync,writeFileSync} from "node:fs";
import {extractIntent} from "../../lib/recommendations/concepts";
import {sourceLookupUrl} from "../../lib/recommendations/fetch-source";
import cases from "./safety-cases.json";
const correctionCases=[
  {id:"definition",messages:["ما تعريف الإيمان في اللغة والاصطلاح؟"]},
  {id:"corrected_to_faith",messages:["كيف حفظ القرآن؟","لا أقصد حفظ القرآن، أقصد تعريف الإيمان في اللغة والاصطلاح"]},
  {id:"corrected_away_from_faith",messages:["ما تعريف الإيمان؟","لا أقصد الإيمان، أقصد ترجمة معاني القرآن"]},
  {id:"return_to_earlier_subject",messages:["ما تعريف الإيمان؟","ما معنى الصلاة؟","ما تعريف الإيمان؟"]},
  {id:"explicit_followup",messages:["ما تعريف الإيمان؟","وما معنى ذلك اصطلاحا؟"]},
];
const results=[...cases.cases.map(c=>({id:c.id,messages:[c.input]})),...correctionCases].map(c=>{
  const rows=c.messages.map(body=>({body,sender_role:"asker"}));
  const begin=performance.now();const baseline=extractIntent(rows.slice(-1));const baselineMs=performance.now()-begin;
  const contextualBegin=performance.now();const contextual=extractIntent(rows);const contextualMs=performance.now()-contextualBegin;
  const lookup=(intent:ReturnType<typeof extractIntent>)=>sourceLookupUrl(intent.concepts,"dictionary");
  return {caseId:c.id,baseline:{concepts:baseline.concepts,candidateUrl:lookup(baseline),intentSelectionMs:baselineMs},
    contextual:{concepts:contextual.concepts,candidateUrl:lookup(contextual),intentSelectionMs:contextualMs},
    originalSourceInventory:["https://islamic-content.com/dictionary/word/1952"],
    relevanceHumanScore:null,scientificCorrectnessHumanScore:null,usefulPassageTimeMs:null,paidCostUsd:0};
});
mkdirSync("docs/recommendations/evidence",{recursive:true});
writeFileSync("docs/recommendations/evidence/intent-comparison.json",JSON.stringify({
  scope:"controlled intent/lookup comparison only; identical access to one original source; no paid model, no human scientific evaluation, no verified useful-passage timing",
  baseline:"single query from latest question, without prior context",contextual:"same current question plus explicit authorized context",results},null,2)+"\n");
console.log(`${results.length} same-access intent comparisons recorded; human quality and useful-passage timing remain unmeasured.`);
