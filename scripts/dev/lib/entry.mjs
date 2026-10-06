// Shared by the verification scripts: the entry flow now goes pseudonym → background →
// /wait (no return code shown), and with AI on /wait opens with the guide. Scripts that
// test other things skip the guide to reach the plain question box.
export async function plainQuestionBox(page) {
  const box = page.locator('textarea[name="question"]');
  const skip = page.getByTestId("guide-skip");
  await Promise.race([box.waitFor({ timeout: 30_000 }), skip.waitFor({ timeout: 30_000 })]).catch(() => {});
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await box.waitFor({ timeout: 30_000 });
}
