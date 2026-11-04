// Local-only geometry fixtures. Never run against a hosted account.
require("tsx/cjs");
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { emptyModuleLayout, moduleLayoutKey } = require("../src/lib/module-layout.ts");
const { createRecord, latest } = require("../src/lib/process/model.ts");
const { withRefs } = require("../src/lib/process/engine.ts");
const base = process.env.BATCH4_QA_URL || "http://127.0.0.1:3004";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw Error("Localhost only.");
const baseline = process.argv.includes("--baseline");
const output = process.env.BATCH4_QA_OUTPUT || "../../outputs/batch4";
const owner = "88888888-8888-4888-8888-888888888888";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const seed = emptyModuleLayout();
  seed.modules.timeline = { section: "main", order: 1, width: 12, hidden: false, heightMode: "fixed", height: 640, box: { x: 0, y: 240, w: 1200, h: 640 } };
  const qualityLayout = emptyModuleLayout();
  qualityLayout.modules["process-setup-quality-adherence"] = { section: "main", order: 10, width: 12, hidden: false, box: { x: 0, y: 2000, w: 900, h: 300 } };
  await context.addInitScript(({ key, seed, qualityKey, qualityLayout }) => {
    localStorage.setItem("still-signal-appearance", JSON.stringify({ theme: "dark", shark: "#87b9ca", accent: "#c5d7df" }));
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
    if (!localStorage.getItem(qualityKey)) localStorage.setItem(qualityKey, JSON.stringify(qualityLayout));
  }, { key: moduleLayoutKey(owner, "Journal"), seed, qualityKey: moduleLayoutKey(owner, "Trade Quality"), qualityLayout });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const timeline = () => page.locator('.ss-free-board > [data-module-id="timeline"]');
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const nav = name => page.locator(".ss-reference-nav").getByRole("button", { name, exact: true });
  const records = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("still-signal-process-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, rows = db.transaction("records").objectStore("records").getAll();
      rows.onsuccess = () => { db.close(); resolve(rows.result.map(r => r.record)); };
      rows.onerror = () => { db.close(); reject(rows.error); };
    };
  }));
  const seedRecords = rows => page.evaluate(({ owner, rows }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("still-signal-process-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: ["owner", "id"] }).createIndex("owner", "owner");
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"), existing = store.getAll();
      existing.onsuccess = () => {
        let order = Math.max(0, ...existing.result.map(r => r.order));
        for (const record of rows) store.put({ owner, id: record.id, record, pending: 0, order: ++order });
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  }), { owner, rows: rows.map(withRefs) });
  const size = () => timeline().evaluate(node => ({ module: node.getBoundingClientRect().height, chart: node.querySelector(".ss-rhythm-svg")?.getBoundingClientRect().height }));
  try {
    await page.goto(base + "/review");
    await timeline().locator(".ss-rhythm-svg").waitFor();
    await timeline().locator(".ss-phases button").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await settle();
    const before = await size();
    await page.getByRole("button", { name: "Customize workspace", exact: true }).click();
    await settle();
    const editingBefore = await size();
    const handle = page.getByRole("button", { name: "Resize Session timeline", exact: true });
    await handle.focus();
    for (let i = 0; i < 12; i++) await handle.press("ArrowDown");
    await settle();
    const after = await size();
    console.log(JSON.stringify({ before, editingBefore, after, chartGrew: after.chart > editingBefore.chart + 60 }));
    if (baseline) return;
    assert.ok(after.module > before.module + 100);
    assert.ok(after.chart > editingBefore.chart + 60, "the chart must use the resized module height");
    await page.getByRole("button", { name: "Save layout", exact: true }).click();
    await settle();
    let saved = await size();
    console.log(JSON.stringify({ saved }));
    assert.ok(saved.chart > before.chart + 100, "the saved view keeps the extra chart height");
    await timeline().getByRole("button", { name: "Price", exact: true }).click();
    const priceChart = () => timeline().locator(".ss-price-chart");
    await priceChart().waitFor();
    const priceBefore = await priceChart().boundingBox();
    await page.getByRole("button", { name: "Customize workspace", exact: true }).click();
    for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Resize Session timeline", exact: true }).press("ArrowDown");
    for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Resize Session timeline", exact: true }).press("ArrowLeft");
    await page.getByRole("button", { name: "Save layout", exact: true }).click();
    await settle();
    const priceAfter = await priceChart().boundingBox();
    assert.ok(priceAfter.height > priceBefore.height + 70, "price chart grows vertically");
    assert.ok(priceAfter.width < priceBefore.width - 40, "price chart follows horizontal resizing");
    await timeline().getByRole("button", { name: "Price", exact: true }).click();
    await settle();
    saved = await size();
    await page.screenshot({ path: output + "/batch4-timeline-resized.png", fullPage: true });
    const journalKey = moduleLayoutKey(owner, "Journal");
    const savedTemplate = await page.evaluate(key => localStorage.getItem(key), journalKey);
    await page.reload();
    await timeline().locator(".ss-rhythm-svg").waitFor();
    await settle();
    assert.equal((await size()).module, saved.module, "saved height reopens");
    assert.equal(await page.evaluate(key => localStorage.getItem(key), journalKey), savedTemplate);

    // A wheel over the timeline still scrolls its container or the page.
    async function wheelAt(locator) {
      await locator.scrollIntoViewIfNeeded();
      await locator.evaluate(node => {
        for (let p = node; p && p !== document.body; p = p.parentElement)
          if (p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY)) p.scrollTop = p.scrollHeight;
      });
      const box = await locator.boundingBox();
      assert.ok(box);
      const beforeY = await page.evaluate(() => scrollY);
      await page.mouse.move(box.x + Math.min(box.width / 2, 100), box.y + Math.min(box.height / 2, 80));
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(300);
      const afterY = await page.evaluate(() => scrollY);
      if (afterY <= beforeY) console.log("wheel diagnostic", await locator.evaluate(node => ({ y: scrollY, max: document.documentElement.scrollHeight-innerHeight, top: node.scrollTop, height: node.clientHeight, total:node.scrollHeight, rect:node.getBoundingClientRect().toJSON() })));
      return afterY > beforeY;
    }
    assert.ok(await wheelAt(timeline().locator(".ss-rhythm-svg")), "ordinary timeline wheel chains to page");

    await page.getByRole("button", { name: "Customize workspace", exact: true }).click();
    await page.getByRole("button", { name: "Hide Session timeline module", exact: true }).click();
    await page.getByRole("button", { name: "Add modules", exact: true }).click();
    const library = page.getByRole("region", { name: "Module library", exact: true });
    await library.waitFor();
    const restore = library.locator("article").filter({ hasText: "Session timeline" }).getByRole("button", { name: "Restore module", exact: true });
    assert.ok(await restore.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), "library is above the board");
    await restore.click();
    await library.getByRole("button", { name: /Close/ }).click();
    await page.getByRole("button", { name: "Create module", exact: true }).click();
    const custom = page.locator('.ss-free-board > [data-module-id^="custom-"]').last();
    await custom.getByLabel("Title", { exact: true }).waitFor();
    assert.equal(await custom.getByLabel("Title", { exact: true }).evaluate(node => document.activeElement === node), true, "new module begins with its title");
    await custom.getByLabel("Title", { exact: true }).fill("My reading note");
    await custom.getByRole("textbox", { name: /Content for/ }).fill("A long reminder wraps without escaping the module. ".repeat(40));
    await page.getByRole("button", { name: "Save layout", exact: true }).click();
    const wrapped = await custom.evaluate(node => node.scrollWidth <= node.clientWidth + 2);
    assert.ok(wrapped, "long custom text remains contained");

    // Dashboard geometry stays separate from dated records.
    await nav("Command Center").click();
    await page.getByRole("button", { name: "Edit dashboard", exact: true }).click();
    await settle();
    const prepHandle = page.getByRole("button", { name: "Resize Trade quality", exact: true });
    const prep = () => page.locator('[data-card="process"]');
    const beforeGrid = JSON.parse(await prep().getAttribute("data-grid"));
    for (let i = 0; i < 3; i++) await prepHandle.press("ArrowDown");
    await settle();
    const afterGrid = JSON.parse(await prep().getAttribute("data-grid"));
    assert.equal(afterGrid.h, beforeGrid.h + 3);
    await page.getByRole("button", { name: "Save dashboard", exact: true }).click();
    await page.getByText("Dashboard saved.", { exact: true }).waitFor();
    const layoutRecord = latest(await records(), "layout")[0];
    assert.equal(layoutRecord.body.panels.find(p => p.id === "process").heightMode, "fixed");
    const originalBody = JSON.stringify(layoutRecord.body);
    const date = await page.getByLabel("Trading date", { exact: true }).inputValue();
    const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    const day = createRecord("day", { date, timezone, status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
    const thesis = createRecord("thesis", { scope: "daily", dayId: day.rootId, periodStart: date, instrument: "ES", bias: "neutral", timeframes: [], structure: "", events: "", levels: "", liquidity: "", primary: "Fixture scenario with long reading notes. ".repeat(150), alternate: "", entries: "", invalidation: "", noTrade: "", targets: "", notes: "", screenshots: [], reason: "Isolated fixture" });
    await seedRecords([day, thesis]);
    await page.reload();
    await nav("Command Center").click();
    await prep().waitFor();
    await settle();
    assert.equal(JSON.stringify(latest(await records(), "layout")[0].body), originalBody, "populated day does not rewrite layout");
    assert.equal(JSON.parse(await prep().getAttribute("data-grid")).h, afterGrid.h);
    const populatedThesisHeight = await page.locator('[data-card="thesis"]').evaluate(node => node.getBoundingClientRect().height);
    await page.getByLabel("Trading date", { exact: true }).fill("2026-10-01");
    await settle();
    const emptyThesisHeight = await page.locator('[data-card="thesis"]').evaluate(node => node.getBoundingClientRect().height);
    assert.ok(emptyThesisHeight < populatedThesisHeight, "auto-height card shrinks on an empty day");
    assert.equal(JSON.stringify(latest(await records(), "layout")[0].body), originalBody);
    await page.getByLabel("Trading date", { exact: true }).fill(date);
    await settle();
    await page.screenshot({ path: output + "/batch4-dashboard-populated.png", fullPage: true });
    await page.getByRole("button", { name: "Edit dashboard", exact: true }).click();
    const thesisResize = page.getByRole("button", { name: "Resize Trading thesis", exact: true });
    for (let i = 0; i < 50; i++) await thesisResize.press("ArrowUp");
    await page.getByRole("button", { name: "Save dashboard", exact: true }).click();
    await page.getByText("Dashboard saved.", { exact: true }).waitFor();
    const thesisScroll = page.locator('[data-card="thesis"] .cc-tile-scroll');
    assert.ok(await thesisScroll.evaluate(node => node.scrollHeight > node.clientHeight + 100));
    assert.ok(await wheelAt(thesisScroll), "wheel at a fixed card boundary chains to page");
    await page.setViewportSize({ width: 390, height: 844 });
    await settle();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: output + "/batch4-dashboard-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Finish session / review today", exact: true }).click();
    await page.getByRole("button", { name: "New playbook", exact: true }).click();
    for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Add rule", exact: true }).click();
    await settle();
    const playbook = page.locator('.ss-free-board > [data-module-id="process-strategy-playbooks"]');
    const quality = page.locator('.ss-free-board > [data-module-id="process-setup-quality-adherence"]');
    const expanded = await playbook.boundingBox(), lower = await quality.boundingBox();
    assert.ok(expanded.height > 2400, "fixture exercises a tall editor");
    assert.ok(lower.y >= expanded.y + expanded.height - 2, "lower module clears the expanded playbook");
    await page.screenshot({ path: output + "/batch4-expanded-playbook.png", fullPage: true });
    const lowerDocumentY = lower.y + await page.evaluate(() => scrollY);
    const longText = playbook.getByLabel("Entry requirements", { exact: true });
    await longText.fill("A recorded layout note.\n".repeat(80));
    await longText.scrollIntoViewIfNeeded();
    await longText.evaluate(node => { node.scrollTop = 0; });
    const textBox = await longText.boundingBox();
    await page.mouse.move(textBox.x + 50, textBox.y + 25);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(200);
    assert.ok(await longText.evaluate(node => node.scrollTop > 0), "long textarea scrolls its own content");
    assert.ok(await wheelAt(longText), "textarea boundary continues to the page");
    await playbook.getByLabel("Strategy name", { exact: true }).fill("Tall layout fixture");
    const ruleNames = playbook.getByLabel("Rule name", { exact: true });
    for (let i = 0; i < await ruleNames.count(); i++) await ruleNames.nth(i).fill("Layout rule " + (i + 1));
    await playbook.getByRole("button", { name: "Save playbook version", exact: true }).click();
    await playbook.getByRole("button", { name: "Edit next version", exact: true }).click();
    await page.waitForTimeout(200);
    const editBox = await playbook.boundingBox(), editLower = await quality.boundingBox();
    assert.ok(editBox.height > 2400 && editLower.y >= editBox.y + editBox.height - 2, "Edit next version also reflows the lower module");
    await playbook.getByRole("button", { name: "Cancel", exact: true }).click();
    await settle();
    await page.waitForTimeout(200);
    assert.ok((await quality.boundingBox()).y + await page.evaluate(() => scrollY) < lowerDocumentY, "closing editor restores compact reflow");
    await nav("Heart-rate analytics").click();
    await settle();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: output + "/batch4-patterns.png", fullPage: true });
    const wheelAudit = [];
    async function auditWheel(locator, label) {
      await locator.evaluate(node => node.scrollIntoView({ block: "center" }));
      await settle();
      const direction = await page.evaluate(() => scrollY > 300 ? -240 : 240);
      const offsets = () => locator.evaluate(node => {
        let total = scrollY;
        for (let p = node; p && p !== document.body; p = p.parentElement) total += p.scrollTop;
        return total;
      });
      const beforeOffset = await offsets(), box = await locator.boundingBox();
      const y = Math.max(80, Math.min(900, box.y + Math.min(box.height / 2, 60)));
      await page.mouse.move(box.x + Math.min(box.width / 2, 100), y);
      await page.mouse.wheel(0, direction);
      await page.waitForTimeout(180);
      assert.notEqual(await offsets(), beforeOffset, label + " permits wheel scrolling");
      wheelAudit.push(label);
    }
    for (const pageName of ["Heart-rate analytics", "Daily journal", "Command Center"]) {
      await nav(pageName).click();
      await page.waitForTimeout(200);
      const widgets = page.locator('.ss-free-board > [data-module-id], .cc-canvas [data-card]');
      for (let i = 0; i < await widgets.count(); i++) {
        const widget = widgets.nth(i);
        if (await widget.isVisible()) await auditWheel(widget, pageName + ":" + (await widget.getAttribute("data-module-id") || await widget.getAttribute("data-card")));
      }
    }
    console.log(JSON.stringify({ wheelAudit }));
    await page.evaluate(() => scrollTo(0, 500));
    const backgroundY = await page.evaluate(() => scrollY);
    await page.mouse.move(1435, 450);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => scrollY) > backgroundY, "workspace background scrolls the page");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, errors, checks: ["timeline and price chart resize on both axes and reopen", "wheel over timeline and fixed-card boundaries scrolls page", "hidden module restore and library stacking", "title-first custom module with wrapped text", "dashboard vertical resize persists", "empty/populated days preserve saved layout and auto heights shrink", "mobile containment", "long playbook reflows saved neighbor without overlap"] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });



