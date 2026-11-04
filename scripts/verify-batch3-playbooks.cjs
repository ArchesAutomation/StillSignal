// Local-only acceptance checks; never seed or mutate a hosted account.
require("tsx/cjs");
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { latest } = require("../src/lib/process/model.ts");
const base = process.env.BATCH3_QA_URL || "http://127.0.0.1:3003";
const output = process.env.BATCH3_QA_OUTPUT || "../../outputs/batch3";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("This fixture check only supports localhost.");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem("still-signal-appearance", JSON.stringify({ theme: "dark", shark: "#87b9ca", accent: "#c5d7df" })));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const nav = name => page.locator(".ss-reference-nav").getByRole("button", { name, exact: true });
  const books = () => page.locator(".cc-panel").filter({ has: page.getByRole("heading", { name: "Strategy playbooks", exact: true }) });
  const form = () => books().locator("form.cc-form");
  const rows = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("still-signal-process-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, result = db.transaction("records").objectStore("records").getAll();
      result.onsuccess = () => { db.close(); resolve(result.result.map(r => r.record)); };
      result.onerror = () => { db.close(); reject(result.error); };
    };
  }));
  const openQuality = async () => {
    await nav("Command Center").click();
    const first = page.getByRole("button", { name: "Open trade quality", exact: true });
    if (await first.count()) await first.click();
    else await page.getByRole("button", { name: "Finish session / review today", exact: true }).click();
    await books().waitFor();
  };
  const pointerFill = async (locator, value) => {
    await locator.click();
    await locator.fill(value);
    assert.equal(await locator.evaluate(el => el.ownerDocument.activeElement === el), true, "pointer reaches the intended field");
  };
  try {
    await page.goto(base + "/review");
    await openQuality();
    await books().getByRole("button", { name: "New playbook", exact: true }).click();
    await pointerFill(form().getByLabel("Strategy name", { exact: true }), "Batch 3 fixture playbook");
    await pointerFill(form().getByLabel("Instrument applicability", { exact: true }), "ES");
    const names = ["Entry requirements", "Confirmation conditions", "Position sizing rules", "Risk management", "Exit and management guidelines", "Invalid setup conditions", "Personal behavioral requirements"];
    for (const name of names) await pointerFill(form().getByLabel(name, { exact: true }), `Keep ${name}`);
    await pointerFill(form().getByLabel("Rule name", { exact: true }), "My time window");
    await pointerFill(form().getByLabel("Description / manual criterion", { exact: true }), "Keep my unfinished criterion");
    await form().getByLabel("Verification", { exact: true }).selectOption("time-window");
    await form().getByLabel(/^Window start/).fill("09:30");
    await form().getByRole("button", { name: "Cancel", exact: true }).click();
    await books().getByRole("button", { name: "New playbook", exact: true }).click();
    assert.equal(await form().getByLabel("Description / manual criterion", { exact: true }).inputValue(), "Keep my unfinished criterion");
    await nav("Daily journal").click();
    await openQuality();
    for (const name of names) assert.equal(await form().getByLabel(name, { exact: true }).inputValue(), `Keep ${name}`);
    assert.equal(await form().getByLabel(/^Window start/).inputValue(), "09:30");
    assert.equal(await form().getByLabel("Window end", { exact: true }).inputValue(), "");
    await page.reload();
    await openQuality();
    assert.equal(await form().getByLabel("Rule name", { exact: true }).inputValue(), "My time window");
    await form().getByLabel("Window end", { exact: true }).fill("16:00");
    await page.setViewportSize({ width: 390, height: 844 });
    await pointerFill(form().getByLabel("Description / manual criterion", { exact: true }), "Keep my mobile criterion");
    await form().getByLabel("Weight", { exact: true }).focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("2");
    await page.screenshot({ path: output + "/batch3-playbook-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "records") {
          IDBObjectStore.prototype.put = put;
          throw new DOMException("Isolated test write failure", "QuotaExceededError");
        }
        return put.apply(this, args);
      };
    });
    await form().getByRole("button", { name: "Save playbook version", exact: true }).click();
    await books().getByText(/Could not save this playbook/).waitFor();
    assert.equal(latest(await rows(), "playbook").length, 0);
    assert.equal(await form().getByLabel("Description / manual criterion", { exact: true }).inputValue(), "Keep my mobile criterion");
    await form().evaluate(node => { node.requestSubmit(); node.requestSubmit(); });
    await books().getByText(/Saved “Batch 3 fixture playbook”/).waitFor();
    let records = await rows(), original = latest(records, "playbook")[0];
    assert.equal(records.filter(r => r.kind === "playbook").length, 1);
    assert.equal(original.body.rules[0].description, "Keep my mobile criterion");
    assert.equal(original.body.rules[0].weight, 2);
    const assessment = page.locator(".cc-panel").filter({ has: page.getByRole("heading", { name: "Setup quality & adherence", exact: true }) });
    await assessment.getByRole("button", { name: "Assess setup or execution", exact: true }).click();
    await assessment.getByLabel("Playbook version", { exact: true }).selectOption(original.id);
    await assessment.getByLabel("Planned instrument (for planned setup)").fill("ES");
    await assessment.getByLabel("Planned units", { exact: true }).fill("1");
    await assessment.getByRole("button", { name: "Save assessment", exact: true }).click();
    await assessment.getByRole("button", { name: "Save assessment", exact: true }).waitFor({ state: "hidden" });
    const pinned = latest(await rows(), "assessment")[0];
    await books().getByRole("button", { name: "Edit next version", exact: true }).click();
    await pointerFill(form().getByLabel("Description / manual criterion", { exact: true }), "Keep my revised criterion");
    await form().getByRole("button", { name: "Cancel", exact: true }).click();
    await books().getByRole("button", { name: "Edit next version", exact: true }).click();
    assert.equal(await form().getByLabel("Description / manual criterion", { exact: true }).inputValue(), "Keep my revised criterion");
    await form().getByRole("button", { name: "Save playbook version", exact: true }).click();
    await form().waitFor({ state: "hidden" });
    assert.equal(latest(await rows(), "playbook")[0].revision, 2);
    await books().getByRole("button", { name: "Archive", exact: true }).click();
    await books().getByText(/Archived “Batch 3 fixture playbook”/).waitFor();
    await books().getByRole("button", { name: "Restore", exact: true }).click();
    await books().getByText(/Restored “Batch 3 fixture playbook”/).waitFor();
    records = await rows();
    assert.equal(latest(records, "playbook")[0].revision, 4);
    assert.equal(latest(records, "assessment")[0].body.playbookId, original.id);
    assert.equal(latest(records, "assessment")[0].id, pinned.id);
    assert.equal(records.find(r => r.id === original.id).body.rules[0].description, "Keep my mobile criterion");
    await page.screenshot({ path: output + "/batch3-playbook-restored.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, errors, checks: ["pointer and keyboard access on desktop/mobile", "all playbook text sections and incomplete rule survive close/navigation/refresh", "failed local save retains inputs", "repeated submit commits one playbook", "revision draft survives close/reopen", "archive and restore retain original versions and assessment links"] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
