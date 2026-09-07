import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
await page.goto("http://127.0.0.1:5173");
await page
  .getByRole("heading", { name: "Compute, by the batch.", exact: false })
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/market-desktop.png",
  fullPage: true,
  animations: "disabled",
});
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "docs/screenshots/market-mobile.png",
  fullPage: true,
  animations: "disabled",
});
await browser.close();
