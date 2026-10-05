// Real LOCAL Auth/database/Realtime/browser integration with synthetic accounts.
// No paid providers; an empty corpus tests source-only/failure behavior, not religious quality.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { exerciseMockStates } from "./browser-states.mjs";

if (process.env.VERIFY_ISOLATED_TEST !== "1") throw new Error("VERIFY_ISOLATED_TEST=1 required for disposable local browser checks");
if (process.env.ANTHROPIC_API_KEY || process.env.ELEVENLABS_API_KEY) throw new Error("Paid provider keys must be unset");
const prefix = process.env.CONTEXTUAL_LOCAL_PREFIX ?? "wasl-contextual";
assert.ok(/^wasl-contextual(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(prefix) && prefix.length <= 50, "Invalid isolated runtime prefix");
const sqlContainer = process.env.WASL_TEST_SQL_CONTAINER ?? `${prefix}-db`;
assert.equal(sqlContainer, `${prefix}-db`, "SQL container must match the isolated runtime prefix");
const label = spawnSync("docker", ["inspect", sqlContainer, "--format", '{{index .Config.Labels "wasl.contextual.local"}}'], { encoding: "utf8" });
if (label.status !== 0 || label.stdout.trim() !== "true") throw new Error("Owned LOCAL database not found");
const state = resolve(process.env.CONTEXTUAL_LOCAL_STATE ?? "/workspace/wasl-contextual-local");
const keys = JSON.parse(readFileSync(join(state, "credentials.json"), "utf8"));
const gatewayPort = process.env.CONTEXTUAL_LOCAL_GATEWAY_PORT ?? "55621";
assert.ok(/^\d{4,5}$/.test(gatewayPort) && Number(gatewayPort) >= 1024 && Number(gatewayPort) <= 65535, "Invalid gateway port");
assert.equal(keys.url, `http://127.0.0.1:${Number(gatewayPort)}`);
assert.ok(keys.prefix ? keys.prefix === prefix : prefix === "wasl-contextual", "Synthetic state belongs to a different runtime");
const baseUrl = new URL(process.env.VERIFY_BASE ?? "http://127.0.0.1:3060");
assert.ok(baseUrl.protocol === "http:" && baseUrl.hostname === "127.0.0.1" && !baseUrl.username && !baseUrl.password && !baseUrl.search && !baseUrl.hash && baseUrl.pathname === "/", "App must use the exact loopback origin");
assert.equal(Number(baseUrl.port), keys.ports?.app ?? 3060, "App origin must match the synthetic runtime state");
const BASE = baseUrl.origin;
const git = (args) => spawnSync("git", args, { encoding: "utf8" }).stdout.trim();
const testRuntime = { baseSha: git(["rev-parse", "HEAD"]), branch: git(["branch", "--show-current"]), appOrigin: BASE, gatewayOrigin: keys.url, sqlContainer, prefix, assignmentFixture: "local service-role assignment; not routing-algorithm evidence" };
const tag = Date.now().toString(36);
const OUT = resolve("docs/recommendations/evidence", `local-${tag}`);
mkdirSync(OUT, { recursive: true });
const db = createClient(keys.url, keys.service, { auth: { persistSession: false, autoRefreshToken: false } });
const sizes = { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } };
const results = [], requests = [], responses = [], identities = [], browserErrors = [];
let organization, conversation, askerId, browser;
let mocking = false;
let originalPassagesDisplayed = 0;
function saveFixtureIds() {
  writeFileSync(join(state, `browser-fixtures-${tag}.json`), JSON.stringify({ tag, organization, conversation, askerId, identities }), { mode: 0o600 });
}
const check = (name, condition, extra = {}) => {
  results.push({ name, ok: Boolean(condition), ...extra });
  assert.ok(condition, name);
};
async function query(operation, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${operation} failed (${result.error.code ?? "unknown"})`);
  return result.data;
}
async function staff(role, name) {
  const password = randomBytes(24).toString("hex");
  const email = `contextual-${role}-${tag}-${identities.length}@local.invalid`;
  const { user } = await query("create synthetic Auth identity", db.auth.admin.createUser({ email, password, email_confirm: true }));
  identities.push(user.id);
  saveFixtureIds();
  await query("insert synthetic staff profile", db.from("profiles").insert({ user_id: user.id, org_id: organization, role, display_name: name, languages: ["ar", "en"], topics: ["general", "worship", "tawhid", "quran", "doubts"], status: "offline", last_seen: new Date().toISOString() }));
  return { id: user.id, email, password };
}
async function listen(page) {
  page.on("pageerror", (error) => browserErrors.push({ name: error.name, message: error.message.slice(0, 180) }));
  page.on("request", (request) => {
    if (!request.url().includes("/api/recommendations/")) return;
    const body = request.postDataJSON();
    const headers = request.headers();
    requests.push({ audience: request.url().endsWith("/asker") ? "asker" : "daee", method: request.method(), keys: Object.keys(body).sort(), contextVersion: body.contextVersion, mode: body.mode, at: Date.now(), evidence: mocking ? "mock_ui" : "local_server", requestOrigin: new URL(request.url()).origin, headerOrigin: headers.origin ?? null, refererOrigin: headers.referer ? new URL(headers.referer).origin : null });
  });
  page.on("response", async (response) => {
    if (!response.url().includes("/api/recommendations/")) return;
    const payload = await response.json().catch(() => ({}));
    responses.push({ audience: response.url().endsWith("/asker") ? "asker" : "daee", status: response.status(), error: payload.error ?? null, reason: payload.reason ?? null,
      requestId: payload.requestId ?? null, usage: payload.usage ?? null,
      sourceEvidence: (payload.materials ?? []).map((material) => ({ sourceUrl: material.sourceUrl, locator: material.locator, contentHash: material.contentHash, characters: material.bodyVerbatim?.length ?? 0, review: material.review })),
      cacheControl: response.headers()["cache-control"] ?? null, contentType: response.headers()["content-type"] ?? null, evidence: mocking ? "mock_ui" : "local_server" });
  });
}
async function login(identity, locale = "ar") {
  const context = await browser.newContext({ viewport: sizes.desktop });
  const page = await context.newPage(); await listen(page);
  await page.goto(`${BASE}/${locale}/login`);
  await page.locator("#login-email").fill(identity.email);
  await page.locator("#login-password").fill(identity.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**/${identity === admin ? "admin" : "daee"}**`, { timeout: 45_000, waitUntil: "domcontentloaded" });
  return page;
}
async function screenshot(page, filename, selector) {
  const element = selector ? page.locator(selector) : null;
  if (element) await element.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, filename), fullPage: false });
}
async function waitResult(page, audience) {
  const panel = page.getByTestId(`recommendations-${audience}`);
  await panel.waitFor({ timeout: 30_000 });
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="recommendations-${id}"]`);
    return element && !element.textContent.includes("جارٍ البحث") && !element.textContent.includes("حُفظ سؤالك الأحدث") && !element.textContent.includes("أرسل سؤالًا محددًا");
  }, audience, { timeout: 40_000 });
  return panel;
}
async function send(page, selector, text) {
  const box = page.locator(selector); await box.fill(text); await box.press("Enter");
  await page.getByText(text, { exact: true }).last().waitFor({ timeout: 15_000 });
}
let admin, assigned, outsider;
try {
  const { id } = await query("create isolated synthetic organization", db.from("organizations").insert({ name: "اختبار محلي اصطناعي — التوصيات", ai_enabled: true, languages: ["ar", "en"] }).select("id").single());
  organization = id;
  saveFixtureIds();
  assigned = await staff("daee", "داعية اختبار مخصص"); outsider = await staff("daee", "داعية اختبار غير معين"); admin = await staff("admin", "مشرف اختبار");
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
  const askerContext = await browser.newContext({ viewport: sizes.mobile });
  const asker = await askerContext.newPage(); await listen(asker);
  await asker.goto(`${BASE}/ar/enter`);
  await asker.locator('main form button[type="submit"]:not([disabled])').waitFor();
  await asker.locator('main input:not([type="hidden"])').fill(`ct-${tag}`);
  await asker.locator('main input:not([type="hidden"])').press("Enter");
  await asker.locator('button[name="skip"]').click();
  await asker.locator('a[href$="/wait"]').first().click();
  const question = "ما معنى الصلاة في الإسلام؟";
  await asker.locator('textarea[name="question"]').fill(question);
  check("typing before send does not call recommendation API", requests.length === 0);
  await asker.locator('textarea[name="question"]').press("Enter");
  await asker.waitForURL("**/chat/**", { timeout: 45_000 });
  conversation = asker.url().split("/chat/")[1];
  const ownedConversation = await query("read synthetic conversation owner", db.from("conversations").select("asker_id,org_id").eq("id", conversation).single());
  askerId = ownedConversation.asker_id;
  check("synthetic conversation uses this run's isolated organization", ownedConversation.org_id === organization);
  saveFixtureIds();
  const askerPanel = await waitResult(asker, "asker");
  await asker.waitForTimeout(100);
  check("authorized asker API succeeds", responses.some((value) => value.audience === "asker" && value.status === 200 && value.evidence === "local_server"));
  check("asker waiting recommendation panel uses actual local API", requests.some((value) => value.audience === "asker"));
  check("Arabic RTL document", await asker.locator("html").getAttribute("dir") === "rtl");
  check("public request contains IDs/mode/locale only", requests.every((value) => value.keys.every((key) => ["conversationId", "contextVersion", "mode", "locale", "confirmedTranscript"].includes(key))));
  check("no original excerpt claimed when corpus is empty", await askerPanel.locator("blockquote").count() === 0);
  await screenshot(asker, "asker-ar-mobile-actual-empty-corpus.png", '[data-testid="recommendations-asker"]');
  await asker.setViewportSize(sizes.desktop);
  await screenshot(asker, "asker-ar-desktop-actual-empty-corpus.png", '[data-testid="recommendations-asker"]');
  if (process.argv.includes("--mock-states")) {
    mocking = true;
    results.push(...await exerciseMockStates(asker, "asker", OUT));
    mocking = false;
  }
  const beforeThanks = requests.length;
  await send(asker, "footer textarea", "شكرا");
  await asker.waitForTimeout(1000);
  await send(asker, "footer textarea", question);
  await asker.waitForTimeout(1000);
  check("thanks and duplicate question do not make another recommendation request", requests.length === beforeThanks);
  const correctedResponse = asker.waitForResponse((response) => response.url().endsWith("/api/recommendations/asker") && response.status() === 200, { timeout: 45_000 });
  await send(asker, "footer textarea", "لا أقصد الصلاة، أقصد تعريف الإيمان في اللغة والاصطلاح");
  await correctedResponse;
  await waitResult(asker, "asker");
  check("corrected intent eventually triggers latest context", requests.length > beforeThanks && requests.at(-1).contextVersion !== requests[0].contextVersion);
  check("asker receives a specific source for corrected faith definition", await asker.getByTestId("recommendations-asker").locator('a[href*="islamic-content.com/dictionary/word/1952"]').count() > 0);
  check("fresh unapproved source text is not exposed to asker", await asker.getByTestId("recommendations-asker").locator("blockquote").count() === 0);
  await screenshot(asker, "asker-corrected-faith-specific-source.png", '[data-testid="recommendations-asker"]');
  await query("assign synthetic conversation", db.from("conversations").update({ daee_id: assigned.id, assigned_at: new Date().toISOString(), status: "waiting" }).eq("id", conversation));
  await asker.getByTestId("recommendations-asker").waitFor({ state: "detached", timeout: 20_000 });
  const daee = await login(assigned);
  await daee.goto(`${BASE}/ar/daee/${conversation}`);
  const daeePanel = await waitResult(daee, "daee");
  await daee.waitForTimeout(100);
  check("authorized daee API succeeds", responses.some((value) => value.audience === "daee" && value.status === 200 && value.evidence === "local_server"));
  check("assigned daee receives contextual recommendation through actual API", requests.some((value) => value.audience === "daee"));
  check("daee remains responsible for any answer", await daeePanel.getByText(/لا يُرسل شيء إلى السائل/).count() > 0);
  originalPassagesDisplayed = await daeePanel.locator("blockquote").count();
  await screenshot(daee, "daee-ar-desktop-actual-result.png", '[data-testid="recommendations-daee"]');
  // The explicit flag additionally requires acquisition to work on this run.
  // Whenever the supported live passage is present, validate the displayed original.
  const supportedOriginalPresent = originalPassagesDisplayed > 0 && await daeePanel.locator('a[href*="islamic-content.com/dictionary/word/1952"]').count() > 0;
  if (process.argv.includes("--require-source-proof") || supportedOriginalPresent) {
    check("real daee view displays an original source passage", originalPassagesDisplayed > 0);
    check("original source has scoped locator and reference", await daeePanel.getByText(/من موسوعة المصطلحات الإسلامية/).count() > 0 && await daeePanel.locator('a[href*="islamic-content.com/dictionary/word/1952"]').count() > 0);
    // Hash only: religious text remains in its source and private acquisition evidence.
    // Baseline acquired by fetchOriginalSource on 2026-10-05; changed source requires review.
    const shown = await daeePanel.locator("blockquote").first().textContent();
    check("displayed text equals the independently acquired original passage", createHash("sha256").update(shown).digest("hex") === "6684aea866f0083ebe9bdbb91a260460ea50f89d9e6ed66cbf342491e5a15a08");
    check("fresh source clearly requires specialist evaluation", await daeePanel.getByText("مرجع جديد · يحتاج تقييمك", { exact: true }).count() > 0);
    await screenshot(daee, "daee-original-source-reference.png", '[data-testid="recommendations-daee"] a[href*="islamic-content.com/dictionary/word/1952"]');
  }
  const humanBeforeReply = await query("count synthetic human replies", db.from("messages").select("id").eq("conversation_id", conversation).eq("sender_role", "daee"));
  check("recommendations do not insert a reply on the daee's behalf", (humanBeforeReply ?? []).length === 0);
  if (process.argv.includes("--mock-states")) {
    mocking = true;
    results.push(...await exerciseMockStates(daee, "daee", OUT));
    mocking = false;
  }
  const beforeReply = requests.length;
  await send(daee, "main textarea", "أهلا، سأستوضح ما تريد متابعته.");
  await asker.getByText("أهلا، سأستوضح ما تريد متابعته.", { exact: true }).waitFor({ timeout: 15_000 });
  await asker.waitForTimeout(1000);
  check("human dialogue suppresses asker recommendation requests", requests.filter((value) => value.audience === "asker").length === requests.slice(0, beforeReply).filter((value) => value.audience === "asker").length);
  const outsiderPage = await login(outsider);
  const denied = await outsiderPage.request.post(`${BASE}/api/recommendations/daee`, { data: { conversationId: conversation, contextVersion: requests.find((value) => value.audience === "daee").contextVersion, mode: "refresh", locale: "ar" } });
  check("unassigned daee cannot read recommendation context", [401, 403, 404].includes(denied.status()), { httpStatus: denied.status() });
  const adminPage = await login(admin);
  const adminDenied = await adminPage.request.post(`${BASE}/api/recommendations/daee`, { data: { conversationId: conversation, contextVersion: requests.find((value) => value.audience === "daee").contextVersion, mode: "refresh", locale: "ar" } });
  check("admin cannot read recommendation context", [401, 403, 404].includes(adminDenied.status()), { httpStatus: adminDenied.status() });
  const beforeClose = requests.filter((value) => value.audience === "daee").length;
  await daee.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await send(asker, "footer textarea", "كيف نتحقق من الحديث؟");
  await daee.getByText("كيف نتحقق من الحديث؟", { exact: true }).last().waitFor({ timeout: 15_000 });
  await daee.waitForTimeout(1500);
  check("closed daee panel stops subsequent requests", requests.filter((value) => value.audience === "daee").length === beforeClose);
  const reopenedResponse = daee.waitForResponse((response) => response.url().endsWith("/api/recommendations/daee") && response.status() === 200, { timeout: 40_000 });
  await daee.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await reopenedResponse;
  await waitResult(daee, "daee");
  await daee.setViewportSize(sizes.mobile);
  await daee.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await daee.getByTestId("recommendations-daee").waitFor();
  await screenshot(daee, "daee-ar-mobile-actual-queued.png", '[data-testid="recommendations-daee"]');
  await waitResult(daee, "daee");
  await screenshot(daee, "daee-ar-mobile-actual-result.png", '[data-testid="recommendations-daee"]');
  await query("disable local AI", db.from("organizations").update({ ai_enabled: false }).eq("id", organization));
  const off = await query("confirm local AI switch", db.from("organizations").select("ai_enabled").eq("id", organization).single());
  check("AI off persisted in the synthetic organization", off.ai_enabled === false);
  const beforeOff = requests.length;
  await daee.reload();
  await daee.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await daee.getByTestId("recommendations-daee").waitFor();
  await daee.getByTestId("recommendations-daee").getByText("المرشد الذكي متوقف. يمكنك متابعة الحوار كالمعتاد.", { exact: true }).waitFor({ timeout: 20_000 });
  await screenshot(daee, "daee-ar-mobile-ai-off.png", '[data-testid="recommendations-daee"]');
  await daee.waitForTimeout(1000);
  check("AI off does not schedule a recommendation", requests.length === beforeOff);
  const disabled = await daee.request.post(`${BASE}/api/recommendations/daee`, { data: { conversationId: conversation, contextVersion: requests.find((value) => value.audience === "daee").contextVersion, mode: "refresh", locale: "ar" } });
  const disabledBody = await disabled.json();
  check("AI off is also enforced by server", disabledBody.status === "disabled" || disabledBody.result?.status === "disabled");
  const jobs = await query("read numeric local usage only", db.from("recommendation_jobs").select("audience,model_calls,model_steps,searches,fetches,input_tokens,output_tokens,elapsed_ms,estimated_usd,pricing_verified,reason:result->>reason").eq("conversation_id", conversation));
  check("all local jobs have zero paid calls", jobs.every((job) => job.model_calls === 0 && job.input_tokens === 0 && job.output_tokens === 0));
  writeFileSync(join(OUT, "usage.json"), JSON.stringify(jobs, null, 2) + "\n");
} catch (error) {
  results.push({ name: "browser flow completed", ok: false, errorClass: error.name, message: error.message.slice(0, 250) });
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  const cleanup = async (name, action) => {
    try { await action(); } catch {
      results.push({ name, ok: false, errorClass: "CleanupError" });
      process.exitCode = 1;
    }
  };
  // Only exact synthetic identities and organization created by this invocation.
  // Remove the asker first: its conversation cascade releases assigned-staff FKs.
  for (const id of [askerId, ...identities].filter(Boolean)) await cleanup("remove owned synthetic identity", () => query("remove owned synthetic user", db.auth.admin.deleteUser(id)));
  if (organization) {
    await cleanup("remove owned synthetic events", () => query("remove owned synthetic events", db.from("events").delete().eq("org_id", organization)));
    await cleanup("remove owned synthetic runs", () => query("remove owned synthetic runs", db.from("ai_runs").delete().eq("org_id", organization)));
    await cleanup("remove owned synthetic organization", () => query("remove owned synthetic organization", db.from("organizations").delete().eq("id", organization)));
  }
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ provenance: "Real LOCAL Auth/Postgres/Realtime/Next/browser; synthetic accounts; no paid calls. Any original source text in daee view still requires scientific evaluation; MOCK UI images are separately labelled.", testRuntime, results, browserErrors, requestCount: requests.length, requests, responses, originalPassagesDisplayed }, null, 2) + "\n");
  console.log(JSON.stringify({ artifactDirectory: OUT, passed: results.filter((entry) => entry.ok).length, failed: results.filter((entry) => !entry.ok).length, localServerRequests: requests.filter((entry) => entry.evidence === "local_server").length, mockedUiRequests: requests.filter((entry) => entry.evidence === "mock_ui").length, paidCalls: 0, originalPassagesDisplayed }));
}
