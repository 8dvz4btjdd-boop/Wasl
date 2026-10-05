import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { runAI, taskAllowedInTestScope } from "../../lib/ai/runAI";
import type { AITask } from "../../lib/ai/task";

test("contextual test scope allows exactly its two budgeted tasks",()=>{
  assert.equal(taskAllowedInTestScope("contextual_private_intent_v1","contextual"),true);
  assert.equal(taskAllowedInTestScope("contextual_sourced_web_v1","contextual"),true);
  for(const name of ["classify","intake","card","assist","contextual_unbudgeted","", "contextual_private_intent_v1_other"]) assert.equal(taskAllowedInTestScope(name,"contextual"),false);
});
test("unset test scope preserves the existing production task behavior",()=>{
  assert.equal(taskAllowedInTestScope("classify",""),true);
  assert.equal(taskAllowedInTestScope("card",""),true);
});
test("runAI itself refuses a non-contextual task before DB, prompt or paid API work",async()=>{
  const previousScope=process.env.WASL_AI_TEST_SCOPE;
  const previousKey=process.env.ANTHROPIC_API_KEY;
  const previousModel=process.env.ANTHROPIC_MODEL_FAST;
  process.env.WASL_AI_TEST_SCOPE="contextual";
  // Synthetic values only: no network call may run, even if a key/model is present.
  process.env.ANTHROPIC_API_KEY="synthetic-test-only-not-a-real-key";
  process.env.ANTHROPIC_MODEL_FAST="synthetic-test-only-model";
  let promptCalls=0;
  const task:AITask<string,string>={name:"classify",tier:"fast",schema:z.string(),
    buildPrompt(){promptCalls++;throw new Error("must never build this prompt");},
    postValidate(output){return{ok:true,output};},outputPolicy:"model_authored",ephemeralFields:[],rateLimit:null};
  try{
    assert.deepEqual(await runAI(task,"synthetic input",{orgId:"synthetic-org",actorId:"synthetic-actor"}),{ok:false,fallback:true,reason:"test_scope"});
    assert.equal(promptCalls,0);
  }finally{
    for(const[key,value]of [["WASL_AI_TEST_SCOPE",previousScope],["ANTHROPIC_API_KEY",previousKey],["ANTHROPIC_MODEL_FAST",previousModel]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
