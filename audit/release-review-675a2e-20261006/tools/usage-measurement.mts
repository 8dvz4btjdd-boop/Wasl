import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {AuditUsageGuard,ALLOWED_MODEL} from './usage-guard.mjs';
const repo='/workspace/Wasl-audit-current-20261006';
const audit='/workspace/wasl-release-audit-20261006';
const reportPath=`${audit}/analysis/AI_USAGE_MEASURED.json`;
const price=JSON.parse(readFileSync(`${audit}/analysis/usage-pricing-verified.json`,'utf8'));
if(price.model!==ALLOWED_MODEL||price.input_usd_per_million!==1||price.output_usd_per_million!==5||price.cache_write_1h_usd_per_million!==2||price.http_status!==200)throw new Error('pricing_not_verified');
if(process.env.ANTHROPIC_MODEL_FAST!==ALLOWED_MODEL||!process.env.ANTHROPIC_API_KEY)throw new Error('authorized_fast_model_or_key_absent');
const env=Object.fromEntries(readFileSync(`${audit}/local-state/app.env`,'utf8').split('\n').filter(l=>l&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
if(env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:55641')throw new Error('DB_not_exact_isolated_loopback');
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']){
 if(!env[key])throw new Error('local_DB_binding_missing');process.env[key]=env[key];
}
// Key and FAST model stay inherited from the platform, never loaded from app.env.
delete process.env.AI_TEST_TIMEOUT_MS;
let logicalContext={feature_run_id:`audit-feature-${randomUUID()}`,logical_step_id:'preflight',task:'preflight'};
let report={audit_base_sha:'675a2e0089ee1e4324a7b438c17d570989793bc1',dataset_version:'synthetic-usage-v1-2026-10-06',authorization:'User explicitly approved up to USD1 from earlier USD5 for this synthetic audit run',authorization_limit_usd:1,model:ALLOWED_MODEL,actual_provider_model:null,service_tier:'standard',scope:'current runAI and task implementations, no product edits',transport_deviations:['Audit serializes provider HTTP requests including verification ping','Audit adds service_tier=standard to prevent unknown priority billing','Audit adds maximum 30-second transport deadline; original task output max/schema/prompt kept unchanged','Native tools/other models rejected before provider network'],max_logical_tasks:6,max_provider_http:10,local_database_origin:'http://127.0.0.1:55641',started_utc:new Date().toISOString(),pricing_source:price.source_url,pricing_checked_at:price.checked_at_utc,pricing_artifact_sha256:price.artifact_sha256,steps:[],guard:null,cleanup:'pending',error_class:null};
const save=(guardSummary)=>{report.guard=guardSummary;writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});};
const boundedResume=process.argv.includes('--resume-bounded-probe');
const previousArtifact=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):null;
if(previousArtifact?.guard?.attempts?.length&&!boundedResume)throw new Error('prior_provider_attempt_exists_resume_requires_explicit_shared_ledger_recovery');
if(boundedResume&&previousArtifact?.bounded_probe_retry_executed)throw new Error('authorized_alternative_already_executed');
if(boundedResume){report.steps=previousArtifact.steps??[];report.previous_session={started_utc:previousArtifact.started_utc,completed_utc:previousArtifact.completed_utc,unknown_reservation_held_usd:previousArtifact.guard.committed_cost_upper_usd,network_diagnosis:previousArtifact.network_diagnosis};report.bounded_probe_retry_executed=true;report.measurement_variant='Audit-only cap1024 in transport; product SDK original64K unmodified, not production performance or E2E quality';report.transport_deviations[2]='Audit transport adds 30-second deadline and caps ordinary max_tokens1024; original64K/prompt/schema recorded unchanged in product';}
const originalFetch=globalThis.fetch.bind(globalThis);
const guard=new AuditUsageGuard({fetchImpl:originalFetch,context:()=>logicalContext,snapshot:save,outputTokensCap:boundedResume?1024:null});
if(boundedResume){guard.records=previousArtifact.guard.attempts;guard.blocked=previousArtifact.guard.blocked;guard.committedUsd=previousArtifact.guard.committed_cost_upper_usd;guard.stopped=false;}
globalThis.fetch=guard.fetch.bind(guard);
// Product logger may stringify provider errors: suppress all console paths in this process.
console.info=()=>{};console.error=()=>{};console.warn=()=>{};console.log=()=>{};
const require=createRequire(`${repo}/package.json`);
const {createClient}=require('@supabase/supabase-js');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const orgId=randomUUID();
let orgCreated=false;
try {
 const {error:orgError}=await db.from('organizations').insert({id:orgId,name:`AUDIT-SYNTHETIC-USAGE-${orgId}`,languages:['ar'],ai_enabled:true});
 if(orgError)throw new Error('synthetic_org_create_failed');orgCreated=true;
 const {runAI}=await import(`${repo}/lib/ai/runAI.ts`);
 const {intakeTask}=await import(`${repo}/lib/ai/tasks/intake.ts`);
 const {classifyTask}=await import(`${repo}/lib/ai/tasks/classify.ts`);
 const {planQueriesTask}=await import(`${repo}/lib/ai/tasks/plan-queries.ts`);
 const {assistToneTask}=await import(`${repo}/lib/ai/tasks/assist.ts`);
 const {findSourcesTask}=await import(`${repo}/lib/ai/tasks/find-sources.ts`);
 const classifiedInput={question:'أريد فهم معنى الصيام دون أحكام شخصية.',locale:'ar'};
 const cases=[
  {id:'classify_initial',task:classifyTask,input:classifiedInput},
  {id:'intake_missing_detail',task:intakeTask,input:{firstMessage:'أريد أن أفهم الموضوع بشكل أوضح.',turns:[],locale:'ar'}},
  {id:'context_correction_queries',task:planQueriesTask,input:{question:'أقصد معنى الصيام لا مواعيده.',recent:[{role:'asker',text:'أريد معرفة معنى الصيام.'},{role:'daee',text:'هل السؤال عن التوقيت؟'},{role:'asker',text:'لا، ليس عن التوقيت. أقصد معناه.'}],topic:'worship',locale:'ar'}},
  {id:'tone_neutral',task:assistToneTask,input:{messages:['شكرا لك، أود شرحا أوضح لهذا المعنى.']}},
  {id:'classify_identical_cache',task:classifyTask,input:classifiedInput},
  {id:'native_sources_blocked_before_network',task:findSourcesTask,input:{question:'ما تعريف الصيام في اللغة؟',queries:['تعريف الصيام لغة'],topic:'worship',level:'a',locale:'ar',audience:'daee'}}
 ];
 for(const test of cases){
  if(guard.stopped||report.steps.length>=report.max_logical_tasks)break;
  logicalContext={feature_run_id:logicalContext.feature_run_id,logical_step_id:test.id,task:test.task.name};
  const inputText=JSON.stringify(test.input),before=guard.records.length,blockedBefore=guard.blocked.length,started=Date.now();
  const result=await runAI(test.task,test.input,{orgId,actorId:null});
  await guard.wait();
  report.steps.push({case_id:test.id,task:test.task.name,measurement_variant:boundedResume?'audit_transport_1024_cap':'original_sdk_output_limit',input_chars:inputText.length,input_utf8_bytes:Buffer.byteLength(inputText),input_hash:createHash('sha256').update(inputText).digest('hex'),ok:result.ok,fallback_reason:result.ok?null:result.reason,duration_ms:Date.now()-started,new_provider_http_attempts:guard.records.length-before,new_guard_blocked_attempts:guard.blocked.length-blockedBefore,task_returned_latency_ms:result.ok?result.meta.latencyMs:null,requested_model:result.ok?result.meta.model:null,output_saved_in_audit_artifact:false,semantic_or_human_validation_done:false});
  save(guard.summary());
  // Semantic/policy fallback is recorded; stop after first technical provider failure.
  if(guard.stopped)break;
 }
} catch(error){report.error_class=error instanceof Error?error.name:'unknown';}
finally {
 await guard.wait();
 if(orgCreated){
  const results=await Promise.all([db.from('ai_runs').delete().eq('org_id',orgId),db.from('events').delete().eq('org_id',orgId)]);
  if(results.some(x=>x.error))report.cleanup='run_or_event_delete_failed';
  else {const {error}=await db.from('organizations').delete().eq('id',orgId);report.cleanup=error?'synthetic_org_delete_failed':'deleted_only_owned_synthetic_org_and_rows';}
 }
 report.completed_utc=new Date().toISOString();
 report.actual_provider_model=guard.records.find(r=>r.actual_provider_model)?.actual_provider_model??null;
 save(guard.summary());
 process.stdout.write(JSON.stringify({status:report.error_class?'failed':'completed',steps:report.steps.length,provider_http_attempts:guard.records.length,blocked:guard.blocked.length,actual_provider_model:report.actual_provider_model,usage_complete_attempts:guard.records.filter(r=>r.usage_complete).length,cost_upper_usd:guard.committedUsd,estimated_cost_usd:guard.summary().completed_usage_estimated_usd,cleanup:report.cleanup,artifact:reportPath})+'\n');
}
