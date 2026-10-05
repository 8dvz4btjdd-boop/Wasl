import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { RECOMMENDATION_LIMITS } from "./config";
import { findSourceForUrl } from "./sources";

type Address = { address: string; family: number };
type FailureReason = "not_allowed" | "not_public_address" | "dns_failed" | "network_error"
  | "http_error" | "invalid_redirect" | "too_many_redirects" | "unsupported_content"
  | "content_too_large" | "not_extractable" | "aborted" | "timeout";
export type OriginalSourceResult = {
  ok: true; url: string; title: string; bodyVerbatim: string; locator: string;
} | { ok: false; reason: FailureReason };
type FetchOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  /** Test injection only. Runtime uses DNS and validates every returned address. */
  resolveHost?: (host: string) => Promise<Address[]>;
};

/** Verified source entry for a controlled concept, not evidence of answer adequacy. */
export function sourceLookupUrl(intentConcepts: readonly string[], sourceId: string): string | null {
  return sourceId === "dictionary" && intentConcepts.includes("faith") && intentConcepts.includes("terms")
    ? "https://islamic-content.com/dictionary/word/1952" : null;
}

/** Public-only addresses, including the IPv6 cases often missed by SSRF guards. */
export function isPublicSourceAddress(value: string): boolean {
  const family = isIP(value);
  if (family === 4) {
    const [a, b, c] = value.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113));
  }
  // Only globally routable unicast; reject mapped IPv4, private/link-local,
  // multicast, documentation, and transition mechanisms with embedded addresses.
  if (family !== 6) return false;
  const [first, second] = value.split(":").map(part => parseInt(part, 16));
  if (first < 0x2000 || first > 0x3fff || !Number.isFinite(first)) return false;
  return !(first === 0x2001 && (second === 0xdb8 || second === 0 || !Number.isFinite(second))) && first !== 0x2002;
}

function allowedUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    // This free fallback accepts fixed source URLs, never user/search parameters.
    if (url.search || !findSourceForUrl(value) || isIP(url.hostname.replace(/^\[|\]$/g, ""))) return null;
    url.hash = "";
    return url;
  } catch { return null; }
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  lrm: "\u200e", rlm: "\u200f", thinsp: "\u2009", ensp: "\u2002", emsp: "\u2003",
};
function decodeEntities(text: string): string | null {
  let unsupported = false;
  const decoded = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (raw, key: string) => {
    if (key[0] === "#") {
      const point = key[1]?.toLowerCase() === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
        unsupported = true; return raw;
      }
      return String.fromCodePoint(point);
    }
    if (!(key in ENTITIES)) { unsupported = true; return raw; }
    return ENTITIES[key];
  });
  return unsupported ? null : decoded;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const EXCLUDED_TAGS = new Set(["script", "style", "noscript", "nav", "aside", "footer", "header", "form", "button", "iframe", "svg", "canvas"]);
const EXCLUDED_COMPONENT = /(?:^|[\s_-])(?:comments?|reviews?|feedback|assistant|chatbot|related|breadcrumb|pagination|share|social|advertisement|ads)(?:$|[\s_-])/i;
type HtmlFrame = { tag: string; excluded: boolean; candidate: number | null };
type HtmlCandidate = { tag: "main" | "article"; id: string | null; parts: string[]; paragraphs: number; title: string[] };

/** Conservative extraction of a source's explicitly identified article/main.
 * No snippet-to-answer conversion, summarization, or generated religious prose.
 * Unknown markup/entities and oversized material fail closed rather than being cut.
 */
