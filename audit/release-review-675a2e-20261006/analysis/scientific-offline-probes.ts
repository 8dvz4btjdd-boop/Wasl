// Audit-created synthetic probes, outside product files. No network, model, or DB calls.
import { rejectReason } from "/workspace/Wasl-audit-current-20261006/lib/ai/sources/allowlist";
import { passageAround } from "/workspace/Wasl-audit-current-20261006/lib/ai/sources/fetch";
import { planQueriesTask } from "/workspace/Wasl-audit-current-20261006/lib/ai/tasks/plan-queries";
import { intakeTask } from "/workspace/Wasl-audit-current-20261006/lib/ai/tasks/intake";
import { keepSourcedFields } from "/workspace/Wasl-audit-current-20261006/lib/ai/tasks/card";

const results: { id: string; expected: unknown; observed: unknown; boundaryHolds: boolean; kind: string }[] = [];
const record = (id: string, expected: unknown, observed: unknown, kind="synthetic_validator_probe") =>
  results.push({ id, expected, observed, boundaryHolds: JSON.stringify(expected)===JSON.stringify(observed), kind });
const citation=(url:string,cited_text:string)=>({url,title:"Synthetic fixture, not scientific source material",cited_text});
record("unverified_shamela_work", "rejected_pending_edition_verification", rejectReason(citation("https://shamela.ws/book/1/2", "Synthetic passage for checking metadata qualification; no actual source claim."),"asker"));
record("quran_site_is_not_text_verification", "rejected_pending_verse_verification", rejectReason(citation("https://quranpedia.net/synthetic-fixture", "﴿نص اصطناعي للاختبار فقط وليس آية قرآنية﴾"),"asker"));
record("ungraded_english_hadith_on_dictionary", "hadith_ungraded", rejectReason(citation("https://islamic-content.com/dictionary/word/1", "The Prophet said: [SYNTHETIC FIXTURE; THIS IS NOT A HADITH]."),"asker"));
record("unrelated_word_is_not_a_hadith_grade", "hadith_ungraded", rejectReason(citation("https://dorar.net/hadith/synthetic-fixture", "قال رسول الله: [نص اصطناعي للاختبار وليس حديثًا]. تعليق الاختبار صحيح."),"asker"));
const snippet="المقطع الاصطناعي للاختبار فقط، لا يصدر حكمًا دينيًا";
const qualifier="إلا أن القيد المتأخر في هذه الفقرة يجب إظهاره مع المقطع.";
const paragraph=snippet+". "+"تفاصيل اصطناعية ".repeat(220)+qualifier;
const extracted=passageAround(paragraph,snippet);
record("late_qualification_survives_excerpt_cap",true,Boolean(extracted?.includes(qualifier)),"synthetic_excerpt_probe");
record("private_identifier_rejected_in_external_query_plan",false,planQueriesTask.postValidate({queries:["قضية synthetic@example.test في حي تجريبي"]}).ok);
const next=intakeTask.postValidate({done:false,nextQuestion:"Êtes-vous musulman ?",refusedReligiousQuestion:false,summary:null},{firstMessage:"Question synthétique",turns:[],locale:"fr"});
record("french_personal_belief_question_rejected",false,next.ok);
const field={text:"غير محدد",source_ids:[]};
const card=keepSourcedFields({follow_up:field,covered:{text:"اقتنعت بالمناقشة",source_ids:["selected-negative-fixture"]},remaining:field,next_step:field,undefined_fields:[]},["selected-negative-fixture"]);
record("valid_source_ids_are_not_semantic_verification","غير محدد",card.covered.text,"synthetic_semantic_probe_selected_input_was_not_understood");
console.log(JSON.stringify({auditCreated:true,baseSha:"675a2e0089ee1e4324a7b438c17d570989793bc1",paidCalls:0,dbCalls:0,networkCalls:0,results},null,2));
