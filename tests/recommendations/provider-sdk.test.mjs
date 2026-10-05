// Synthetic SDK compatibility inspection only. The custom fetch never contacts a network.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
test('native SDK wire and original document decoding use zero network (mock)', async () => {
let captured;
const provider = createAnthropic({apiKey:'synthetic-test-value',fetch:async (_url, init)=>{
  captured=JSON.parse(init.body);
  return new Response(JSON.stringify({
    id:'synthetic-inspection',type:'message',role:'assistant',model:'claude-haiku-4-5-20251001',
    content:[
      {type:'server_tool_use',id:'synthetic-fetch-1',name:'web_fetch',input:{url:'https://dawa.center/test-fixture'}},
      {type:'web_fetch_tool_result',tool_use_id:'synthetic-fetch-1',content:{type:'web_fetch_result',url:'https://dawa.center/test-fixture',retrieved_at:'2026-10-05T00:00:00Z',content:{type:'document',title:'NON-RELIGIOUS SYNTHETIC FIXTURE',citations:{enabled:true},source:{type:'text',media_type:'text/plain',data:'Synthetic fixture original body.'}}}},
      {type:'text',text:'Operational synthetic test only.'}
    ],
    stop_reason:'end_turn',stop_sequence:null,
    usage:{input_tokens:20,output_tokens:5,cache_read_input_tokens:7,cache_creation_input_tokens:3,server_tool_use:{web_search_requests:0,web_fetch_requests:1}}
  }),{status:200,headers:{'content-type':'application/json'}});
}});
const result=await generateText({model:provider('claude-haiku-4-5-20251001'),prompt:'Synthetic inspection only.',maxOutputTokens:100,maxRetries:0,tools:{webSearch:provider.tools.webSearch_20250305({maxUses:2,allowedDomains:['dawa.center']}),webFetch:provider.tools.webFetch_20250910({maxUses:3,allowedDomains:['dawa.center'],citations:{enabled:true},maxContentTokens:4000})}});
assert.equal(captured.tools[0].type,'web_search_20250305');
assert.equal(captured.tools[0].max_uses,2);
assert.equal(captured.tools[1].type,'web_fetch_20250910');
assert.equal(captured.tools[1].max_uses,3);
assert.equal(captured.tools[1].max_content_tokens,4000);
assert.equal(result.steps[0].toolResults[0].output.content.source.data,'Synthetic fixture original body.');
assert.equal(result.totalUsage.inputTokenDetails.cacheReadTokens,7);
assert.equal(result.totalUsage.inputTokenDetails.cacheWriteTokens,3);
assert.equal(result.steps[0].providerMetadata.anthropic.usage.server_tool_use.web_fetch_requests,1);
});