export function extractOriginalArticle(html: string): { title: string; bodyVerbatim: string; locator: string } | null {
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
        const index = stack.map(frame => frame.tag).lastIndexOf(tag);
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
      if (!open) { malformed = true; continue; }
      const tag = open[1].toLowerCase();
      const parent = stack[stack.length - 1];
      const attrs = token.slice(open[0].length, -1);
      const component = /\b(?:class|id)\s*=\s*["']([^"']*)["']/gi;
      const excluded = Boolean(parent?.excluded || EXCLUDED_TAGS.has(tag)
        || [...attrs.matchAll(component)].some(match => EXCLUDED_COMPONENT.test(match[1]))
        || /\bhidden(?:\s|=|\/|$)/i.test(attrs) || /\baria-hidden\s*=\s*["']true["']/i.test(attrs));
      let candidate = parent?.candidate ?? null;
      if ((tag === "article" || tag === "main") && !excluded) {
        const id = /\bid\s*=\s*["']([a-z][a-z0-9:_-]*)["']/i.exec(attrs)?.[1] ?? null;
        candidate = candidates.push({ tag, id, parts: [], paragraphs: 0, title: [] }) - 1;
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
    if (decoded === null) { malformed = true; continue; }
    if (stack.some(frame => frame.tag === "title")) documentTitle += decoded;
    if (current.candidate !== null) {
      candidates[current.candidate].parts.push(decoded);
      if (stack.some(frame => frame.tag === "h1")) candidates[current.candidate].title.push(decoded);
    }
  }
  // Prefer article over the surrounding main, never silently concatenate several articles.
  const articles = candidates.filter(candidate => candidate.tag === "article" && candidate.paragraphs > 0);
  const eligible = articles.length ? articles : candidates.filter(candidate => candidate.tag === "main" && candidate.paragraphs > 0);
  if (malformed || eligible.length !== 1) return null;
  const article = eligible[0];
  const bodyVerbatim = article.parts.join("").replace(/[\t\r ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const title = (article.title.join("") || documentTitle).replace(/\s+/g, " ").trim();
  if (!title || title.length > 300 || bodyVerbatim.length < 20 || bodyVerbatim.length > RECOMMENDATION_LIMITS.maxExcerptChars) return null;
  return { title, bodyVerbatim, locator: article.id ? `${article.tag}#${article.id}` : article.tag };
}

/** Source-specific adapter verified against the dictionary's live markup.
 * Keep the complete named reference block, including its exceptions and bibliography;
 * do not mix it with the adjacent hadith quotations or detailed personal rulings.
 */
export function extractScopedOriginalSource(html: string, sourceUrl: string) {
  const url = allowedUrl(sourceUrl);
  if (!url) return null;
  if (url.hostname !== "islamic-content.com" || !/^\/dictionary\/word\/\d+(?:\/ar)?$/.test(url.pathname)) {
    return extractOriginalArticle(html);
  }
  const article = /<article\b[^>]*\bclass\s*=\s*["'][^"']*\bentry-wraper\b[^"']*["'][^>]*>([\s\S]*?)<\/article\s*>/i.exec(html)?.[1];
  if (!article) return null;
  const titleHtml = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(article)?.[1];
  if (!titleHtml || /<[^>]+>/.test(titleHtml)) return null;
  const blocks: string[] = [];
  const tags = /<\/?div\b[^>]*>/gi;
  let start: number | null = null;
  let depth = 0;
  for (const match of article.matchAll(tags)) {
    const closing = /^<\//.test(match[0]);
    if (start === null) {
      if (!closing && /\bclass\s*=\s*["'][^"']*\bentry-main-content\b[^"']*["']/i.test(match[0])) {
        start = match.index; depth = 1;
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
  const selected = blocks.filter(block => {
    const heading = /<h5\b[^>]*>([^<]*)<\/h5\s*>/i.exec(block)?.[1];
    return heading !== undefined && decodeEntities(heading)?.replace(/\s+/g, " ").trim() === referenceLabel;
  });
  if (selected.length !== 1) return null;
  // The wrapper is parser structure only: title and every displayed word originate
  // from the fetched page. No model chooses, rewrites, or completes the block.
  const result = extractOriginalArticle(`<title>${titleHtml}</title><article>${selected[0]}</article>`);
  return result ? { ...result, locator: `article.entry-wraper / .entry-main-content / h5: «${referenceLabel}»` } : null;
}

function managedProxyDnsFallback(error: unknown): boolean {
  // The managed proxy resolves the fixed allowlisted hostname when local DNS is
  // unavailable. This is explicit deployment configuration, never a request flag.
  // It delegates DNS/rebinding protection to that proxy; it is not DNS pinning.
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return (code === "EAI_AGAIN" || code === "ENOTFOUND")
    && process.env.WASL_RECOMMENDATIONS_TRUST_PROXY_DNS === "true"
    && process.env.NODE_USE_ENV_PROXY === "1"
    && Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
}

/** One bounded free origin fetch. Calling code owns the shared request-level fetch budget.
 * Every redirect is checked before following. fetch respects the application's configured
 * network/proxy; DNS is checked before each hop. No cookies, auth, or user context is sent.
 */
export async function fetchOriginalSource(value: string, options: FetchOptions = {}): Promise<OriginalSourceResult> {
  let url = allowedUrl(value);
  if (!url) return { ok: false, reason: "not_allowed" };
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error("source_timeout")); }, 10_000);
  const signal = controller.signal;
  const resolver = options.resolveHost ?? (host => lookup(host, { all: true, verbatim: true }));
  const fetcher = options.fetcher ?? fetch;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      let addresses: Address[] | null;
      try { addresses = await withAbort(resolver(url.hostname), signal); }
      catch (error) {
        if (!signal.aborted && managedProxyDnsFallback(error)) addresses = null;
        else return { ok: false, reason: signal.aborted ? timedOut ? "timeout" : "aborted" : "dns_failed" };
      }
      if (addresses && (!addresses.length || addresses.some(address => !isPublicSourceAddress(address.address)))) {
        return { ok: false, reason: "not_public_address" };
      }
      const response = await withAbort(fetcher(url.toString(), {
        method: "GET", redirect: "manual", credentials: "omit", signal,
        headers: { Accept: "text/html, text/plain;q=0.9", "User-Agent": "Wasl-contextual-source/1.0" },
      }), signal);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (redirects === 3) return { ok: false, reason: "too_many_redirects" };
        const location = response.headers.get("location");
        if (!location) return { ok: false, reason: "invalid_redirect" };
        const next = allowedUrl(new URL(location, url).toString());
        if (!next) return { ok: false, reason: "not_allowed" };
        url = next;
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); return { ok: false, reason: "http_error" }; }
      // A custom fetcher/provider must not have followed a forbidden redirect behind our back.
      if (response.url && (!allowedUrl(response.url) || new URL(response.url).href !== url.href)) {
        await response.body?.cancel(); return { ok: false, reason: "invalid_redirect" };
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!/^text\/html(?:;|$)/i.test(contentType) || /charset\s*=\s*(?!utf-?8(?:\s|;|$))/i.test(contentType)) {
        await response.body?.cancel(); return { ok: false, reason: "unsupported_content" };
      }
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > RECOMMENDATION_LIMITS.maxFetchBytes) {
        await response.body?.cancel(); return { ok: false, reason: "content_too_large" };
      }
      if (!response.body) return { ok: false, reason: "not_extractable" };
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await withAbort(reader.read(), signal);
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > RECOMMENDATION_LIMITS.maxFetchBytes) {
            await reader.cancel(); return { ok: false, reason: "content_too_large" };
          }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let html: string;
      try { html = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { return { ok: false, reason: "unsupported_content" }; }
      const extracted = extractScopedOriginalSource(html, url.toString());
      return extracted ? { ok: true, url: url.toString(), ...extracted } : { ok: false, reason: "not_extractable" };
    }
    return { ok: false, reason: "too_many_redirects" };
  } catch {
    return { ok: false, reason: signal.aborted ? timedOut ? "timeout" : "aborted" : "network_error" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
