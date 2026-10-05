import { createHash } from "node:crypto";
import { z } from "zod";
import release from "@/data/recommendations/released-passages.json";
import policy from "@/data/recommendations/release-policy.json";
import { findSourceForUrl } from "./sources";
import type { Intent } from "./concepts";
import type { SourceRecommendation } from "./types";
const Passage = z.object({
  id:z.string(), sourceId:z.string(), title:z.string(), sourceUrl:z.url(), locator:z.string().min(1),
  bodyVerbatim:z.string().min(1).max(4_000), contentHash:z.string().regex(/^[a-f0-9]{64}$/),
  locale:z.enum(["ar","en","fr","es","ur","id","tl"]), concepts:z.array(z.string()).min(1),
  level:z.enum(["a","b"]), rightsEvidence:z.string().min(1), approvedBy:z.string().min(1),
  approvedAt:z.iso.datetime(), edition:z.string().min(1), sourceContextVerified:z.literal(true),
  religiousTextVerified:z.literal(true),
}).strict();
export type ReleasedPassage = z.infer<typeof Passage>;
export function validReleasedPassages(data: unknown = release.passages): ReleasedPassage[] {
  const parsed = z.array(Passage).safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.filter(p => findSourceForUrl(p.sourceUrl)?.id === p.sourceId
    && policy.allowedSections.some(s=>s.sourceId===p.sourceId && s.sourceUrl===p.sourceUrl && s.locator===p.locator && s.levels.includes(p.level))
    && createHash("sha256").update(p.bodyVerbatim).digest("hex") === p.contentHash);
}
export function retrieveReleased(intent: Intent, locale: string): SourceRecommendation[] {
  return validReleasedPassages().filter(p => p.locale === locale && p.concepts.some(c => intent.concepts.includes(c as never)))
    .slice(0, 2).map(p => ({id:p.id,sourceId:p.sourceId,title:p.title,sourceUrl:p.sourceUrl,locator:p.locator,
      bodyVerbatim:p.bodyVerbatim,contentHash:p.contentHash,review:"released"}));
}
export function validateReleased(material: SourceRecommendation): boolean {
  return validReleasedPassages().some(p => p.id===material.id && p.contentHash===material.contentHash
    && p.bodyVerbatim===material.bodyVerbatim && p.sourceUrl===material.sourceUrl && p.locator===material.locator);
}
