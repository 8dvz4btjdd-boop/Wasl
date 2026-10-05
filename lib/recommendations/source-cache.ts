import type { OriginalSourceResult } from "./fetch-source";
import { findSourceForUrl } from "./sources";
type Original = Extract<OriginalSourceResult,{ok:true}>;
/** Only public original source sections, never a query, dialogue or personal answer.
 * This bounded cache is an optimization, not a persistent corpus or publication approval.
 */
export class OriginalSourceCache {
  private entries=new Map<string,{at:number;source:Original}>();
  constructor(private now:()=>number=Date.now,private ttlMs=3_600_000,private maxEntries=32) {}
  get(url:string):Original|null {
    const hit=this.entries.get(url);
    if (!hit) return null;
    if (this.now()-hit.at>=this.ttlMs || url!==hit.source.url || !findSourceForUrl(hit.source.url)) {this.entries.delete(url);return null;}
    return structuredClone(hit.source);
  }
  put(url:string,source:Original):void {
    // A redirect's final source may be cached only under its own truthful URL.
    if (url!==source.url || !findSourceForUrl(url) || !findSourceForUrl(source.url)) return;
    if (this.entries.size>=this.maxEntries && !this.entries.has(url)) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(url,{at:this.now(),source:structuredClone(source)});
  }
}
export const originalSourceCache=new OriginalSourceCache();
