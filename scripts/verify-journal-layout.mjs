import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.PAGE_LAYOUT_URL || "http://127.0.0.1:3114";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
  "Use isolated local fixtures",
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PAGE_LAYOUT_BROWSER
    ? { executablePath: process.env.PAGE_LAYOUT_BROWSER }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const module = (id) =>
  page.locator(`.ss-free-board > [data-module-id="${id}"]`);
const frame = (id) => module(id).locator(":scope > .ss-module-content");
const box = (id) => frame(id).boundingBox();
const near = (a, b, label) =>
  assert.ok(Math.abs(a - b) < 0.15, `${label}: ${a} versus ${b}`);
const screenshot = async (name) => {
  if (process.env.PAGE_LAYOUT_SCREENSHOTS) {
    await mkdir(process.env.PAGE_LAYOUT_SCREENSHOTS, { recursive: true });
    await page.screenshot({
      path: `${process.env.PAGE_LAYOUT_SCREENSHOTS}/${name}.png`,
    });
  }
};
const edit = () =>
  page
    .getByRole("button", { name: "Customize workspace", exact: true })
    .click();
const undo = () =>
  page.getByRole("button", { name: "Undo", exact: true }).click();
const save = () =>
  page.getByRole("button", { name: "Save layout", exact: true }).click();
