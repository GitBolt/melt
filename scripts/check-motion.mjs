import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page.getByRole("heading", { name: "Compute, by the batch." }).waitFor();
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
if (await page.locator(".pebble").count())
  throw Error("Unexpected decorative orb");
await page.screenshot({
  path: "docs/screenshots/market-desktop.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Agent API", exact: true }).click();
await page.waitForTimeout(350);
if (
  (await page
    .locator("[data-slot=gooey-nav-item][data-active=true]")
    .innerText()) !== "Agent API"
)
  throw Error("Rare navigation state mismatch");
await page.emulateMedia({ reducedMotion: "reduce" });
await page.getByRole("button", { name: "Market", exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(100);
await page.screenshot({
  path: "docs/screenshots/market-mobile.png",
  fullPage: true,
});
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("Mobile overflow");
console.log({
  rareNav: true,
  counters: await page.locator("[data-slot=animated-counter]").count(),
  reducedMotionNavigation: true,
  errors,
});
await browser.close();
