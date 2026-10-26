// Isolated fixtures only: exercise real PiP and popup windows, without a cloud account.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.UI_REVIEW_URL || "http://localhost:3105";
const output = process.env.REVIEW_OUTPUT_DIR || "../popup-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
});
const errors = [];
const context = await browser.newContext({ viewport: { width: 1215, height: 1292 } });
context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));

async function openFloating(page) {
  const menu = page.locator(".ss-reference-tools");
  if (!(await menu.evaluate((element) => element.open)))
    await menu.locator("summary").click();
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Floating journal window", exact: true }).click();
  const popup = await opened;
  await popup.locator(".ss-popup-root").waitFor();
  // Stylesheet loading and its color transitions must finish before comparing.
  await popup.waitForFunction(() =>
    getComputedStyle(document.querySelector(".ss-widgetpanel .ss-primary")).backgroundColor === "rgb(238, 149, 125)",
  );
  return popup;
}

async function checkPopup(popup, mainStyle) {
  const style = await popup.locator(".ss-widgetpanel .ss-primary").evaluate((element) => {
    const s = getComputedStyle(element);
    return { background: s.backgroundColor, color: s.color, font: s.font, radius: s.borderRadius };
  });
  assert.deepEqual(style, mainStyle, "detached capture uses the main panel's theme");
  const layout = await popup.evaluate(() => {
    const panel = document.querySelector(".ss-widgetpanel"),
      host = document.querySelector(".floating-journal-host"),
      rect = panel.getBoundingClientRect();
    return {
      width: innerWidth,
      panelWidth: rect.width,
      left: rect.left,
      overflow: document.documentElement.scrollWidth > innerWidth,
      panelScroll: panel.scrollHeight > panel.clientHeight + 1,
      hostScroll: host.scrollHeight > host.clientHeight + 1,
      clipped: [...panel.querySelectorAll("button,textarea,select,input")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.right > innerWidth + 1;
      }),
    };
  });
  assert.equal(layout.overflow, false, "no horizontal scrollbar");
  assert.equal(layout.clipped, false, "all controls fit");
  assert.equal(layout.panelScroll, false, "one document scrollbar, no nested panel scrollbar");
  assert.equal(layout.hostScroll, false, "host does not clip the capture panel");
  assert.equal(layout.left, 0);
  assert.equal(layout.panelWidth, layout.width);
}

try {
  const page = await context.newPage();
  await page.goto(origin + "/review");
  await page.locator(".ss-reference-nav").waitFor();
  await page.getByRole("button", { name: "Expand widget", exact: true }).click();
  const mainStyle = await page.locator(".ss-livewidget .ss-widgetpanel .ss-primary").evaluate((element) => {
    const s = getComputedStyle(element);
    return { background: s.backgroundColor, color: s.color, font: s.font, radius: s.borderRadius };
  });
  await page.getByRole("button", { name: "Collapse widget", exact: true }).click();
  await page.locator(".ss-reference-nav").getByRole("button", { name: "Stillness", exact: true }).click();
  for (const width of [1215, 390]) {
    await page.setViewportSize({ width, height: 1292 });
    const centered = await page.locator(".ss-breathing-square").evaluate((element) => {
      const square = element.getBoundingClientRect(),
        words = element.querySelector("strong").getBoundingClientRect(),
        timer = element.querySelector("span").getBoundingClientRect();
      return Math.abs(words.x + words.width / 2 - (square.x + square.width / 2)) < 1 &&
        Math.abs(timer.x + timer.width / 2 - (square.x + square.width / 2)) < 1 &&
        Math.abs((words.top + timer.bottom) / 2 - (square.top + square.height / 2)) < 1;
    });
    assert.equal(centered, true, "breathing phase and timer are centered");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/stillness-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1215, height: 1292 });

  const nativePiP = await page.evaluate(() => !!window.documentPictureInPicture);
  let popup = await openFloating(page);
  if (nativePiP) assert.equal(await page.evaluate(() => !!window.documentPictureInPicture.window), true);
  for (const width of [320, 280, 480]) {
    await popup.setViewportSize({ width, height: 430 });
    await checkPopup(popup, mainStyle);
    await popup.screenshot({ path: `${output}/capture-${width}.png`, fullPage: true });
  }
  const words = "Popup layout regression: my draft survives docking.";
  await popup.getByRole("textbox", { name: "Capture words", exact: true }).fill(words);
  await popup.close();
  await page.locator('.floating-journal-host[data-floating="false"]').waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Capture words", exact: true }).last().inputValue(), words);

  // Use the app's regular-popup fallback on the next click.
  await page.evaluate(() => Object.defineProperty(window, "documentPictureInPicture", { configurable: true, value: undefined }));
  popup = await openFloating(page);
  await checkPopup(popup, mainStyle);
  assert.equal(await popup.getByRole("textbox", { name: "Capture words", exact: true }).inputValue(), words);
  await popup.getByRole("button", { name: "Review typed capture", exact: true }).click();
  await popup.getByRole("button", { name: "Confirm save", exact: true }).click();
  await popup.getByText("Saved to your journal.", { exact: true }).waitFor();
  await popup.close();
  await page.locator('.ss-reference-nav').getByRole("button", { name: "Daily journal", exact: true }).click();
  await page.locator(".ss-stream-note").filter({ hasText: words }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`PASS: centered breathing text; matching main/popup theme; 280/320/480px layouts; ${nativePiP ? "native PiP and " : ""}regular popup; draft preserved across docking; confirmed note saved; no browser errors.`);
} finally {
  await browser.close();
}
