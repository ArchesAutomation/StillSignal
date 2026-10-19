import assert from "node:assert/strict";
import { chromium } from "playwright";

// Run only against the isolated UI review app described in STAGING_REVIEW.md.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const waitForFeed = async (text) => {
  await page.waitForFunction((expected) =>
    document.querySelector(".feed-status")?.textContent?.trim().endsWith(" · " + expected), text);
  await page.getByRole("img", { name: /Synchronized market candles/ }).waitFor();
};
try {
  await page.goto(new URL("/review", process.env.OVERVIEW_TEST_URL || "http://127.0.0.1:3100").href);
  await page.locator(".review-banner").filter({ hasText: "Synthetic" }).waitFor();
  await waitForFeed("75 candles");
  await page.getByLabel("Workspace instrument").selectOption("");
  await waitForFeed("75 candles");

  for (const [interval, count] of [[300, 15], [900, 5], [3600, 2], [60, 75]]) {
    await page.getByLabel("Candle interval").selectOption(String(interval));
    await waitForFeed(`${count} candles`);
    assert.equal(await page.getByLabel("Candle interval").inputValue(), String(interval));
    assert.ok(await page.locator(".synced-chart canvas").count() > 0);
    console.log(`${interval / 60}m: ${count} candles rendered`);
  }
  await page.getByLabel("Volume", { exact: true }).check();
  assert.equal(await page.getByLabel("Volume", { exact: true }).isChecked(), true);
  const heights = () => page.locator(".synced-chart canvas").evaluateAll((nodes) => nodes.map((node) => node.height));
  await page.getByLabel("Heart-rate pane size").selectOption("90");
  const compact = await heights();
  await page.getByLabel("Heart-rate pane size").selectOption("180");
  await page.waitForFunction((before) =>
    JSON.stringify([...document.querySelectorAll(".synced-chart canvas")].map((node) => node.height)) !== JSON.stringify(before), compact);
  const chart = page.locator(".synced-chart");
  const all = await chart.screenshot();
  await page.locator(".segmented").getByRole("button", { name: "15m", exact: true }).click();
  const limited = await chart.screenshot();
  assert.equal(all.equals(limited), false, "15m range must change the rendered chart");
  await page.getByRole("button", { name: "Return to live", exact: true }).click();
  for (const tab of ["Settings", "Overview"]) {
    await page.locator("nav").getByRole("button", { name: tab, exact: true }).click();
  }
  await waitForFeed("75 candles");
  await page.getByRole("button", { name: "Replay session", exact: true }).click();
  await page.getByLabel("Replay position").waitFor();
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await waitForFeed("75 candles");
  assert.deepEqual(errors, [], "Overview must not throw browser errors");
  console.log("Overview: instrument selection, volume, pane sizing, ranges, return to live, navigation, and replay passed");
} finally {
  await browser.close();
}
