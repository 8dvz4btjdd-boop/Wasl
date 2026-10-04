// LOCAL VERIFICATION ONLY: the three manual journeys end to end, with two daee and askers.
//   node --env-file=.env.local scripts/dev/journey.mjs   (needs a running build at VERIFY_BASE)
// Staff passwords come from DEMO_PASSWORD inside this process and are never printed.
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3127";
const OUT = "docs/screenshots";
const SIZES = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };
const TAG = Date.now().toString(36);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) console.error(`FAIL ${name} ${detail}`);
};
async function shots(page, name) {
  for (const [w, size] of Object.entries(SIZES)) {
    await page.setViewportSize(size);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${name}-${w}.png` });
  }
  await page.setViewportSize(SIZES[1440]);
}
async function login(browser, email, landing) {
  const context = await browser.newContext({ viewport: SIZES[1440] });
  const page = await context.newPage();
  await page.goto(`${BASE}/en/login`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(process.env.DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${landing}**`, { timeout: 20_000 });
  return page;
}
async function enter(page, pseudonym) {
  await page.goto(`${BASE}/en/enter`);
  await page.locator('main form button[type="submit"]:not([disabled])').waitFor();
  await page.locator("main input:not([type=hidden])").fill(pseudonym);
  await page.locator("main input:not([type=hidden])").press("Enter");
  await page.locator('button[name="skip"]').click();
  await page.locator("p[dir=ltr]").waitFor({ timeout: 20_000 });
  const code = await page.locator("p[dir=ltr]").textContent();
  await page.locator('a[href$="/wait"]').click();
  return code;
}
async function ask(page, text) {
  const q = page.locator('textarea[name="question"]');
  await q.waitFor();
  await q.fill(text);
  await q.press("Enter");
  await page.waitForURL("**/chat/**", { timeout: 20_000 });
  return page.url().split("/chat/")[1];
}
async function say(page, selector, text) {
  const box = page.locator(selector);
  await box.waitFor();
  await box.fill(text);
  await box.press("Enter");
}
const events = async (conversationId) =>
  (await db.from("events").select("type, meta").eq("conversation_id", conversationId)).data ?? [];

const { data: staff } = await db.from("profiles").select("user_id, display_name").eq("role", "daee");
const id = (name) => staff.find((s) => s.display_name === name).user_id;
const DAEE1 = id("خالد"), DAEE2 = id("سارة");
const setStatus = (user, status) => db.from("profiles").update({ status }).eq("user_id", user);

