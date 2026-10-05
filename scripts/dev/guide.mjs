// LOCAL VERIFICATION ONLY: the asker guide on the waiting screen, with the real model.
//   node --env-file=.env.local scripts/dev/guide.mjs   (needs a build at VERIFY_BASE)
// Staff passwords come from DEMO_PASSWORD inside this process and are never printed.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3127";
const OUT = "docs/screenshots";
const SIZES = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };
const TAG = Date.now().toString(36);
const ORG = "00000000-0000-4000-8000-000000000001";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
async function shots(page, name) {
  for (const [w, size] of Object.entries(SIZES)) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-${w}.png` });
  }
  await page.setViewportSize(SIZES[1440]);
}
async function ask(browser, pseudonym, question) {
  const page = await (await browser.newContext({ viewport: SIZES[1440] })).newPage();
  await page.goto(`${BASE}/ar/enter`);
  await page.locator('main form button[type="submit"]:not([disabled])').waitFor();
  await page.locator("main input:not([type=hidden])").fill(pseudonym);
  await page.locator("main input:not([type=hidden])").press("Enter");
  await page.locator('button[name="skip"]').click();
  await page.locator("p[dir=ltr]").waitFor({ timeout: 20_000 });
  await page.locator('a[href$="/wait"]').click();
  const q = page.locator('textarea[name="question"]');
  await q.waitFor();
  await q.fill(question);
  await q.press("Enter");
  await page.waitForURL("**/chat/**", { timeout: 30_000 });
  return { page, id: page.url().split("/chat/")[1] };
}
const events = async (id) => (await db.from("events").select("type, meta").eq("conversation_id", id)).data ?? [];
const conv = async (id) => (await db.from("conversations").select("guide_summary, topic, depth, level, classified_by, daee_id, status").eq("id", id).single()).data;
/** Answer the guide until it shows the summary (at most three questions). */
async function answerUntilSummary(page, answers) {
  for (let i = 0; i < 4; i++) {
    const state = await Promise.race([
      page.getByTestId("classification").waitFor({ timeout: 40_000 }).then(() => "summary"),
      page.getByTestId("guide-question").waitFor({ timeout: 40_000 }).then(() => "question"),
    ]);
    if (state === "summary") return i;
    const box = page.locator("footer textarea");
    await box.fill(answers[Math.min(i, answers.length - 1)]);
    await box.press("Enter");
    await page.getByTestId("guide").and(page.locator("[data-phase=thinking]")).waitFor({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  return 4;
}

// Nobody available, so every asker waits and the guide runs.
const { data: staff } = await db.from("profiles").select("user_id, display_name, status").eq("role", "daee");
const KHALID = staff.find((s) => s.display_name === "خالد").user_id;
await db.from("organizations").update({ ai_enabled: true }).eq("id", ORG);
await db.from("profiles").update({ status: "offline" }).eq("role", "daee");

const browser = await chromium.launch();
try {
  // ---- 1. A clear question: no questions, straight to the summary --------------------------
  const a = await ask(browser, `gd1-${TAG}`, "ما معنى سورة الفاتحة ولماذا تُقرأ في كل صلاة؟");
  await a.page.getByTestId("guide").waitFor({ timeout: 15_000 });
  await a.page.getByTestId("classification").waitFor({ timeout: 40_000 });
  check("clear question: summary with no questions", (await a.page.getByTestId("guide-question").count()) === 0);
  await shots(a.page, "guide-summary-ar");
  await a.page.getByRole("button", { name: "صحيح" }).click();
  await a.page.locator("[data-testid=guide][data-phase=confirmed]").waitFor({ timeout: 15_000 });
  const ca = await conv(a.id);
  check("confirmed summary stored with topic, depth and level", Boolean(ca.guide_summary) && Boolean(ca.level) && ca.classified_by === "ai", `${ca.topic}/${ca.depth}/${ca.level}`);
  const ea = await events(a.id);
  check("guide_started and guide_done { questions: 0, skipped: false }", ea.some((e) => e.type === "guide_started") && ea.some((e) => e.type === "guide_done" && e.meta.questions === 0 && e.meta.skipped === false));
  check("classified from the guide summary", ea.some((e) => e.type === "classified" && e.meta.from === "guide"));
  await a.page.getByTestId("readings").waitFor({ timeout: 15_000 });
  await a.page.getByTestId("readings").locator("blockquote, p.border-dashed").first().waitFor({ timeout: 60_000 });
  check("readings under the orb after confirming", true);
  if ((await a.page.getByTestId("readings").locator("blockquote").count()) > 0) {
    check("readings labeled excerpt, with a link to the full source", (await a.page.getByText("مقتطف").count()) > 0 && (await a.page.getByRole("link", { name: /اقرأ المصدر كاملًا/ }).count()) > 0);
  }
  await shots(a.page, "guide-confirmed-ar");

  // ---- 2. A vague message: one question at a time, then the summary ------------------------
  const b = await ask(browser, `gd2-${TAG}`, "عندي سؤال");
  await b.page.getByTestId("guide-question").waitFor({ timeout: 40_000 });
  check("vague message: the guide asks one question", (await b.page.getByTestId("guide-question").count()) === 1);
  check("mic or typing: the composer answers the guide", await b.page.getByPlaceholder("أجب المرشد…").isVisible());
  await shots(b.page, "guide-question-ar");
  const asked = await answerUntilSummary(b.page, ["أريد أن أفهم الصلاة في الإسلام", "كيف يصلي المسلم وكم مرة في اليوم", "مجرد فهم عام"]);
  check("at most three questions", asked <= 3, `asked=${asked}`);
  const eb = await events(b.id);
  check("guide_question logged per question (≤ 3)", eb.filter((e) => e.type === "guide_question").length <= 3 && eb.some((e) => e.type === "guide_question"));

  // ---- 3. A religious question to the guide: "the dāʿī will answer this" --------------------
  const c = await ask(browser, `gd3-${TAG}`, "سؤال");
  await c.page.getByTestId("guide-question").waitFor({ timeout: 40_000 });
  await c.page.locator("footer textarea").fill("هل الصلاة واجبة على كل مسلم؟ أجبني أنت");
  await c.page.locator("footer textarea").press("Enter");
  await c.page.getByText("هذا سيجيب عنه الداعية").first().waitFor({ timeout: 40_000 }).catch(() => {});
  const refusedShown = (await c.page.getByText("هذا سيجيب عنه الداعية").count()) > 0;
  const ec = await events(c.id);
  check("religious question: refusal line shown and guide_refused logged", refusedShown && ec.some((e) => e.type === "guide_refused"));
  check("the guide never answers it (no ruling on screen)", !/نعم[،,]? (الصلاة )?واجبة|فرض عين/.test((await c.page.getByTestId("guide").textContent()) ?? ""));

  // ---- 4. Skip at any time ------------------------------------------------------------------
  await c.page.getByRole("button", { name: "تخطَّ وانتظر الداعية" }).click();
  await c.page.locator("[data-testid=guide][data-phase=skipped]").waitFor({ timeout: 10_000 });
  let skippedLogged = false;
  for (let i = 0; i < 10 && !skippedLogged; i++) {
    await c.page.waitForTimeout(500);
    skippedLogged = (await events(c.id)).some((e) => e.type === "guide_done" && e.meta.skipped === true);
  }
  check("skip: guide_done { skipped: true }", skippedLogged);

  // ---- 5. A personal ruling: level d, the daee strip says it needs a specialist -------------
  // Nobody available while the guide runs; خالد joins after the summary is confirmed.
  const d = await ask(browser, `gd4-${TAG}`, "هل يجوز لي أن أجمع صلاة الظهر والعصر لأني أعمل طوال اليوم؟");
  await answerUntilSummary(d.page, ["أعمل في مكتب طوال اليوم", "أريد أن أعرف ما يجوز لي", "هذا كل شيء"]);
  await d.page.getByRole("button", { name: "صحيح" }).click();
  await d.page.locator("[data-testid=guide][data-phase=confirmed]").waitFor({ timeout: 15_000 });
  const cd = await conv(d.id);
  check("personal ruling: level d", cd.level === "d", `level=${cd.level}`);
  await db.from("conversations").update({ daee_id: KHALID, assigned_at: new Date().toISOString() }).eq("id", d.id);
  const d1 = await (await browser.newContext({ viewport: SIZES[1440] })).newPage();
  await d1.goto(`${BASE}/en/login`);
  await d1.locator("#login-email").fill("daee1@wasl.demo");
  await d1.locator("#login-password").fill(process.env.DEMO_PASSWORD);
  await d1.locator('form button[type="submit"]').click();
  await d1.waitForURL("**/daee**", { timeout: 20_000 });
  await d1.goto(`${BASE}/ar/daee/${d.id}`);
  await d1.getByTestId("needs-specialist").waitFor({ timeout: 15_000 });
  check("daee strip: يتطلب مختصًا (amber)", (await d1.getByTestId("needs-specialist").textContent()).includes("يتطلب مختصًا"));
  check("level d: no readings in the daee panel", (await d1.getByTestId("readings").count()) === 0);
  await d1.screenshot({ path: `${OUT}/guide-specialist-daee-ar-1440.png` });
  await db.from("profiles").update({ status: "offline" }).eq("user_id", KHALID);

  // ---- 6. A daee joins mid-step: the guide stops at once ------------------------------------
  const e = await ask(browser, `gd5-${TAG}`, "استفسار");
  await e.page.getByTestId("guide-question").waitFor({ timeout: 40_000 });
  await db.from("conversations").update({ daee_id: KHALID, assigned_at: new Date().toISOString() }).eq("id", e.id);
  await e.page.getByTestId("guide").waitFor({ state: "detached", timeout: 30_000 });
  check("a daee joins: the guide stops", (await e.page.getByTestId("guide").count()) === 0);
  await e.page.waitForTimeout(1500);
  check("guide_done logged when stopped", (await events(e.id)).some((x) => x.type === "guide_done"));

  // ---- Voice: the server speaks through ElevenLabs (key never in the browser) --------------
  const tts = await a.page.request.post(`${BASE}/api/tts`, { data: { text: "ما الذي تودّ معرفته؟", locale: "ar" } });
  const type = tts.headers()["content-type"] ?? "";
  check("speech out: the server route returns audio (or 204 without a key)", (tts.status() === 200 && type.startsWith("audio/")) || tts.status() === 204, `${tts.status()} ${type}`);
  const html = await (await fetch(`${BASE}/ar`)).text();
  check("no ElevenLabs key in the page", !html.includes(process.env.ELEVENLABS_API_KEY ?? "@@none@@"));

  // ---- AI off: no guide, the waiting screen as before ---------------------------------------
  await db.from("organizations").update({ ai_enabled: false }).eq("id", ORG);
  const f = await ask(browser, `gd6-${TAG}`, "عندي سؤال عن الصيام");
  await f.page.waitForTimeout(2000);
  check("AI off: no guide on the waiting screen", (await f.page.getByTestId("guide").count()) === 0);
} catch (error) {
  results.push(`ERROR  ${error.message.split("\n")[0]}  at ${(error.stack.match(/guide\.mjs:\d+/) ?? [""])[0]}`);
} finally {
  await browser.close();
  await db.from("organizations").update({ ai_enabled: true }).eq("id", ORG);
  for (const s of staff) await db.from("profiles").update({ status: s.status }).eq("user_id", s.user_id);
  const { data: askers } = await db.from("askers").select("user_id").like("pseudonym", `gd_-${TAG}`);
  for (const x of askers ?? []) {
    const { data: convs } = await db.from("conversations").select("id").eq("asker_id", x.user_id);
    for (const cv of convs ?? []) {
      await db.from("events").delete().eq("conversation_id", cv.id);
      await db.from("notifications").delete().eq("payload->>conversation_id", cv.id);
    }
    await db.from("ai_runs").delete().eq("actor_id", x.user_id);
    await db.auth.admin.deleteUser(x.user_id);
  }
  console.log(results.join("\n"));
}
