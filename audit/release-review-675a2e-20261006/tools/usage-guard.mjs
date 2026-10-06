import { createHash } from 'node:crypto';
export const ALLOWED_MODEL = 'claude-haiku-4-5-20251001';
const nullableNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export class AuditUsageGuard {
  constructor({ fetchImpl, limitUsd = 1, maxHttp = 10, snapshot = () => {}, context = () => ({}), outputTokensCap = null }) {
    if (limitUsd !== 1 || maxHttp !== 10) throw new Error('audit authorization limits are immutable');
    this.fetchImpl = fetchImpl; this.limitUsd = limitUsd; this.maxHttp = maxHttp;
    if(outputTokensCap!==null&&outputTokensCap!==1024)throw new Error('only explicitly approved audit cap 1024 allowed');
    this.outputTokensCap=outputTokensCap;this.snapshot = snapshot; this.context = context; this.records = []; this.blocked = [];
    this.committedUsd = 0; this.stopped = false; this.tail = Promise.resolve();
  }
  fail(reason, context) { this.blocked.push({ reason, ...context }); this.snapshot(this.summary()); throw new Error(`audit_guard_${reason}`); }
  summary() { return { authorization_max_usd: this.limitUsd, hard_max_http: this.maxHttp, committed_cost_upper_usd: this.committedUsd, completed_usage_estimated_usd: this.records.some(r=>r.usage_complete) ? this.records.reduce((n,r) => n+(r.estimated_cost_usd ?? 0),0) : null, unknown_usage_attempts: this.records.filter(r=>!r.usage_complete).length, attempts: this.records, blocked: this.blocked, stopped: this.stopped }; }
  async wait() { await this.tail.catch(()=>{}); }
  async fetch(input, init = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (url.origin === 'http://127.0.0.1:55641') return this.fetchImpl(input, init);
    if (url.origin !== 'https://api.anthropic.com' || url.pathname !== '/v1/messages') return this.fail('unauthorized_destination', this.context());
    const context = { ...this.context() };
    let release;
    const previous = this.tail;
    this.tail = new Promise(resolve => { release=resolve; });
    await previous.catch(()=>{});
    let record;
    try {
      if (this.stopped) return this.fail('stopped_after_error_or_unknown_usage', context);
      const bodyText = typeof init.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '';
      let body;
      try { body=JSON.parse(bodyText); } catch { return this.fail('invalid_body',context); }
      if (body.model !== ALLOWED_MODEL) return this.fail('unsupported_model',context);
      if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 64000) return this.fail('output_bound_not_verified',context);
      if (body.tools?.length || body.thinking?.type === 'enabled') return this.fail('opaque_tools_or_thinking_not_affordable',context);
      if (body.service_tier && body.service_tier !== 'standard' && body.service_tier !== 'auto') return this.fail('unsupported_service_tier',context);
      if (this.records.length >= this.maxHttp) return this.fail('http_limit',context);
      const effectiveMaxTokens=this.outputTokensCap===1024?Math.min(body.max_tokens,1024):body.max_tokens;
      const reservation = 200000 * 2 / 1e6 + effectiveMaxTokens * 5 / 1e6;
      if (this.committedUsd + reservation > this.limitUsd + 1e-12) return this.fail('global_budget',context);
      this.committedUsd += reservation;
      const isPing = body.messages?.length === 1 && (body.messages[0]?.content === 'ping' || body.messages[0]?.content?.[0]?.text === 'ping');
      record={ attempt_id:`audit-attempt-${this.records.length+1}`, ...context, kind:isPing?'model_verification':'task_attempt', requested_model:body.model, actual_provider_model:null, service_tier:'standard', transport_guard_changed_tier:body.service_tier!=='standard', original_requested_max_tokens:body.max_tokens,effective_max_tokens:effectiveMaxTokens,output_cap_audit_variant:this.outputTokensCap===1024,output_tokens_requested:body.max_tokens,provider_stop_reason:null,truncated:null, reservation_usd:reservation, request_body_chars:bodyText.length, request_body_utf8_bytes:Buffer.byteLength(bodyText), request_hash:createHash('sha256').update(bodyText).digest('hex'), stream:body.stream===true, started_utc:new Date().toISOString(), http_status:null, provider_request_id:null, duration_ms:null, usage_complete:false, usage:{input_tokens:null,output_tokens:null,cache_creation_input_tokens:null,cache_read_input_tokens:null,web_search_requests:null,web_fetch_requests:null}, estimated_cost_usd:null, cost_upper_from_complete_usage_usd:null, no_web_tools_in_request:true };
      this.records.push(record); this.snapshot(this.summary());
      body.service_tier='standard';body.max_tokens=effectiveMaxTokens;
      const signal = init.signal ? AbortSignal.any([init.signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
      const started=Date.now();
      const response=await this.fetchImpl(input,{...init,body:JSON.stringify(body),signal});
      record.http_status=response.status; record.provider_request_id=response.headers.get('request-id');
      this.consume(response.clone(),record).then(()=>{
        record.duration_ms=Date.now()-started; this.snapshot(this.summary()); release();
      },()=>{
        this.stopped=true; record.duration_ms=Date.now()-started;record.error_class='usage_collection_error';this.snapshot(this.summary());release();
      });
      if (!response.ok) this.stopped=true;
      return response;
    } catch (error) {
      if (record) { this.stopped=true;record.error_class=error instanceof Error?error.name:'unknown';record.error_code=typeof error?.cause?.code==='string'?error.cause.code:null;record.duration_ms=Date.now()-Date.parse(record.started_utc);this.snapshot(this.summary()); }
      release(); throw error;
    }
  }
  async consume(response,record) {
    let rawUsage={};let complete=false;
    const merge=(u)=>{if(u&&typeof u==='object')rawUsage={...rawUsage,...u};};
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const reader=response.body?.getReader(); if(!reader)throw new Error('missing_body');
      const decoder=new TextDecoder();let buffer='';let bytes=0;
      for (;;) {
        const {value,done}=await reader.read();if(done)break;
        bytes+=value.byteLength;if(bytes>8000000)throw new Error('collection_size');
        buffer+=decoder.decode(value,{stream:true});let at;
        while((at=buffer.indexOf('\n'))>=0) {
          const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);
          if(!line.startsWith('data:'))continue;
          const e=JSON.parse(line.slice(5).trim());
          if(e.type==='message_start'){record.actual_provider_model=e.message?.model??null;merge(e.message?.usage);}
          if(e.type==='message_delta'){merge(e.usage);if(e.delta?.stop_reason)record.provider_stop_reason=e.delta.stop_reason;}
          if(e.type==='message_stop')complete=true;
          if(e.type==='error'){record.error_class=e.error?.type??'provider_stream_error';this.stopped=true;}
        }
      }
    } else {
      const body=await response.json();record.actual_provider_model=body.model??null;merge(body.usage);record.provider_stop_reason=body.stop_reason??null;complete=response.ok&&body.type==='message';
      if(!response.ok)record.error_class=body.error?.type??'provider_http_error';
    }
    for(const k of ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'])record.usage[k]=nullableNumber(rawUsage[k]);
    record.usage.web_search_requests=nullableNumber(rawUsage.server_tool_use?.web_search_requests);
    record.usage.web_fetch_requests=nullableNumber(rawUsage.server_tool_use?.web_fetch_requests);
    record.returned_service_tier=rawUsage.service_tier??null;record.truncated=record.provider_stop_reason===null?null:record.provider_stop_reason==='max_tokens';
    const counts=['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'].every(k=>record.usage[k]!==null);
    record.usage_complete=complete&&counts&&record.actual_provider_model===ALLOWED_MODEL;
    if(record.returned_service_tier&&record.returned_service_tier!=='standard'){record.usage_complete=false;this.stopped=true;}
    if(record.usage_complete) {
      const u=record.usage;
      const upper=(u.input_tokens+u.cache_creation_input_tokens*2+u.cache_read_input_tokens*.1+u.output_tokens*5)/1e6;
      let cacheCost=u.cache_creation_input_tokens*2;
      const c5=nullableNumber(rawUsage.cache_creation?.ephemeral_5m_input_tokens),c1=nullableNumber(rawUsage.cache_creation?.ephemeral_1h_input_tokens);
      if(c5!==null&&c1!==null&&c5+c1===u.cache_creation_input_tokens)cacheCost=c5*1.25+c1*2;
      record.estimated_cost_usd=(u.input_tokens+cacheCost+u.cache_read_input_tokens*.1+u.output_tokens*5)/1e6;
      record.cost_upper_from_complete_usage_usd=upper;
      if(upper>record.reservation_usd+1e-12){this.stopped=true;throw new Error('reservation_violation');}
      this.committedUsd-=record.reservation_usd-upper;
    } else this.stopped=true;
  }
}
