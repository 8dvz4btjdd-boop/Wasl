import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { allowedDomain, type Citation } from "./allowlist";

// Ported from the contextual-recommendations branch (lib/recommendations/fetch-source.ts):
// the public-address guard, checked redirects, extractOriginalArticle and the
// islamic-content.com dictionary adapter. Used here only to extend a citation's 150-character
// snippet to the original passage around it, verbatim.

const MAX_FETCH_BYTES = 800_000;
const MAX_ARTICLE_CHARS = 300_000;
const MAX_PASSAGE = 1_500;
const FETCH_TIMEOUT_MS = 10_000;

type Address = { address: string; family: number };

/** Public-only addresses, including the IPv6 cases often missed by SSRF guards. */
export function isPublicSourceAddress(value: string): boolean {
  const family = isIP(value);
  if (family === 4) {
    const [a, b, c] = value.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family !== 6) return false;
  const [first, second] = value.split(":").map((part) => parseInt(part, 16));
  if (first < 0x2000 || first > 0x3fff || !Number.isFinite(first)) return false;
  return !(first === 0x2001 && (second === 0xdb8 || second === 0 || !Number.isFinite(second))) && first !== 0x2002;
}

function allowedUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    // Fixed source URLs only, never search/user parameters; never a raw IP.
    if (url.protocol !== "https:" || url.search || !allowedDomain(value) || isIP(url.hostname.replace(/^\[|\]$/g, ""))) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  lrm: "‎", rlm: "‏", thinsp: " ", ensp: " ", emsp: " ",
};
function decodeEntities(text: string): string | null {
  let unsupported = false;
  const decoded = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (raw, key: string) => {
    if (key[0] === "#") {
      const point = key[1]?.toLowerCase() === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
        unsupported = true;
        return raw;
      }
      return String.fromCodePoint(point);
    }
    if (!(key in ENTITIES)) {
      unsupported = true;
      return raw;
    }
    return ENTITIES[key];
  });
  return unsupported ? null : decoded;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const EXCLUDED_TAGS = new Set(["script", "style", "noscript", "nav", "aside", "footer", "header", "form", "button", "iframe", "svg", "canvas"]);
const EXCLUDED_COMPONENT = /(?:^|[\s_-])(?:comments?|reviews?|feedback|assistant|chatbot|related|breadcrumb|pagination|share|social|advertisement|ads)(?:$|[\s_-])/i;
type HtmlFrame = { tag: string; excluded: boolean; candidate: number | null };
type HtmlCandidate = { tag: "main" | "article"; parts: string[]; paragraphs: number; title: string[] };

/**
 * Conservative extraction of a page's explicitly identified article (or main). No
 * summarizing or rewriting; unknown markup or entities and oversized material fail closed.
 */
