// Audit-created external probes. Actual product functions; synthetic inputs and
// mocked DNS/transport only. No source website, user service or paid API is contacted.
import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { allowedDomain, rejectReason } from "/workspace/Wasl-audit-current-20261006/lib/ai/sources/allowlist";
import { fetchOriginalSource, extendCitation } from "/workspace/Wasl-audit-current-20261006/lib/ai/sources/fetch";
import { logServerError } from "/workspace/Wasl-audit-current-20261006/lib/log";

const text = "هذا نص اصطناعي طويل لأغراض فحص المراجعة فقط، ولا يمثل نقلًا علميًا أو دينيًا.";
const html = `<title>SYNTHETIC SOURCE</title><article><p>${text}</p></article>`;

test("current citation fence accepts HTTP, userinfo/non443 and user-comment paths on allowed domains", () => {
  for (const url of [
    "http://dawa.center/file/7937",
    "https://synthetic:synthetic@dawa.center:8443/file/7937",
    "https://islamic-content.com/comments/123",
    "https://dawa.center/assistant/chat",
    "https://unverified-subdomain.dawa.center/file/7937",
  ]) {
    assert.ok(allowedDomain(url));
    assert.equal(rejectReason({ url, title: "Synthetic", cited_text: text }, "asker"), null);
  }
});

test("logger directly emits synthetic private-looking details without redaction", () => {
  const previous = console.error;
  const emitted: unknown[][] = [];
  console.error = (...args) => { emitted.push(args); };
  try {
    logServerError("audit.synthetic", { code: "23514", message: "synthetic failure", details: "SYNTHETIC PRIVATE BODY IN FAILED ROW" });
    assert.equal((emitted[0][1] as { details: string }).details, "SYNTHETIC PRIVATE BODY IN FAILED ROW");
  } finally { console.error = previous; }
});

async function mockedTransport(run: (calls: string[]) => Promise<void>, privateAddress = false) {
  const previousFetch = globalThis.fetch;
  const previousLookup = dns.lookup;
  const calls: string[] = [];
  dns.lookup = (async () => [{ address: privateAddress ? "127.0.0.1" : "1.1.1.1", family: 4 }]) as typeof dns.lookup;
  syncBuiltinESMExports();
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
  try { await run(calls); }
  finally { globalThis.fetch = previousFetch; dns.lookup = previousLookup; syncBuiltinESMExports(); }
}

test("fetch rejects outside host, HTTP and private DNS before transport", async () => {
  await mockedTransport(async calls => {
    assert.equal(await fetchOriginalSource("https://example.invalid/article"), null);
    assert.equal(await fetchOriginalSource("http://dawa.center/file/7937"), null);
    assert.equal(calls.length, 0);
  });
  await mockedTransport(async calls => {
    assert.equal(await fetchOriginalSource("https://dawa.center/file/7937"), null);
    assert.equal(calls.length, 0);
  }, true);
});

test("fetch URL guard reaches mocked transport with a non443 port and comment section", async () => {
  await mockedTransport(async calls => {
    assert.ok(await fetchOriginalSource("https://dawa.center:8443/file/7937"));
    assert.ok(await fetchOriginalSource("https://islamic-content.com/comments/123"));
    assert.deepEqual(calls, ["https://dawa.center:8443/file/7937", "https://islamic-content.com/comments/123"]);
  });
});

test("allowed-host redirect can extend text without preserving its final source URL", async () => {
  await mockedTransport(async calls => {
    const redirectedText = `${text} هذه تتمة اصطناعية آتية من الصفحة النهائية المختلفة.`;
    globalThis.fetch = (async input => {
      calls.push(String(input));
      if (calls.length === 1) return new Response(null, { status: 302, headers: { location: "https://quranpedia.net/audit-synthetic" } });
      return new Response(`<title>SYNTHETIC FINAL TITLE</title><article><p>${redirectedText}</p></article>`, { headers: { "content-type": "text/html; charset=utf-8" } });
    }) as typeof fetch;
    const citation = { url: "https://dawa.center/file/7937", title: "SYNTHETIC REQUESTED TITLE", cited_text: text };
    const extended = await extendCitation(citation);
    assert.equal(extended.text, redirectedText);
    assert.equal(extended.extended, true);
    assert.deepEqual(calls, [citation.url, "https://quranpedia.net/audit-synthetic"]);
    assert.equal("url" in extended, false, "API loses final URL; readings.ts continues using citation.url");
  });
});

test("outside redirect is rejected before a second mocked transport request", async () => {
  await mockedTransport(async calls => {
    globalThis.fetch = (async input => {
      calls.push(String(input));
      return new Response(null, { status: 302, headers: { location: "https://example.invalid/other" } });
    }) as typeof fetch;
    assert.equal(await fetchOriginalSource("https://dawa.center/file/7937"), null);
    assert.equal(calls.length, 1);
  });
});
