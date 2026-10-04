// Renders the share image per locale from /[locale]/dev/og into public/og/<locale>.png.
// Needs a running build at BASE (default http://localhost:3127):  npm run og
import { chromium } from "playwright";

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3127";
const LOCALES = ["ar", "en", "fr", "es", "ur", "id", "tl"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const locale of LOCALES) {
  await page.goto(`${BASE}/${locale}/dev/og`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#og").screenshot({ path: `public/og/${locale}.png` });
  console.log(`public/og/${locale}.png`);
}
await browser.close();
