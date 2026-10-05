// MOCKED HTTP response states. UI coverage only, never live-source/model evidence.
import assert from "node:assert/strict";
import { join } from "node:path";
import { createHash } from "node:crypto";

export async function exerciseMockStates(page, audience, directory) {
  const results = [];
  const endpoint = `**/api/recommendations/${audience}`;
  const fixtureBody = "مادة اختبار واجهة اصطناعية غير دينية. هذا النص يختبر عرض المقاطع فقط ولا يمثل محتوى من الحزمة العلمية.";
  const usage = { modelCalls: 0, modelSteps: 0, searches: 0, fetches: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, uncachedInputTokens: 0, costEstimateUsd: 0, elapsedMs: 0, pricingVerified: false, providerReportedSearches: null, voiceCostUsd: 0, codexDevelopmentCostIncluded: false };
  let scenario = "success", calls = 0, releaseLoading;
  const handler = async (route) => {
    calls++;
    const request = route.request().postDataJSON();
    if (scenario === "loading") await new Promise((resolve) => { releaseLoading = resolve; });
    if (scenario === "error") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
    const status = scenario === "clarification" ? "needs_clarification" : scenario === "partial" ? "partial" : scenario === "refer" ? "refer" : "sufficient";
    const materials = ["success", "partial", "loading"].includes(scenario) ? [{ id: "mock-ui-material", sourceId: "mock-fixture", title: "MOCK UI — مادة اختبار اصطناعية غير دينية", sourceUrl: "https://example.invalid/ui-fixture", locator: "fixture line 1; not an acquired source", bodyVerbatim: fixtureBody, contentHash: createHash("sha256").update(fixtureBody).digest("hex"), review: audience === "asker" ? "released" : "daee_evaluation_required" }] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ requestId: "mock-ui-request", contextVersion: request.contextVersion, status, reason: "mock_ui_only", materials, clarification: scenario === "clarification" ? "specific_question" : null, usage, generatedReligiousAnswer: false }) });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(endpoint, handler);
  const originalUrl = page.url();
  try {
    for (const state of ["loading", "success", "partial", "clarification", "refer", "error"]) {
      scenario = state;
      const before = calls;
      const url = new URL(originalUrl);
      url.searchParams.set("mock-ui-state", state);
      await page.goto(url.toString());
      const panel = page.getByTestId(`recommendations-${audience}`);
      await panel.waitFor({ timeout: 20_000 });
      for (let count = 0; calls === before && count < 1000; count++) await page.waitForTimeout(10);
      assert.ok(calls > before, `MOCK UI ${state} received its own request`);
      if (state === "loading") {
        await panel.getByText("جارٍ البحث عن مادة مفيدة من المصادر…", { exact: true }).waitFor({ timeout: 10_000 });
        await panel.screenshot({ path: join(directory, `mock-ui-${audience}-loading.png`) });
        for (let count = 0; !releaseLoading && count < 100; count++) await page.waitForTimeout(10);
        assert.equal(typeof releaseLoading, "function");
        releaseLoading();
        await panel.getByText(fixtureBody, { exact: true }).waitFor();
      } else if (state === "success" || state === "partial") {
        await panel.getByText(state === "success" ? "مادة مصدرية ذات صلة بالسؤال الحالي." : "المادة المتاحة غير كافية. قد تساعدك هذه المراجع على المتابعة.", { exact: true }).waitFor({ timeout: 10_000 });
        await panel.getByText(fixtureBody, { exact: true }).waitFor({ timeout: 10_000 });
        assert.equal(await panel.getByRole("link").getAttribute("href"), "https://example.invalid/ui-fixture");
      } else if (state === "clarification") {
        await panel.getByText("ما السؤال المحدد الذي تريد مناقشته؟", { exact: true }).waitFor({ timeout: 10_000 });
      } else if (state === "refer") {
        await panel.getByText(/هذا السؤال يحتاج الداعية البشري/).waitFor({ timeout: 10_000 });
      } else {
        await panel.getByText(/تعذر تحميل المراجع/).waitFor({ timeout: 10_000 });
        const retry = panel.getByRole("button", { name: "إعادة المحاولة", exact: true });
        assert.equal(await retry.isEnabled(), true);
        await panel.screenshot({ path: join(directory, `mock-ui-${audience}-error.png`) });
        const count = calls;
        scenario = "success";
        await retry.click();
        await panel.getByText(fixtureBody, { exact: true }).waitFor({ timeout: 25_000 });
        assert.equal(calls, count + 1);
      }
      if (state !== "loading") await panel.screenshot({ path: join(directory, `mock-ui-${audience}-${state === "error" ? "retry-success" : state}.png`) });
      results.push({ name: `MOCK UI ${audience} ${state}`, ok: true });
    }
  } catch (error) {
    await page.screenshot({ path: join(directory, `mock-ui-${audience}-failure.png`) });
    throw error;
  } finally {
    if (releaseLoading) releaseLoading();
    await page.unroute(endpoint, handler);
  }
  return results;
}