export function extractOriginalArticle(html: string): { title: string; bodyVerbatim: string } | null {
  const stack: HtmlFrame[] = [];
  const candidates: HtmlCandidate[] = [];
  let documentTitle = "";
  let malformed = false;
  const tokens = html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith("<!--") || /^<!/i.test(token)) continue;
    if (token[0] === "<") {
      const close = /^<\s*\/\s*([a-z0-9]+)/i.exec(token);
      if (close) {
        const tag = close[1].toLowerCase();
        const index = stack.map((frame) => frame.tag).lastIndexOf(tag);
        if (index !== -1) {
          const current = stack[stack.length - 1];
          if (current.candidate !== null && !current.excluded && /^(p|li|h[1-6]|blockquote|div|section)$/.test(tag)) {
            candidates[current.candidate].parts.push("\n");
          }
          stack.splice(index);
        }
        continue;
      }
      const open = /^<\s*([a-z0-9]+)\b/i.exec(token);
      if (!open) {
        malformed = true;
        continue;
      }
      const tag = open[1].toLowerCase();
      const parent = stack[stack.length - 1];
      const attrs = token.slice(open[0].length, -1);
      const component = /\b(?:class|id)\s*=\s*["']([^"']*)["']/gi;
      const excluded = Boolean(
        parent?.excluded ||
          EXCLUDED_TAGS.has(tag) ||
          [...attrs.matchAll(component)].some((match) => EXCLUDED_COMPONENT.test(match[1])) ||
          /\bhidden(?:\s|=|\/|$)/i.test(attrs) ||
          /\baria-hidden\s*=\s*["']true["']/i.test(attrs),
      );
      let candidate = parent?.candidate ?? null;
      if ((tag === "article" || tag === "main") && !excluded) {
        candidate = candidates.push({ tag, parts: [], paragraphs: 0, title: [] }) - 1;
      }
      if (candidate !== null && !excluded) {
        if (tag === "p") candidates[candidate].paragraphs++;
        if (tag === "br" || /^(p|li|h[1-6]|blockquote)$/.test(tag)) candidates[candidate].parts.push("\n");
      }
      if (!VOID.has(tag) && !/\/\s*>$/.test(token)) stack.push({ tag, excluded, candidate });
      continue;
    }
    const current = stack[stack.length - 1];
    if (!current || current.excluded) continue;
    const decoded = decodeEntities(token);
    if (decoded === null) {
      malformed = true;
      continue;
    }
    if (stack.some((frame) => frame.tag === "title")) documentTitle += decoded;
    if (current.candidate !== null) {
      candidates[current.candidate].parts.push(decoded);
      if (stack.some((frame) => frame.tag === "h1")) candidates[current.candidate].title.push(decoded);
    }
  }
  // Prefer article over the surrounding main; never silently concatenate several articles.
  const articles = candidates.filter((c) => c.tag === "article" && c.paragraphs > 0);
  const eligible = articles.length ? articles : candidates.filter((c) => c.tag === "main" && c.paragraphs > 0);
  if (malformed || eligible.length !== 1) return null;
  const article = eligible[0];
  const bodyVerbatim = article.parts.join("").replace(/[\t\r ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const title = (article.title.join("") || documentTitle).replace(/\s+/g, " ").trim();
  if (bodyVerbatim.length < 20 || bodyVerbatim.length > MAX_ARTICLE_CHARS) return null;
  return { title, bodyVerbatim };
}

/**
 * islamic-content.com dictionary entries: keep the complete named reference block only,
 * never the adjacent hadith quotations or personal rulings. Other pages: the article.
 */
export function extractScopedOriginalSource(html: string, sourceUrl: string) {
  const url = allowedUrl(sourceUrl);
  if (!url) return null;
  if (url.hostname === "shamela.ws" && /^\/book\/\d+\/\d+/.test(url.pathname)) return extractShamelaPage(html);
  if (url.hostname !== "islamic-content.com" || !/^\/dictionary\/word\/\d+(?:\/ar)?$/.test(url.pathname)) return extractOriginalArticle(html);
  const article = /<article\b[^>]*\bclass\s*=\s*["'][^"']*\bentry-wraper\b[^"']*["'][^>]*>([\s\S]*?)<\/article\s*>/i.exec(html)?.[1];
  if (!article) return null;
  const titleHtml = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(article)?.[1];
  if (!titleHtml || /<[^>]+>/.test(titleHtml)) return null;
  const blocks: string[] = [];
  let start: number | null = null;
  let depth = 0;
  for (const match of article.matchAll(/<\/?div\b[^>]*>/gi)) {
    const closing = /^<\//.test(match[0]);
    if (start === null) {
      if (!closing && /\bclass\s*=\s*["'][^"']*\bentry-main-content\b[^"']*["']/i.test(match[0])) {
        start = match.index;
        depth = 1;
      }
    } else {
      depth += closing ? -1 : 1;
      if (depth === 0) {
        blocks.push(article.slice(start, match.index + match[0].length));
        start = null;
      }
    }
  }
  const referenceLabel = "من موسوعة المصطلحات الإسلامية";
  const selected = blocks.filter((block) => {
    const heading = /<h5\b[^>]*>([^<]*)<\/h5\s*>/i.exec(block)?.[1];
    return heading !== undefined && decodeEntities(heading)?.replace(/\s+/g, " ").trim() === referenceLabel;
  });
  if (selected.length !== 1) return null;
  return extractOriginalArticle(`<title>${titleHtml}</title><article>${selected[0]}</article>`);
}

/** The balanced block that opens at `start` (an opening <div>). */
function balancedDiv(html: string, start: number): string | null {
  let depth = 0;
  for (const match of html.slice(start).matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) return html.slice(start, start + (match.index ?? 0) + match[0].length);
  }
  return null;
}

/** shamela.ws book pages: the page text lives in div.nass blocks; the main one is the longest. */
function extractShamelaPage(html: string) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  let best: { title: string; bodyVerbatim: string } | null = null;
  for (const open of html.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bnass\b[^"']*["'][^>]*>/gi)) {
    const block = balancedDiv(html, open.index ?? 0);
    const page = block ? extractOriginalArticle(`<title>${title}</title><article>${block}</article>`) : null;
    if (page && (!best || page.bodyVerbatim.length > best.bodyVerbatim.length)) best = page;
  }
  return best;
}

/** One bounded fetch of an allowlisted page: DNS checked before every hop, redirects checked, no cookies. */
export async function fetchOriginalSource(value: string): Promise<{ title: string; bodyVerbatim: string } | null> {
  const first = allowedUrl(value);
  if (!first) return null;
  let url: URL = first;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const addresses = (await lookup(url.hostname, { all: true, verbatim: true })) as Address[];
      if (!addresses.length || addresses.some((a) => !isPublicSourceAddress(a.address))) return null;
      const response: Response = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        signal,
        headers: { Accept: "text/html", "User-Agent": "Wasl-source-passage/1.0" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location: string | null = response.headers.get("location");
        const next: URL | null = location ? allowedUrl(new URL(location, url).toString()) : null;
        if (!next) return null;
        url = next;
        continue;
      }
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !/^text\/html(?:;|$)/i.test(type) || /charset\s*=\s*(?!utf-?8(?:\s|;|$))/i.test(type) || !response.body) {
        await response.body?.cancel();
        return null;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_FETCH_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return extractScopedOriginalSource(html, url.toString());
    }
    return null;
  } catch {
    return null;
  }
}

