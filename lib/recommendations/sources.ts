import registry from "@/data/recommendations/sources.json";
export const SOURCES = registry.sources;
const EXCLUDED = /(?:^|\/)(?:comments?|reviews?|chat|assistant|ai|login|register|account|api)(?:\/|$)/i;
/** A listed host is not blanket content approval. Restricted sections/works stay scoped. */
export function findSourceForUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || value.includes("\\")) return null;
  // Inspect the raw path before URL normalizes encoded dot segments, then decode
  // once for section checks. Nested/invalid encodings fail closed.
  const rawPath = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(value.trim())?.[1] ?? "";
  if (/%(?:2f|5c|2e)/i.test(rawPath)) return null;
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  if (path.includes("%") || [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "\\") || EXCLUDED.test(path)) return null;
  // Disallow encoded path separators/traversal. Free fetch has its own stricter
  // parameter policy; a URL fragment alone cannot qualify a passage or edition.
  return [...SOURCES].sort((a,b) => Math.max(...b.entryUrls.map(e => new URL(e).pathname.length)) - Math.max(...a.entryUrls.map(e => new URL(e).pathname.length))).find(source => source.entryUrls.some(entry => {
    const root = new URL(entry);
    if (url.hostname !== root.hostname) return false;
    if (root.hostname === "shamela.ws") return false; // Specific approved work/edition required; none verified yet.
    return root.pathname === "/" || path === root.pathname || path.startsWith(`${root.pathname}/`);
  })) ?? null;
}

export function sourceDomains(ids: readonly string[]) {
  return [...new Set(SOURCES.filter(source => ids.includes(source.id)).flatMap(source => source.entryUrls)
    .map(url => new URL(url).hostname))].filter(host => host !== "shamela.ws");
}