const browser = await chromium.launch();
try {
  await setStatus(DAEE1, "available");
  await setStatus(DAEE2, "busy");
  const d1 = await login(browser, "daee1@wasl.demo", "/daee");
  const d2 = await login(browser, "daee2@wasl.demo", "/daee");

  // ---- 1. First conversation with daee1 ------------------------------------------------
  const askerCtx = await browser.newContext({ viewport: SIZES[1440] });
  const asker = await askerCtx.newPage();
  const pseudonym = `jr-${TAG}`;
  const code = await enter(asker, pseudonym);
  const conv1 = await ask(asker, "I read about prayer and want to understand it better.");
  const row = d1.locator("aside a", { hasText: pseudonym });
  await row.waitFor({ timeout: 15_000 });
  await row.click();
  await d1.waitForURL(`**/daee/${conv1}`);
  await say(d1, "main textarea", "Welcome. Prayer is a daily practice; let's start with what you've read so far.");
  await asker.getByText("let's start with what you've read").first().waitFor({ timeout: 15_000 });
  await say(asker, "footer textarea", "I read that there are five daily prayers.");
  await d1.getByText("five daily prayers").first().waitFor({ timeout: 15_000 });
  check("chat with daee1 both ways", true);

  // ---- 2. Manual card ---------------------------------------------------------------------
  await asker.locator(`a[href$="/card/${conv1}"]`).first().click();
  await asker.waitForURL(`**/card/${conv1}`);
  await asker.locator("ul li label").nth(0).click();
  await asker.locator("ul li label").nth(2).click();
  await shots(asker, "card-select-en");
  await asker.getByRole("button", { name: "Continue" }).click();
  await asker.locator("#card-follow_up").fill("How the five prayers fit into a working day.");
  await asker.locator("#card-covered").fill("What the five daily prayers are.");
  await asker.locator("#card-next_step").fill("Talk through a typical day.");
  await shots(asker, "card-fields-en");
  await asker.getByRole("button", { name: "Continue" }).click();
  await asker.locator("label", { hasText: "The team" }).click();
  await asker.getByRole("radio", { name: "7 days" }).click();
  await shots(asker, "card-sharing-en");
  await asker.getByRole("button", { name: "Continue" }).click();
  await shots(asker, "card-review-en");
  await asker.getByRole("button", { name: "Approve and share" }).click();
  await asker.getByText(/Approved\. Visible until/).first().waitFor({ timeout: 15_000 });
  const { data: card } = await db.from("cards").select("*").eq("conversation_id", conv1).single();
  check("card stored approved, version 1, team, 2 sources", card.status === "approved" && card.version === 1 && card.visibility === "team" && card.source_message_ids.length === 2);
  check("empty field saved as غير محدد", card.remaining === "غير محدد");
  const ev1 = await events(conv1);
  check("card_generated (manual) logged", ev1.some((e) => e.type === "card_generated" && e.meta.origin === "manual"));
  check("card_approved (manual, edited_major false) logged", ev1.some((e) => e.type === "card_approved" && e.meta.origin === "manual" && e.meta.edited_major === false));

  // Arabic: the approved view, then a new version's steps (not approved, so nothing changes).
  await asker.goto(`${BASE}/ar/card/${conv1}`);
  await asker.getByRole("button", { name: "نسخة جديدة" }).waitFor();
  await shots(asker, "card-approved-ar");
  await asker.getByRole("button", { name: "نسخة جديدة" }).click();
  await shots(asker, "card-select-ar");
  await asker.getByRole("button", { name: "متابعة" }).click();
  await shots(asker, "card-fields-ar");
  await asker.getByRole("button", { name: "متابعة" }).click();
  await shots(asker, "card-sharing-ar");
  await asker.getByRole("button", { name: "متابعة" }).click();
  await shots(asker, "card-review-ar");
  check("Arabic card builder renders all steps", (await db.from("cards").select("id").eq("conversation_id", conv1)).data.length === 1);

  // ---- 3. Card in daee1's panel ----------------------------------------------------------
  await d1.reload();
  await d1.getByText("How the five prayers fit into a working day.").first().waitFor({ timeout: 15_000 });
  await d1.getByRole("button", { name: "Sources (2)" }).click();
  await d1.locator("aside li", { hasText: "five daily prayers" }).first().waitFor();
  check("daee1 sees the card with its sources", true);
  await shots(d1, "inbox-card-en");

  // ---- 4. Transfer to daee2 ---------------------------------------------------------------
  await setStatus(DAEE2, "available");
  await d1.locator("main header").getByRole("button", { name: "Transfer" }).click();
  await d1.getByRole("radio", { name: /سارة/ }).click();
  await d1.screenshot({ path: `${OUT}/transfer-menu-en-1440.png` });
  await d1.getByRole("dialog").getByRole("button", { name: "Transfer" }).click();
  await d1.waitForURL(/\/daee$/, { timeout: 15_000 });
  await d2.locator("[data-sonner-toast]", { hasText: "transferred" }).waitFor({ timeout: 15_000 });
  check("daee2 notified of transfer", true);
  await d2.goto(`${BASE}/en/daee/${conv1}`);
  await d2.getByText("How the five prayers fit into a working day.").first().waitFor({ timeout: 15_000 });
  check("daee2 sees the card before replying", true);
  await asker.goto(`${BASE}/en/chat/${conv1}`);
  await asker.getByText("Your conversation moved to سارة").first().waitFor({ timeout: 15_000 });
  check("asker sees the transfer line", true);
  await shots(asker, "chat-transfer-en");
  check("daee1 lost access", (await d1.goto(`${BASE}/en/daee/${conv1}`), /\/daee$/.test(d1.url())));
  check("transfer_completed logged", (await events(conv1)).some((e) => e.type === "transfer_completed" && e.meta.to_daee === DAEE2));

  // ---- 5. daee2 ends; the asker returns with the code -----------------------------------
  await say(d2, "main textarea", "Thank you, I have your card and will be glad to continue another time.");
  await d2.getByRole("button", { name: /End conversation/ }).click();
  await d2.getByRole("button", { name: "Confirm end" }).click();
  await asker.getByText("This conversation has ended").first().waitFor({ timeout: 15_000 });
  await askerCtx.close();

  const returnCtx = await browser.newContext({ viewport: SIZES[1440] });
  const back = await returnCtx.newPage();
  await back.goto(`${BASE}/en/return`);
  await back.locator('main form button[type="submit"]').waitFor();
  await back.waitForTimeout(800);
  await back.locator("#return-pseudonym").fill(pseudonym);
  await back.locator("#return-code").fill(code);
  await back.locator('main form button[type="submit"]').click();
  await back.waitForURL("**/wait", { timeout: 20_000 });
  await back.getByRole("button", { name: /Continue with خالد/ }).waitFor({ timeout: 15_000 });
  check("resume offers the same daee", true);
  await shots(back, "resume-en");
  await back.goto(`${BASE}/ar/wait`);
  await back.getByRole("button", { name: /تابع مع خالد/ }).waitFor();
  await shots(back, "resume-ar");
  await back.getByRole("button", { name: /تابع مع خالد/ }).click();
  const conv2 = await ask(back, "I'd like to continue about fitting prayer into my day.");
  const { data: fu } = await db.from("conversations").select("previous_conversation_id, card_id, followup_mode, preferred_daee_id, daee_id").eq("id", conv2).single();
  check("follow-up linked to previous conversation and card", fu.previous_conversation_id === conv1 && fu.card_id === card.id);
  check("follow-up with the same daee", fu.followup_mode === "manual" && fu.preferred_daee_id === DAEE1 && fu.daee_id === DAEE1);
  check("followup_started (manual) logged", (await events(conv2)).some((e) => e.type === "followup_started" && e.meta.mode === "manual"));

  // ---- 6. daee1 resumes and rates ----------------------------------------------------------
  await d1.goto(`${BASE}/en/daee/${conv2}`);
  await d1.getByText("How the five prayers fit into a working day.").first().waitFor({ timeout: 15_000 });
  await say(d1, "main textarea", "Welcome back. From your card, let's walk through a typical working day together.");
  await d1.getByText("Was the context enough to resume?").first().waitFor({ timeout: 15_000 });
  await shots(d1, "inbox-rating-en");
  await d1.locator("aside").getByRole("button", { name: "Yes" }).click();
  await d1.locator("aside").getByText("Recorded").first().waitFor({ timeout: 10_000 });
  check("followup_rated (manual, sufficient) logged", (await events(conv2)).some((e) => e.type === "followup_rated" && e.meta.mode === "manual" && e.meta.sufficient === true));
  for (const locale of ["ar"]) {
    await d1.goto(`${BASE}/${locale}/daee/${conv2}`);
    await d1.locator("aside").getByText("تم التسجيل").first().waitFor();
    await shots(d1, `inbox-rating-${locale}`);
  }
  await back.goto(`${BASE}/ar/chat/${conv2}`);
  await back.locator("footer textarea").waitFor();
  await shots(back, "chat-followup-ar");

  // ---- 7. A follow-up without a card (mode none) ------------------------------------------
  const ctx3 = await browser.newContext({ viewport: SIZES[1440] });
  const other = await ctx3.newPage();
  const pseudonym2 = `jr2-${TAG}`;
  await enter(other, pseudonym2);
  const conv3 = await ask(other, "A first question without a card.");
  const { data: c3 } = await db.from("conversations").select("daee_id").eq("id", conv3).single();
  const owner = c3.daee_id === DAEE1 ? d1 : d2;
  await owner.goto(`${BASE}/en/daee/${conv3}`);
  await owner.getByRole("button", { name: /End conversation/ }).click();
  await owner.getByRole("button", { name: "Confirm end" }).click();
  await other.getByText("This conversation has ended").first().waitFor({ timeout: 15_000 });
  await other.goto(`${BASE}/en/wait`);
  await other.getByText("This continues your previous conversation.").first().waitFor();
  const conv4 = await ask(other, "Coming back without a card.");
  check("followup_started (none) logged", (await events(conv4)).some((e) => e.type === "followup_started" && e.meta.mode === "none"));
  const { data: c4 } = await db.from("conversations").select("daee_id").eq("id", conv4).single();
  const owner4 = c4.daee_id === DAEE1 ? d1 : d2;
  await owner4.goto(`${BASE}/en/daee/${conv4}`);
  await say(owner4, "main textarea", "Welcome back. I don't have a card, so could you remind me where we stopped?");
  await owner4.locator("aside").getByRole("button", { name: "No" }).click();
  await owner4.locator("aside").getByText("Recorded").first().waitFor({ timeout: 10_000 });
  check("followup_rated (none, insufficient) logged", (await events(conv4)).some((e) => e.type === "followup_rated" && e.meta.mode === "none" && e.meta.sufficient === false));
  await owner4.getByRole("button", { name: /End conversation/ }).click();
  await owner4.getByRole("button", { name: "Confirm end" }).click();
  await other.goto(`${BASE}/en/chat/${conv4}`);
  await other.getByText("This conversation has ended").first().waitFor({ timeout: 15_000 });

  // ---- 8. Deactivation returns open conversations to the queue ---------------------------
  await setStatus(DAEE1, "offline");
  const conv5 = await ask((await other.goto(`${BASE}/en/wait`), other), "Another question for the deactivation check.");
  const { data: c5 } = await db.from("conversations").select("daee_id").eq("id", conv5).single();
  check("conversation routed to daee2", c5.daee_id === DAEE2);
  // daee2 starts it, so the reassignment below must not log conversation_started again.
  await d2.goto(`${BASE}/en/daee/${conv5}`);
  await say(d2, "main textarea", "Hello, I'm here. Tell me a little more about your question.");
  await other.getByText("Tell me a little more").first().waitFor({ timeout: 15_000 });
  const admin = await login(browser, "admin@wasl.demo", "/admin");
  await setStatus(DAEE1, "available");
  await admin.goto(`${BASE}/en/admin/team`);
  const row2 = admin.locator("tr", { hasText: "daee2@wasl.demo" });
  await row2.getByRole("button", { name: "Deactivate" }).click();
  await row2.getByRole("button", { name: "Confirm" }).click();
  await admin.locator("tr", { hasText: "daee2@wasl.demo" }).getByText("Deactivated").first().waitFor({ timeout: 15_000 });
  const { data: c5b } = await db.from("conversations").select("daee_id, status").eq("id", conv5).single();
  check("deactivated daee's conversation re-routed", c5b.daee_id === DAEE1, `daee=${c5b.daee_id === DAEE1 ? "daee1" : c5b.daee_id}`);
  await d2.goto(`${BASE}/en/daee/${conv1}`);
  check("deactivated daee loses access", !d2.url().includes(conv1));
  await admin.locator("tr", { hasText: "daee2@wasl.demo" }).getByRole("button", { name: "Reactivate" }).click();
  await admin.locator("tr", { hasText: "daee2@wasl.demo" }).getByRole("button", { name: "Deactivate" }).waitFor({ timeout: 15_000 });
  await d1.goto(`${BASE}/en/daee/${conv5}`);
  await say(d1, "main textarea", "Hello, I'm continuing with you from here.");
  await other.getByText("continuing with you from here").first().waitFor({ timeout: 15_000 });
  const started = (await events(conv5)).filter((e) => e.type === "conversation_started").length;
  check("conversation_started logged once across reassignment", started === 1, `count=${started}`);

  // ---- 8b. Card-first transfer whose target leaves before the asker answers ---------------
  await setStatus(DAEE2, "available");
  await d1.reload();
  await d1.locator("main header").getByRole("button", { name: "Transfer" }).click();
  await d1.getByRole("radio", { name: /سارة/ }).click();
  await d1.getByRole("dialog").getByText("Ask the asker for a card first").click();
  await d1.getByRole("dialog").getByRole("button", { name: "Transfer" }).click();
  await other.getByText("suggests continuing with").first().waitFor({ timeout: 15_000 });
  await setStatus(DAEE2, "offline");
  await other.getByText("isn't available right now").first().waitFor({ timeout: 30_000 });
  check("move now disabled with the reason", await other.getByRole("button", { name: "Move now" }).isDisabled());
  await shots(other, "chat-transfer-unavailable-en");
  await other.getByRole("button", { name: "Return to the queue" }).click();
  await other.getByText("Your conversation went back to the queue").first().waitFor({ timeout: 15_000 });
  check("asker sees the requeue line", true);
  const { data: tr5 } = await db.from("transfers").select("status, requeued_at").eq("conversation_id", conv5).order("created_at", { ascending: false }).limit(1).single();
  const { data: c5c } = await db.from("conversations").select("daee_id, status").eq("id", conv5).single();
  check("transfer dropped and conversation back in the queue", tr5.status === "declined" && tr5.requeued_at && c5c.status === "waiting" && c5c.daee_id === null, `daee=${c5c.daee_id} status=${c5c.status}`);

  // ---- 9. Admin KPIs show real n ----------------------------------------------------------
  for (const locale of ["en", "ar"]) {
    await admin.setViewportSize({ width: 1440, height: 1500 });
    await admin.goto(`${BASE}/${locale}/admin?range=today`);
    await admin.waitForTimeout(1200);
    await admin.screenshot({ path: `${OUT}/admin-overview-journeys-${locale}-1440.png` });
  }
  const { data: kpis } = await (async () => {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: "admin@wasl.demo", password: process.env.DEMO_PASSWORD });
    const from = new Date(Date.now() - 3600_000).toISOString(), to = new Date(Date.now() + 60_000).toISOString();
    const [k, cmp] = await Promise.all([c.rpc("admin_kpis", { p_from: from, p_to: to }), c.rpc("admin_comparison", { p_from: from, p_to: to })]);
    return { data: { k: k.data, cmp: cmp.data } };
  })();
  check("resumption KPI has real n", kpis.k.correct_resumption.n >= 1, `n=${kpis.k.correct_resumption.n}`);
  check("card accuracy KPI has real n", kpis.k.card_accuracy.n >= 1, `n=${kpis.k.card_accuracy.n}`);
  const byMode = Object.fromEntries(kpis.cmp.map((r) => [r.mode, r]));
  check("comparison has manual and none sessions", byMode.manual.sessions >= 1 && byMode.none.sessions >= 1, `manual=${byMode.manual.sessions} none=${byMode.none.sessions}`);
} catch (error) {
  results.push(`ERROR  ${error.message.split("\n")[0]}`);
} finally {
  await browser.close();
  await db.auth.admin.updateUserById(DAEE2, { ban_duration: "none" });
  const { data: askers } = await db.from("askers").select("user_id").like("pseudonym", "jr%-" + TAG);
  for (const a of askers ?? []) {
    const { data: convs } = await db.from("conversations").select("id").eq("asker_id", a.user_id);
    for (const c of convs ?? []) {
      await db.from("events").delete().eq("conversation_id", c.id);
      await db.from("notifications").delete().eq("payload->>conversation_id", c.id);
    }
    await db.auth.admin.deleteUser(a.user_id);
  }
  await setStatus(DAEE1, "available");
  await setStatus(DAEE2, "busy");
  console.log(results.join("\n"));
}
