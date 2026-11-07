import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.PAGE_LAYOUT_URL || "http://127.0.0.1:3113";
assert.ok(new URL(origin).hostname === "127.0.0.1" || new URL(origin).hostname === "localhost", "Use an isolated local review server");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PAGE_LAYOUT_BROWSER ? { executablePath: process.env.PAGE_LAYOUT_BROWSER } : {}),
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const module = id => page.locator(`.ss-free-board > [data-module-id="${id}"]`);
const glass = id => module(id).locator(":scope > .ss-module-content");
const box = async id => glass(id).boundingBox();
const clickTool = async (id, name) => {
  await module(id).hover();
  await module(id).getByRole("button", { name, exact: true }).click();
};
const screenshot = async name => {
  if (!process.env.PAGE_LAYOUT_SCREENSHOTS) return;
  await mkdir(process.env.PAGE_LAYOUT_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.PAGE_LAYOUT_SCREENSHOTS}/${name}.png`, fullPage: false });
};
try {
  await page.goto(origin + "/review");
  await module("session-controls").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Customize workspace", exact: true }).click();
  await module("session-controls").getByRole("button", { name: "Resize Session controls", exact: true }).press("ArrowDown");
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  // Seed a compact user layout, not a product default.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith("still-signal-modules-v2:") && k.endsWith(":Journal"));
    if (!key) throw new Error("Journal layout was not saved");
    const layout = JSON.parse(localStorage.getItem(key));
    const positions = {
      "journal-heading": [0, 0, 400, 260],
      "session-controls": [413, 0, 300, 120],
      "process-context": [413, 136, 300, 124],
      calendar: [726, 0, 474, 780],
      timeline: [0, 276, 713, 480],
      moments: [0, 772, 713, 300],
      evidence: [726, 796, 474, 276],
      writing: [0, 1088, 713, 600],
      intentions: [726, 1088, 474, 600],
      observations: [0, 1704, 400, 220],
      "review-chart": [413, 1704, 300, 220],
    };
    for (const [id, p] of Object.entries(layout.modules)) {
      const b = positions[id];
      p.hidden = !b;
      if (b) {
        p.box = { x: b[0], y: b[1], w: b[2], h: b[3] };
        p.height = b[3];
        p.heightMode = "fixed";
      }
    }
    localStorage.setItem(key, JSON.stringify(layout));
  });
  await page.reload();
  await module("session-controls").waitFor();
  await page.waitForTimeout(500);
  const saved = Object.fromEntries(await Promise.all(["journal-heading", "session-controls", "process-context", "calendar", "timeline"].map(async id => [id, await box(id)])));
  assert.ok(Math.abs(saved["process-context"].y + saved["process-context"].height - saved["journal-heading"].y - saved["journal-heading"].height) < 1);
  assert.ok(Math.abs(saved["process-context"].y - saved["session-controls"].y - saved["session-controls"].height - 16) < 1);
  await screenshot("journal-saved");
  await page.getByRole("button", { name: "Customize workspace", exact: true }).click();
  for (const [id, before] of Object.entries(saved)) {
    const after = await box(id);
    assert.ok(Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1, `${id} preview keeps its glass dimensions`);
  }
  const sessionContent = await module("session-controls").locator(".ss-session-controls").boundingBox();
  const sessionFrame = await box("session-controls");
  assert.ok(sessionContent.y + sessionContent.height <= sessionFrame.y + sessionFrame.height, "Compact session controls remain visible");
  await module("journal-heading").hover();
  await screenshot("journal-editing");
  // Resize from the left with a real pointer; the right edge stays anchored.
  await module("evidence").scrollIntoViewIfNeeded();
  const before = await box("evidence");
  const handle = await module("evidence").getByRole("button", { name: "Resize Moment evidence from left", exact: true }).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = await box("evidence");
  assert.ok(after.width < before.width && Math.abs(after.x + after.width - before.x - before.width) < 1, "Left resizing anchors the right edge");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.ok(Math.abs((await box("evidence")).width - before.width) < 1);
  // Hiding the upper card closes the hole in its column, and Undo restores it.
  const originalContextTop = await module("process-context").evaluate(n => n.offsetTop);
  await clickTool("session-controls", "Hide Session controls module");
  assert.ok(await module("process-context").evaluate(n => n.offsetTop) < originalContextTop);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await module("process-context").evaluate(n => n.offsetTop), originalContextTop);
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await module("journal-heading").hover();
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(350);
  assert.ok(await page.evaluate(() => scrollY) > scrollBefore, "Ordinary scrolling over a fixed widget reaches the page");
  await page.reload();
  await module("session-controls").waitFor();
  assert.equal(Math.round((await box("session-controls")).height), 120, "Compact sizing survives reload");
  const beforeDateChange = await module("session-controls").getAttribute("style");
  await module("calendar").getByLabel("Find a journal date", { exact: true }).fill("2026-10-12");
  await page.waitForTimeout(300);
  assert.equal(await module("session-controls").getAttribute("style"), beforeDateChange, "Changing journal date retains the saved workspace geometry");
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px has no page overflow`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: editor/saved dimensions, stacked alignment, compact controls, left pointer resize, Undo, hide compaction, page scrolling, reload, journal date change, and responsive overflow");
} finally {
  await browser.close();
}
