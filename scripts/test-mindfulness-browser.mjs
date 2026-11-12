import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

// The review route seeds synthetic, device-local data. Never run this against production.
const origin = new URL(process.env.STILL_SIGNAL_BROWSER_ORIGIN || "http://localhost:3000");
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname), "Use a local isolated review server");
const artifacts = process.env.STILL_SIGNAL_BROWSER_ARTIFACTS;
if (artifacts) await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const outbound = [];
  page.on("pageerror", error => errors.push(error.message));
  context.on("request", request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin.origin) outbound.push(request.url());
  });
  await page.goto(new URL("/review", origin).href);
  const navigate = label => page.getByRole("button", { name: label, exact: true }).first().click();
  await page.getByRole("button", { name: "Daily journal", exact: true }).first().waitFor();
  assert.equal(await page.locator(".ss-reference-more, [data-nordify], .shark-background, .appearance-controls, [data-glass-surface]").count(), 0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const label of ["Home", "Preparation", "Daily journal", "Done for the day", "Stillness"]) {
      await navigate(label);
      assert.equal(await page.locator("html").getAttribute("data-journal-presentation"), "reading-room");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} must fit ${width}px`);
      if (artifacts) await page.screenshot({ path: join(artifacts, `${width}-${label.toLowerCase().replaceAll(" ", "-")}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate("Preparation");
  await page.getByRole("button", { name: /Initial setup/ }).click();
  await page.getByRole("button", { name: "Open today's preparation →", exact: true }).click();
  await page.getByRole("button", { name: /Routine library & advanced settings/ }).waitFor();
  await navigate("Done for the day");
  await page.getByRole("button", { name: "Open Trade Quality ↗", exact: true }).click();
  await page.getByText("Strategy playbooks", { exact: true }).first().waitFor();
  await navigate("Daily journal");
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Start session", exact: true }).first().click();
  const popup = await popupPromise;
  popup.on("pageerror", error => errors.push(error.message));
  await popup.getByText("Capture the moment", { exact: true }).waitFor();
  assert.equal(await popup.getByRole("button", { name: "Record moment", exact: true }).count(), 1);
  await popup.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, []);
  console.log("Passed: five pages at desktop/mobile widths, preparation setup, trade review, live recorder popup; no outbound requests or page errors.");
} finally {
  await browser.close();
}
