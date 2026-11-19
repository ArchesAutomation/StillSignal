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
  const storedCount = (database, store, match) => page.evaluate(([name, objectStore, kind]) => new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const rows = db.transaction(objectStore).objectStore(objectStore).getAll();
      rows.onsuccess = () => { db.close(); resolve(rows.result.filter(row => !kind || row.record?.kind === kind).length); };
      rows.onerror = () => { db.close(); reject(rows.error); };
    };
  }), [database, store, match]);
  const tradingDays = () => storedCount("still-signal-process-v1", "records", "day");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZFwAAAAASUVORK5CYII=", "base64");

  await page.goto(url.href);
  await button("Day away from charts").waitFor();
  const hero = page.locator(".rr-home-hero");
  assert.equal(await hero.getByRole("button", { name: "Day away from charts" }).count(), 0);
  assert.equal(await hero.getByRole("button", { name: "Open a saved example" }).count(), 0);
  assert.equal(await page.getByLabel("Review layout").count(), 0);
  assert.equal(await button("Mark another date").count(), 0);
  const baseline = await sessions();
  const baselineDays = await tradingDays();
  await button("Day away from charts").click();
  await page.getByText("Day away saved.", { exact: true }).waitFor();
  await page.reload();
  await button("Open in Daily journal").waitFor();
  await hero.getByRole("button", { name: "Begin preparation" }).waitFor();
  await page.getByRole("heading", { name: "What would you like support with during trading?" }).waitFor();
  await page.getByRole("heading", { name: "A rhythm for your day" }).waitFor();
  await nav("Preparation").click();
  await page.getByRole("button", { name: /Start session/ }).waitFor();
  await page.getByText("Name how you’re arriving", { exact: true }).waitFor();
  await nav("Done for the day").click();
  await page.getByRole("heading", { name: "You can put the day down." }).waitFor();
  await nav("Home").click();
  await button("Open in Daily journal").click();
  const journalMode = page.getByRole("group", { name: "Journal view" });
  const actionTab = journalMode.getByRole("button", { name: "Day in Action" });
  const bookTab = journalMode.getByRole("button", { name: "Journal", exact: true });
  assert.equal(await actionTab.getAttribute("aria-pressed"), "true");
  await bookTab.click();
  await button("Write first").click();
  const journalPage = page.getByRole("textbox", { name: "Journal page", exact: true });
  await journalPage.fill("These are my separate journal words.");
  await journalPage.blur();
  await page.locator(".ss-book-status").getByText("Saved", { exact: true }).waitFor();
  assert.equal(await button("Review charts").count(), 0, "The regular book has no away editor.");
  await actionTab.click();
  await page.getByRole("heading", { name: "Space between sessions.", exact: true }).waitFor();
  const dailyReference = page.getByRole("region", { name: "Daily reference", exact: true });
  await dailyReference.getByText("Day away from charts", { exact: true }).waitFor();
  await dailyReference.locator('[data-status="Away"]').getByText("Away", { exact: true }).waitFor();
  assert.equal(await dailyReference.getByRole("heading", { name: "Your intention" }).count(), 0);
  assert.equal(await dailyReference.getByRole("heading", { name: "How you arrived" }).count(), 0);
  await button("+ Add reflection").click();
  await page.locator("#rr-away-writing").waitFor();
  await button("Cancel").click();
  assert.equal(await actionTab.getAttribute("aria-pressed"), "true");
  await page.getByRole("region", { name: "Daily reference", exact: true }).waitFor();
  await page.getByRole("button", { name: /Day away from charts/ }).filter({ visible: true }).first().waitFor();
  await button("Add a reason").click();
  await page.locator("#rr-away-writing").fill("I wanted a little room today.");
  await button("Save").click();
  const reasonWidget = page.locator('[data-module-id="away-reason"]');
  const reflectionWidget = page.locator('[data-module-id="away-reflection"]');
  await reasonWidget.getByRole("heading", { name: "Why I stayed away", exact: true }).waitFor();
  await reasonWidget.locator("blockquote").getByText("I wanted a little room today.", { exact: true }).waitFor();
  await reflectionWidget.getByRole("heading", { name: "Reflection", exact: true }).waitFor();
  await button("Review charts").click();
  await button("Reflect on a setup").click();
  await page.locator('.rr-away-prompt[data-open="true"]').getByText(/What would still have been uncertain/).waitFor();
  await button("Reflect on a setup").click();
  assert.equal(await button("Reflect on a setup").getAttribute("aria-expanded"), "false");
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
  await page.reload();
  await button("Open in Daily journal").click();
  await page.getByText("I wanted a little room today.", { exact: true }).waitFor();
  await button("Open reflection and charts").click();
  await page.getByText("The view I came back to after a walk.", { exact: true }).waitFor();
  await page.locator(".rr-away-images img").first().evaluate(image => image.decode());
  await bookTab.click();
  await button("Open where you left off").click();
  assert.equal(await journalPage.inputValue(), "These are my separate journal words.");
  assert.equal(await sessions(), baseline, "Away activity and the separate book must not write a trading session.");
  assert.equal(await tradingDays(), baselineDays, "Away activity must not open a trading day.");
  assert(await storedCount("still-signal-away-days-v1", "events") >= 4, "Away changes are stored as account-scoped events.");
  await actionTab.click();

  await page.setViewportSize({ width: 390, height: 850 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Away journal fits a narrow viewport.");
  await button("Mark another date").click();
  const dateDialog = page.getByRole("dialog", { name: "Mark a day away" });
  await dateDialog.getByLabel("Journal date").waitFor();
  await page.keyboard.press("Escape");
  assert(!(await dateDialog.isVisible()));
  await button("Mark another date").click();
  const earlierDate = await page.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() - 3);
    const year = day.getFullYear();
    return `${year}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  });
  await dateDialog.getByLabel("Journal date").fill(earlierDate);
  await dateDialog.getByRole("button", { name: "Mark as day away" }).click();
  await dateDialog.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Space between sessions.", exact: true }).waitFor();
  await button("Write a reflection").click();
  await page.locator("#rr-away-writing").fill("Yesterday I noticed a pull to check the market.");
  await button("Save").click();
  await button("Carry forward to a later day").click();
  await page.locator(".ss-carry-form").getByLabel("Today", { exact: true }).check();
  await page.locator(".ss-carry-form textarea").fill("Take a breath and notice what I want to prove.");
  await button("Add to today, a day away").click();
  await button("Stop carrying it forward").waitFor();
  await nav("Home").click();
  await button("Open in Daily journal").click();
  await button("Continue a thought").click();
  await page.getByText(/From Day in Action/).waitFor();
  await button("Open reflection").click();
  await button("Add a follow-up").click();
  await page.locator("#rr-away-writing").fill("I noticed the same feeling this morning.");
  await button("Save").click();
  await page.getByText("I noticed the same feeling this morning.", { exact: true }).waitFor();
  await nav("Home").click();
  await button("Return to trading day").click();
  await button("Begin preparation").click();
  await page.getByText("Take a breath and notice what I want to prove.", { exact: true }).waitFor();
  await page.getByText("Name how you’re arriving", { exact: true }).waitFor();
  await button("Mark as seen").click();
  await button("Mark as seen").waitFor({ state: "hidden" });
  await page.getByText("Set an intention", { exact: true }).click();
  await page.getByRole("textbox", { name: "Intention", exact: true }).fill("Give myself time before acting.");
  await button("Save for today").click();
  await page.getByText("Saved for today.", { exact: true }).waitFor();
  await nav("Daily journal").click();
  await actionTab.click();
  await page.getByText(/October 2026.+Your reflections/).waitFor();
  await page.getByRole("heading", { name: "Your day, in your words.", exact: true }).first().waitFor();
  await dailyReference.getByText("Trade recorded", { exact: true }).waitFor();
  await dailyReference.locator('[data-status="Trade"]').getByText("Trade", { exact: true }).waitFor();
  assert.equal(await dailyReference.getByRole("heading", { name: "Your intention" }).count(), 0);
  assert.equal(await button("Review charts").count(), 0);
  assert.equal(await reasonWidget.count(), 0);
  assert.equal(await reflectionWidget.count(), 0);

  await page.setViewportSize({ width: 1440, height: 950 });
  await nav("Home").click();
  await button("Day away from charts").click();
  await button("Open in Daily journal").click();
  await reflectionWidget.getByRole("button", { name: "Return to trading day" }).click();
  await dailyReference.getByText("Preparation saved · No trade recorded", { exact: true }).waitFor();
  await dailyReference.locator('[data-status="Prep"]').getByText("Prep", { exact: true }).waitFor();
  await dailyReference.getByText("Give myself time before acting.", { exact: true }).waitFor();
  assert.equal(await dailyReference.getByRole("heading", { name: "How you arrived" }).count(), 0);
  await nav("Home").click();
  await button("Day away from charts").click();
  await button("Open in Daily journal").click();
  await button("Edit dashboard").click();
  await page.getByLabel("Dashboard name").fill("Away-day layout");
  await button("Move Why I stayed away").waitFor();
  await button("Move Reflection").waitFor();
  await button("Edit inside Why I stayed away").click();
  await reasonWidget.getByLabel("Module title").fill("My reason");
  await reasonWidget.getByRole("button", { name: "Done", exact: true }).click();
  await button("Hide Reflection module").click();
  await button("Save dashboard").click();
  await reasonWidget.getByRole("heading", { name: "My reason", exact: true }).waitFor();
  await reflectionWidget.waitFor({ state: "hidden" });
  await page.reload();
  await button("Open in Daily journal").click();
  await button("Journal layouts").click();
  await page.getByLabel("Journal layout", { exact: true }).selectOption({ label: "Away-day layout" });
  await reasonWidget.getByRole("heading", { name: "My reason", exact: true }).waitFor();
  assert.equal(await reflectionWidget.isVisible(), false);
  await button("+ Add reflection").click();
  const shortcut = page.getByRole("dialog", { name: "Write a reflection", exact: true });
  await shortcut.getByRole("textbox", { name: "Reflection", exact: true }).waitFor();
  await shortcut.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await sessions(), baseline);
  await nav("Home").click();
  await button("Return to trading day").click();
  await button("Begin preparation").click();
  await page.getByRole("button", { name: /^Start session/ }).click();
  await dailyReference.getByText("Session started · No trade recorded", { exact: true }).waitFor();
  await dailyReference.locator('[data-status="Session"]').getByText("Session", { exact: true }).waitFor();
  await nav("Done for the day").click();
  await button("End session").click();
  if (process.env.REGULAR_JOURNAL_REVIEW_URL) {
    const regular = new URL("/review", process.env.REGULAR_JOURNAL_REVIEW_URL);
    assert.equal(regular.hostname, "127.0.0.1", "Use an isolated loopback instance with the away flag off.");
    const regularPage = await browser.newPage();
    regularPage.on("pageerror", error => errors.push(error.message));
    await regularPage.goto(regular.href);
    const reference = regularPage.getByRole("region", { name: "Daily reference", exact: true });
    await reference.getByText("Trade recorded", { exact: true }).waitFor();
    assert.equal(await regularPage.getByRole("button", { name: "Mark another date", exact: true }).count(), 0);

    const { date: yesterday, label: dateLabel, weekOffset } = await regularPage.evaluate(() => {
      const localDate = day => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const day = new Date();
      day.setDate(day.getDate() - 1);
      if (day.getDay() === 0) day.setDate(day.getDate() - 2);
      if (day.getDay() === 6) day.setDate(day.getDate() - 1);
      const utcDate = Date.parse(`${localDate(day)}T12:00:00Z`);
      return {
        date: localDate(day), label: day.toLocaleDateString("en-US", { dateStyle: "full" }),
        weekOffset: Math.floor((utcDate - Date.parse("2026-10-12T12:00:00Z")) / 604800000),
      };
    });
    assert.notEqual(yesterday, "2026-10-13", "Use an unseeded date for manual trade entry.");
    for (let index = 0; index < Math.abs(weekOffset); index++) {
      await reference.getByRole("button", { name: weekOffset < 0 ? "Previous reference week" : "Next reference week" }).click();
    }
    await reference.getByRole("button", { name: dateLabel, exact: true }).click();
    await reference.getByText("No preparation or trade recorded", { exact: true }).waitFor();
    const tools = regularPage.locator(".ss-topbar .ss-tools");
    await tools.locator("summary").press("Enter");
    await tools.getByRole("button", { name: "Add trade", exact: true }).click();
    await regularPage.getByLabel("Instrument", { exact: true }).fill("AAPL");
    await regularPage.getByLabel("Price", { exact: true }).fill("200.25");
    await regularPage.getByLabel("Time · your local timezone", { exact: true }).fill(`${yesterday}T12:00`);
    await regularPage.getByRole("button", { name: "Save event", exact: true }).click();
    await reference.locator('[data-status="Trade"]').getByText("Trade", { exact: true }).waitFor();
    await reference.getByText("Trade recorded", { exact: true }).waitFor();
    console.log("Regular Journal passed: a newly entered trade immediately labels its date with the away prototype off.");
  }
  assert.deepEqual(errors, []);
  console.log("Real review app passed: Away, Prep, Session and Trade labels, saved preparation, independent away widgets, regular Journal book, screenshots, follow-up, and next-preparation reminder.");
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
}
