// Run against the isolated /review server; never writes to a cloud account.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const base = process.env.UI_REVIEW_URL || "http://127.0.0.1:3000";
const output =
  process.env.UI_REVIEW_OUTPUT || path.resolve("../concept-verification");
fs.mkdirSync(output, { recursive: true });
let browser, server;
(async () => {
  server = http.createServer((req, res) => {
    if (req.url.startsWith("/fonts/")) {
      res.end(fs.readFileSync(path.resolve("public", "." + req.url)));
      return;
    }
    let html = fs.readFileSync("design/Still_Signal_Concept_v3.html", "utf8");
    html = html
      .replace(/<link[^>]*>/g, "")
      .replace(
        "<style>",
        '<style>@font-face{font-family:Manrope;src:url(/fonts/Manrope.ttf);font-weight:200 800}@font-face{font-family:"DM Mono";src:url(/fonts/DMMono-Regular.ttf);font-weight:400}@font-face{font-family:"DM Mono";src:url(/fonts/DMMono-Medium.ttf);font-weight:500}',
      );
    res.setHeader("content-type", "text/html");
    res.end(html);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/New_York",
  });
  const reference = await context.newPage(),
    page = await context.newPage();
  const errors = [],
    consoleErrors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/unsafe-eval|Content Security Policy|EvalError/.test(m.text())
    )
      consoleErrors.push(m.text());
  });
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("button", { name, exact: true })
      .click();
  const shot = async (name) => {
    await page.evaluate(() => scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, name + ".png"),
      fullPage: true,
    });
  };
  const fits = async (label) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      label + " overflows",
    );
    checks.push(label + " fits");
  };
  await reference.goto(`http://127.0.0.1:${server.address().port}`);
  await page.goto(base + "/review");
  await page
    .getByRole("heading", { name: "Heart-rate journey", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector('.ss-chart path[stroke="#ff7654"]')
        ?.getAttribute("d")?.length > 50,
  );
  await Promise.all([
    reference.evaluate(() => document.fonts.ready),
    page.evaluate(() => document.fonts.ready),
  ]);
  assert.ok(
    (await page.locator('.ss-chart path[stroke="#ff7654"]').getAttribute("d"))
      .length > 50,
  );
  assert.equal(
    await page
      .locator('.ss-chart path[stroke="#ff7654"]')
      .evaluate((e) => getComputedStyle(e).stroke),
    "rgb(255, 118, 84)",
  );
  checks.push("SVG heart-rate series renders with the concept stroke");
  const referenceBox = async (name) =>
    reference.locator("#journalPage ." + name).evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
  const appBox = async (name) =>
    page
      .locator(".ss-" + name)
      .first()
      .evaluate((e) => {
        const r = e.getBoundingClientRect(),
          root = document.querySelector(".ss-app").getBoundingClientRect();
        return { x: r.x, y: r.y - root.y, w: r.width, h: r.height };
      });
  const geometry = {};
  for (const name of [
    "topbar",
    "hero",
    "week",
    "metrics",
    "sectiontabs",
    "timeline-layout",
    "chartwrap",
    "moment",
  ]) {
    const a = await referenceBox(name),
      b = await appBox(name);
    geometry[name] = { reference: a, app: b };
    for (const field of ["x", "y", "w"])
      assert.ok(
        Math.abs(a[field] - b[field]) <= 1,
        `${name}.${field}: ${a[field]} vs ${b[field]}`,
      );
    if (name !== "moment")
      assert.ok(Math.abs(a.h - b.h) <= 1, `${name}.height: ${a.h} vs ${b.h}`);
  }
  checks.push(
    "Reference geometry matches within 1px for header, hero, week, metrics, tabs, chart grid and moment card",
  );
  await reference.screenshot({
    path: path.join(output, "HTML-reference.png"),
    fullPage: true,
  });
  await shot("Journal");
  await fits("Desktop journal");
  await page
    .locator(".ss-app")
    .getByLabel("Journal reflection", { exact: true })
    .fill("Draft survives exact-layout navigation.");
  await nav("Overview");
  await fits("Desktop overview");
  await shot("Overview");
  await nav("Daily journal");
  assert.equal(
    await page
      .locator(".ss-app")
      .getByLabel("Journal reflection", { exact: true })
      .inputValue(),
    "Draft survives exact-layout navigation.",
  );
  await page
    .getByRole("button", { name: "Save to journal", exact: true })
    .click();
  await page
    .locator(".ss-flow .ss-entrytext")
    .filter({ hasText: "Draft survives exact-layout navigation." })
    .waitFor();
  checks.push(
    "Inline journal draft survives navigation and saves into chronological flow",
  );
  const saved = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("trade-pulse-v1");
          request.onsuccess = () => {
            const db = request.result;
            const q = db
              .transaction("sessions")
              .objectStore("sessions")
              .get("99999999-9999-4999-8999-999999999999");
            q.onsuccess = () => {
              resolve(q.result);
              db.close();
            };
            q.onerror = () => reject(q.error);
          };
          request.onerror = () => reject(request.error);
        }),
    );
  assert.ok(
    (await saved()).journal.some(
      (n) => n.text === "Draft survives exact-layout navigation.",
    ),
  );
  await page.getByRole("button", { name: "Review", exact: true }).click();
  for (const [label, value] of [
    ["Before the trade", "I waited for the planned level."],
    ["During the trade", "I noticed urgency and kept the planned risk."],
    ["Exit and after", "I paused before considering another setup."],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await page
    .getByRole("button", { name: "Review saved", exact: true })
    .waitFor();
  const firstReview = (await saved()).journal.filter((n) =>
    n.text.startsWith("Session review\n\n"),
  );
  assert.equal(firstReview.length, 1);
  await page
    .getByLabel("Exit and after", { exact: true })
    .fill("Updated review, same saved reflection.");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await page
    .getByRole("button", { name: "Review saved", exact: true })
    .waitFor();
  const secondReview = (await saved()).journal.filter((n) =>
    n.text.startsWith("Session review\n\n"),
  );
  assert.equal(secondReview.length, 1);
  assert.equal(secondReview[0].id, firstReview[0].id);
  checks.push(
    "Three-part review persists and updates the same note without duplicates",
  );
  await nav("Heart-rate analytics");
  await fits("Desktop patterns");
  await shot("Patterns");
  await nav("Sessions");
  await fits("Desktop sessions");
  await shot("Sessions");
  await nav("Stillness");
  await page.getByRole("button", { name: "I’m here", exact: true }).click();
  await fits("Desktop Stillness");
  await shot("Stillness");
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Ego", exact: true }).click();
  await page
    .getByText(
      "A result may touch the ego without defining the trader. Separate what happened from who you are.",
      { exact: true },
    )
    .waitFor();
  await page
    .getByLabel("Mindfulness note", { exact: true })
    .fill("A moment saved through the exact Stillness layout.");
  await page
    .getByRole("button", { name: "Save this moment", exact: true })
    .click();
  await page
    .getByText("Moment saved to your journal.", { exact: true })
    .waitFor();
  checks.push(
    "Stillness welcome, pause/reset, topics and note persistence work",
  );
  await nav("Connections");
  await page.locator("dialog.legacy-workspace[open]").waitFor();
  await page.getByRole("heading", { name: "WHOOP", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close workspace tools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand widget", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Your session preferences", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close workspace tools", exact: true })
    .click();
  await page.getByRole("button", { name: "Close widget", exact: true }).click();
  await nav("Daily journal");
  await page.getByRole("button", { name: "View price", exact: true }).click();
  await page.locator("dialog.legacy-workspace[open]").waitFor();
  await page
    .getByRole("button", { name: "Close workspace tools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Filter moments", exact: true })
    .click();
  await page.getByRole("button", { name: "Add trade", exact: true }).click();
  await page
    .getByRole("heading", { name: "Add a trade event", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page
    .getByRole("heading", { name: "Import CSV", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  checks.push(
    "Existing WHOOP, settings, price/replay, manual trade and CSV tools remain accessible",
  );
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [label, name] of [
      ["Journal", "Daily journal"],
      ["Overview", "Overview"],
      ["Patterns", "Heart-rate analytics"],
      ["Sessions", "Sessions"],
      ["Stillness", "Stillness"],
    ]) {
      const mobile = page.getByRole("navigation", {
        name: "Mobile navigation",
        exact: true,
      });
      if (width <= 720)
        await mobile.getByRole("button", { name: label, exact: true }).click();
      else await nav(name);
      if (label === "Stillness")
        await page
          .getByRole("button", { name: "I’m here", exact: true })
          .click();
      await fits(`${width}px ${label}`);
      if (width === 390) await shot("Mobile-" + label);
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  fs.writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify({ checks, geometry, errors, consoleErrors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, consoleErrors }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server?.close();
  });