/** The search tool's snippet in parts (it joins nearby paragraphs), without its "..." ends or markdown. */
function snippetParts(cited: string): string[] {
  return cited
    .replace(/^\s*(\.\.\.|…)\s*/, "")
    .replace(/\s*(\.\.\.|…)\s*$/, "")
    .split(/\n+/)
    .map((part) => part.replace(/^#+\s*/, "").trim())
    .filter((part) => part.length >= 12);
}

/** Whitespace-normalized text with a map back to the original indices. */
function normalizeWithMap(text: string) {
  let out = "";
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = /\s/.test(text[i]) ? " " : text[i];
    if (ch === " " && lastSpace) continue;
    lastSpace = ch === " ";
    out += ch;
    map.push(i);
  }
  return { out, map };
}

export type ExtendedPassage = { text: string; hash: string; extended: boolean };

/**
 * Extends a fenced citation to the original passage around it: the page's paragraph(s) that
 * contain every part of the snippet, verbatim, up to 1,500 characters, with its sha256. When
 * the page can't be fetched or the snippet isn't found in it, the 150-character snippet stays.
 */
export async function extendCitation(c: Citation): Promise<ExtendedPassage> {
  const keep = { text: c.cited_text, hash: createHash("sha256").update(c.cited_text).digest("hex"), extended: false };
  const parts = snippetParts(c.cited_text);
  if (!parts.length || parts.join("").length < 30) return keep;
  const page = await fetchOriginalSource(c.url);
  if (!page) return keep;
  const passage = passageAround(page.bodyVerbatim, c.cited_text);
  if (!passage) return keep;
  return { text: passage, hash: createHash("sha256").update(passage).digest("hex"), extended: passage.length > c.cited_text.length };
}

/**
 * The page's paragraph(s) containing every part of the snippet, in order, verbatim, at most
 * 1,500 characters and never cutting the snippet. Null when the snippet isn't in the page.
 */
export function passageAround(text: string, cited: string): string | null {
  const parts = snippetParts(cited);
  if (!parts.length) return null;
  const body = normalizeWithMap(text);
  // Every part of the snippet must be in the page, in order; otherwise the snippet stays.
  let cursor = 0;
  let startOriginal = -1;
  let endOriginal = -1;
  for (const part of parts) {
    const needle = normalizeWithMap(part).out;
    const at = body.out.indexOf(needle, cursor);
    if (at < 0) return null;
    if (startOriginal < 0) startOriginal = body.map[at];
    endOriginal = body.map[at + needle.length - 1] + 1;
    cursor = at + needle.length;
  }
  if (endOriginal - startOriginal > MAX_PASSAGE) return null;
  // The paragraph(s) around the snippet, verbatim; trimmed to ≤ 1,500 characters, never cutting the snippet.
  // Paragraphs are separated by a blank line; a single line break is a <br> inside one.
  const prev = text.lastIndexOf("\n\n", startOriginal);
  let from = prev < 0 ? 0 : prev + 2;
  let to = text.indexOf("\n\n", endOriginal);
  if (to < 0) to = text.length;
  if (to - from > MAX_PASSAGE) {
    from = Math.max(from, endOriginal - MAX_PASSAGE, Math.min(startOriginal, startOriginal - 300));
    from = Math.min(from, startOriginal);
    to = Math.min(to, from + MAX_PASSAGE);
    const space = text.lastIndexOf(" ", to);
    if (space >= endOriginal) to = space;
  }
  const passage = text.slice(from, to).trim();
  return passage.length > MAX_PASSAGE ? null : passage;
}