const drag = async (x, y, dx, dy) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
};
const checkGutters = async () => {
  const a = await box("day-summary"),
    b = await box("journal-heading"),
    c = await box("session-controls"),
    d = await box("process-context"),
    cal = await box("calendar");
  near(b.x - a.x - a.width, 16, "first horizontal gutter");
  near(c.x - b.x - b.width, 16, "second horizontal gutter");
  near(cal.x - c.x - c.width, 16, "calendar horizontal gutter");
  near(d.y - c.y - c.height, 16, "stacked vertical gutter");
  near(d.y + d.height, b.y + b.height, "stacked bottom alignment");
};
try {
  await page.goto(origin + "/review", { timeout: 120000 });
  await module("session-controls").waitFor({ timeout: 120000 });
  await edit();
  await save();
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("still-signal-modules-v2:") && k.endsWith(":Journal"),
    );
    const layout = JSON.parse(localStorage.getItem(key));
    const positions = {
      "day-summary": [0, 0, 320, 300],
      "journal-heading": [331, 0, 240, 300],
      "session-controls": [582, 0, 280, 142],
      "process-context": [582, 158, 280, 142],
      calendar: [873, 0, 312, 1000],
      timeline: [0, 316, 872, 480],
      moments: [0, 812, 872, 300],
    };
    layout.boardWidth = 1200;
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
  await module("calendar").waitFor();
  await edit();
  await page
    .getByRole("button", { name: "Align spacing", exact: true })
    .click();
  await save();
  await checkGutters();
  const saved = await box("session-controls");
  await edit();
  const editing = await box("session-controls");
  near(editing.width, saved.width, "editing width");
  near(editing.height, saved.height, "editing height");
  assert.equal(await frame("session-controls").getAttribute("inert"), "");
  assert.equal(
    await module("calendar").locator(".ss-module-resize").count(),
    8,
  );
  await module("session-controls").hover();
  const controls = await module("session-controls")
    .locator(".ss-module-controls")
    .boundingBox();
  assert.ok(
    controls.y >= editing.y &&
      controls.y + controls.height <= editing.y + editing.height,
    "controls stay inside their frame",
  );
  await screenshot("journal-editor");
  // Each direction changes the requested axes only and anchors its opposite edges.
  for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const handle = module("timeline").locator(`.ss-module-resize-${edge}`);
    await handle.scrollIntoViewIfNeeded();
    const before = await box("timeline"),
      h = await handle.boundingBox();
    const dx = edge.includes("w") ? 24 : edge.includes("e") ? -24 : 0;
    const dy = edge.includes("n") ? 24 : edge.includes("s") ? -24 : 0;
    const peers = await Promise.all(
      ["session-controls", "process-context", "calendar"].map(box),
    );
    await drag(h.x + h.width / 2, h.y + h.height / 2, dx, dy);
    const after = await box("timeline");
    // Compare board-relative vertical coordinates because auto-scroll may move the page.
    const yDelta =
      after.y - (await box("calendar")).y - (before.y - peers[2].y);
    if (edge.includes("w"))
      near(
        after.x + after.width,
        before.x + before.width,
        `${edge} right anchor`,
      );
    else near(after.x, before.x, `${edge} left anchor`);
    if (edge === "e" || edge === "w")
      near(after.height, before.height, `${edge} preserves height`);
    if (edge === "n" || edge === "s")
      near(after.width, before.width, `${edge} preserves width`);
    assert.ok(
      after.width < before.width || after.height < before.height,
      `${edge} resizes`,
    );
    if (edge.includes("n"))
      near(yDelta + after.height, before.height, `${edge} bottom anchor`);
    else near(yDelta, 0, `${edge} top anchor`);
    await undo();
  }
  // A partially visible tall widget remains draggable and its settings remain reachable.
  await module("calendar").evaluate((n) =>
    window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY + 600),
  );
  const partial = await box("calendar");
  assert.ok(partial.y < 0 && partial.y + partial.height > 200);
  await drag(partial.x + partial.width / 2, 250, 0, 40);
  const moved = await module("calendar").evaluate((n) =>
    parseFloat(n.style.top),
  );
  near(moved, 40, "drag from visible lower portion");
  await undo();
  await module("calendar").evaluate((n) =>
    window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY + 600),
  );
  await module("calendar").hover({ position: { x: 50, y: 800 } });
  await module("calendar")
    .getByRole("button", {
      name: "Edit inside Calendar & previous entries",
      exact: true,
    })
    .click();
  assert.ok(await module("calendar").locator(".ss-module-options").isVisible());
  await module("calendar")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  // An occupied move returns the active card, leaving every peer stationary.
  await module("session-controls").scrollIntoViewIfNeeded();
  const start = await box("session-controls"),
    target = await box("journal-heading");
  const originalLeft = await module("session-controls").evaluate(
    (n) => n.style.left,
  );
  await drag(start.x + 30, start.y + 80, target.x - start.x, 0);
  assert.equal(
    await module("session-controls").evaluate((n) => n.style.left),
    originalLeft,
  );
  assert.match(
    await page
      .locator(".ss-module-message")
      .filter({ hasText: /occupied/ })
      .textContent(),
    /occupied/,
  );
  await save();
  for (const width of [900, 1800, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(150);
    await checkGutters();
  }
  await page.reload();
  await module("calendar").waitFor();
  await checkGutters();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "mobile has no page overflow",
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page
    .getByRole("button", { name: "Command Center", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Edit dashboard", exact: true })
    .click();
  for (const id of [
    "trading-date",
    "dashboard-greeting",
    "workflow-navigation",
    "post-exit-review",
    "dashboard-status",
    "thesis",
  ]) {
    assert.ok(
      await module(id).locator(".ss-module-move-surface").count(),
      `${id} is editable`,
    );
    assert.equal(await frame(id).getAttribute("inert"), "");
  }
  const thesis = await box("thesis"),
    quality = await box("process");
  near(quality.x - thesis.x - thesis.width, 16, "Command Center gutter");
  const corner = module("thesis").locator(".ss-module-resize-s");
  await corner.scrollIntoViewIfNeeded();
  const h = await corner.boundingBox();
  await drag(h.x + h.width / 2, h.y + h.height / 2, 0, -24);
  const resized = await box("thesis");
  assert.ok(resized.height < thesis.height);
  await page
    .getByRole("button", { name: "Save dashboard", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit dashboard", exact: true })
    .waitFor();
  near(
    (await box("thesis")).height,
    resized.height,
    "dashboard save retains height",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Command Center", exact: true })
    .first()
    .click();
  await module("thesis").waitFor();
  near(
    (await box("thesis")).height,
    resized.height,
    "dashboard reload retains height",
  );
  for (const theme of ["light", "dark"]) {
    const appearance = page.locator(".appearance-controls").first();
    await appearance.locator(":scope > summary").click();
    await appearance.locator("select").first().selectOption(theme);
    await page.waitForFunction(
      (theme) => document.documentElement.dataset.theme === theme,
      theme,
    );
    await appearance.locator(":scope > summary").click();
    const materials = await page.evaluate(() =>
      ["post-exit-review", "thesis"].map((id) => {
        const panel = document.querySelector(
          `.ss-free-board > [data-module-id="${id}"] > .ss-module-content`,
        );
        return {
          preset: panel.dataset.lgPreset,
          background: getComputedStyle(panel, "::before").backgroundColor,
        };
      }),
    );
    assert.deepEqual(
      materials[0],
      materials[1],
      `${theme} review invitation shares the widget material`,
    );
    await module("post-exit-review").scrollIntoViewIfNeeded();
    await screenshot(`command-center-${theme}`);
  }
  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log(
    "PASS: eight pointer resize directions, opposite anchors, lower-surface dragging, reachable controls, inert previews, collision rejection, 16px gutters across viewports/save/reload, mobile overflow and Command Center record persistence.",
  );
} catch (error) {
  await screenshot("failure");
  throw error;
} finally {
  await browser.close();
}
