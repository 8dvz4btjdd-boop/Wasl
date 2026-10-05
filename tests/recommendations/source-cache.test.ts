import test from "node:test";
import assert from "node:assert/strict";
import { OriginalSourceCache } from "../../lib/recommendations/source-cache";
test("cache contains only allowed original sources; clones values and expires stale source versions",()=>{
  let now=0;const cache=new OriginalSourceCache(()=>now,100,2);
  const url="https://islamic-content.com/dictionary/word/1952";
  cache.put(url,{ok:true,url,title:"Synthetic fixture",bodyVerbatim:"Synthetic source content",locator:"fixture"});
  const hit=cache.get(url)!;hit.bodyVerbatim="changed by caller";
  assert.equal(cache.get(url)?.bodyVerbatim,"Synthetic source content");
  cache.put("http://127.0.0.1/",{...hit,url:"http://127.0.0.1/"});
  assert.equal(cache.get("http://127.0.0.1/"),null);
  now=101;assert.equal(cache.get(url),null);
});
test("redirect content is cached only under its final truthful URL, never another allowed source's key",()=>{
  const cache=new OriginalSourceCache();
  const requested="https://dawa.center/file/7937";
  const final="https://islamic-content.com/dictionary/word/1952";
  const original={ok:true as const,url:final,title:"Synthetic fixture",bodyVerbatim:"Synthetic source content",locator:"fixture"};
  cache.put(requested,original);
  assert.equal(cache.get(requested),null);
  assert.equal(cache.get(final),null);
  cache.put(final,original);
  assert.equal(cache.get(final)?.url,final);
  assert.equal(cache.get(requested),null);
  const excluded="https://islamic-content.com/dictionary/%63omments";
  cache.put(excluded,{...original,url:excluded});
  assert.equal(cache.get(excluded),null);
});
