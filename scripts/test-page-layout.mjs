import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.PAGE_LAYOUT_URL || "http://localhost:3113";
const browser = await chromium.launch({ executablePath: process.env.PAGE_LAYOUT_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(7000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(origin + "/review");
  await page.getByRole("button", { name: "Edit page layout", exact: true }).first().waitFor();
  for (const label of ["Command Center", "Daily journal", "Patterns", "Stillness"]) {
    console.log("Checking", label);
    await page.locator(".ss-reference-nav").getByRole("button", { name: label === "Patterns" ? "Heart-rate analytics" : label, exact: true }).click();
    const welcome = page.getByRole("button", { name: "I’m here", exact: true });
    if (await welcome.isVisible()) await welcome.click();
    await page.getByRole("button", { name: label === "Command Center" ? "Edit dashboard" : "Edit page layout", exact: true }).first().click();
    const handles = page.locator(label === "Command Center" ? ".cc-drag-handle" : ".ss-custom-controls");
    await handles.first().waitFor();
    const count = await handles.count();
    assert.ok(count > 0, label + " has editable panels");
    console.log(label, count, "editable panels");
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  }
  for (const label of ["Settings", "Connections"]) {
    console.log("Checking", label);
    await page.locator(label === "Settings" ? ".ss-reference-nav" : ".ss-reference-top-actions").getByRole("button", { name: label, exact: true }).click();
    const dialog = page.locator("dialog.legacy-workspace");
    await dialog.getByRole("button", { name: "Edit page layout", exact: true }).click();
    assert.ok(await dialog.locator(".ss-custom-controls").count() > 0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.getByRole("button", { name: "Close workspace tools", exact: true }).click();
    console.log(label, "passed");
  }
  await page.locator(".ss-reference-nav").getByRole("button", { name: "Daily journal", exact: true }).click();
  const date = page.locator('[data-layout-id="journal-date-overview"]');
  const calendar = page.locator('[data-layout-id="journal-calendar"]');
  const journal = page.locator('[data-layout-id="journal-content"]');
  const d = await date.boundingBox(), c = await calendar.boundingBox(), j = await journal.boundingBox();
  assert.ok(d.y < j.y && c.x > j.x, "date overview above journal, calendar to its right");
  await page.getByRole("button", { name: "Edit page layout", exact: true }).first().click();
  const handle = page.getByRole("button", { name: "Drag Date overview", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const held = await handle.boundingBox();
  const target = await calendar.boundingBox();
  await page.mouse.move(held.x + 20, held.y + 12);
  await page.mouse.down();
  assert.equal(await page.locator(".ss-custom-held").count(), 1);
  await page.mouse.move(target.x + 20, target.y + 20, { steps: 8 });
  await page.mouse.up();
  assert.equal(await date.evaluate(n => n.style.order), "2");
  await page.getByRole("button", { name: "Save layout", exact: true }).first().click();
  await page.reload();
  await page.getByRole("button", { name: "Edit page layout", exact: true }).first().waitFor();
  assert.equal(await date.evaluate(n => n.style.order), "2", "drag order survives reload");
  await page.getByRole("button", { name: "Edit page layout", exact: true }).first().click();
  await page.getByRole("button", { name: "Reset layout", exact: true }).first().click();
  await page.getByRole("button", { name: "Save layout", exact: true }).first().click();
  console.log("Drag, save, reload and reset passed");
  for (const width of [1600, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px does not overflow`);
    if (process.env.PAGE_LAYOUT_SCREENSHOTS) await page.screenshot({ path: `${process.env.PAGE_LAYOUT_SCREENSHOTS}/journal-${width}.png` });
    console.log(width, "layout passed");
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
