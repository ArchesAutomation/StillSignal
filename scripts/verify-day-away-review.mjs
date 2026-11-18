import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const url = new URL("/review", process.env.DAY_AWAY_REVIEW_URL || "http://127.0.0.1:3193");
assert.equal(url.hostname, "127.0.0.1", "Use the isolated loopback review app.");
const profile = await mkdtemp(join(tmpdir(), "still-signal-day-away-"));
let browser;
try {
  browser = await chromium.launchPersistentContext(profile, {
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    args: ["--disable-gpu", "--disable-crash-reporter"],
    viewport: { width: 1440, height: 950 },
  });
  const page = browser.pages()[0];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const button = name => page.getByRole("button", { name, exact: true });
  const nav = name => page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true });
  const sessions = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("trade-pulse-v1");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const count = db.transaction("sessions").objectStore("sessions").count();
      count.onsuccess = () => { db.close(); resolve(count.result); };
      count.onerror = () => { db.close(); reject(count.error); };
    };
  }));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZFwAAAAASUVORK5CYII=", "base64");

  await page.goto(url.href);
  await button("Day away from charts").waitFor();
  const baseline = await sessions();
  await button("Day away from charts").click();
  await page.getByText("Day away saved.", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Day away from charts", exact: true }).waitFor();
  await nav("Preparation").click();
  assert.equal(await page.getByRole("button", { name: /Start session/ }).count(), 0);
  await nav("Done for the day").click();
  await page.getByText("You’ve set today aside. Anything you saved is in your journal.", { exact: true }).waitFor();
  await nav("Home").click();
  await button("Add a reason").click();
  await page.locator("#rr-away-writing").fill("I wanted a little room today.");
  await button("Save").click();
  await button("Review charts").click();
  await page.getByLabel("Add screenshots").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: png },
    { name: "second.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByLabel("Timeframe (optional)").fill("15 min");
  await button("Image 2").click();
  await page.getByLabel("Timeframe (optional)").fill("1 min");
  await page.getByLabel("Caption (optional)").fill("The view I came back to after a walk.");
  await button("Move earlier").click();
  await page.locator("#rr-away-writing").fill("I noticed how much I wanted reassurance.");
  await button("Save").click();
  await page.getByText("The view I came back to after a walk.", { exact: true }).waitFor();
  await button("Enlarge screenshot").click();
  await page.getByRole("dialog", { name: "Enlarged screenshot" }).waitFor();
  await page.keyboard.press("Escape");
  await nav("Daily journal").click();
  await page.getByText("I wanted a little room today.", { exact: true }).waitFor();
  await button("Open reflection and charts").click();
  await page.getByText("The view I came back to after a walk.", { exact: true }).waitFor();
  assert.equal(await sessions(), baseline, "Away activity must not write a trading session.");

  await page.setViewportSize({ width: 390, height: 850 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Away journal fits a narrow viewport.");
  await nav("Home").click();
  await button("Return to trading day").click();
  await button("Open a saved example").click();
  await page.getByText("I traded the day before. I wanted a little room before coming back.", { exact: true }).waitFor();
  await nav("Home").click();
  await button("Day away from charts").click();
  await button("Continue a thought").click();
  await button("Open reflection").click();
  await button("Add a follow-up").click();
  await page.locator("#rr-away-writing").fill("I noticed the same feeling this morning.");
  await button("Save").click();
  await page.getByText("I noticed the same feeling this morning.", { exact: true }).waitFor();
  await button("Return to trading day").click();
  await button("Begin preparation").click();
  await page.getByText("Before I open the charts, I want to take a breath and notice whether I feel like I have something to prove.", { exact: true }).waitFor();
  await button("Mark as seen").click();
  await button("Mark as seen").waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log("Real review app passed: date choice survives reload, reason and chart order persist, no session row, away navigation, narrow layout, dated follow-up, and next-preparation reminder.");
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
}
