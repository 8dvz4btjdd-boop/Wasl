/**
 * First-strong isolation (FSI … PDI) for user-controlled text placed inside a translated
 * sentence: a Latin pseudonym in an Arabic sentence (or the reverse) keeps its own
 * direction without reordering the punctuation around it.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}
