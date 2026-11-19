// Browser journey for carrying Stillness support to a later day, on the isolated /review app.
// Each day is simulated with a fixed browser clock and a reload, so it also checks persistence.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const url = new URL("/review", process.env.STILLNESS_CARRY_URL || "http://127.0.0.1:3201");
assert.equal(url.hostname, "127.0.0.1", "Use the isolated loopback review app.");
const profile = await mkdtemp(join(tmpdir(), "still-signal-carry-"));
const reminder = "Enough is a choice";
const practice = "Open awareness";
const note = "Notice the urge to make it back before the open.";
const shots = process.env.STILLNESS_CARRY_SHOTS;
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
  const button = (name, scope = page) => scope.getByRole("button", { name, exact: true });
  const nav = name => page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).filter({ visible: true }).first();
  const dialog = () => page.locator("dialog.ss-support-dialog[open]");
  const notice = () => page.locator(".ss-support-notice");
  const shot = async name => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true }); };
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
  const dayRecords = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("still-signal-process-v1");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const rows = db.transaction("records").objectStore("records").getAll();
      rows.onsuccess = () => { db.close(); resolve(rows.result.filter(row => row.record?.kind === "day").map(row => row.record.body.date)); };
      rows.onerror = () => { db.close(); reject(rows.error); };
    };
  }));
  async function day(time) {
    // Time keeps moving from this moment, as it would on the day.
    await page.clock.install({ time: new Date(time) });
    await page.clock.resume();
    await page.goto(url.href);
    await nav("Home").waitFor({ timeout: 60000 });
  }
  async function library() {
    await nav("Stillness").click();
    await button("Support library").click();
  }
  async function addFromLibrary(name) {
    await library();
    await page.locator(".ss-support-card").filter({ hasText: name }).click();
    await button("Add to my day", dialog()).click();
  }
  const preparationRows = () => page.locator(".ss-support-root .ss-support-row");

  // Tuesday, after the close.
  await day("2026-11-17T17:30:00");
  const baselineSessions = await sessions();
  await addFromLibrary(reminder);
  await dialog().getByLabel("My next trading day").check();
  assert.ok(await dialog().getByLabel("Preparation", { exact: true }).isChecked(), "Future support defaults to Preparation.");
  assert.equal(await dialog().locator(".ss-carry-calendar").isVisible(), false, "The calendar shows only for Choose a date.");
  await dialog().getByLabel("A note for that day (optional)").fill(note);
  await shot("1-tuesday-add");
  await button("Save for my next trading day", dialog()).click();
  await notice().getByText("Saved for your next trading day’s Preparation. It will be there when you open it on a day you trade.").waitFor();
  // Saving again adds nothing and shows the saved note instead of a blank field.
  await addFromLibrary(reminder);
  await dialog().getByLabel("My next trading day").check();
  await dialog().locator(".ss-carry-existing").getByText(note).waitFor();
  await button("Save for my next trading day", dialog()).click();
  await notice().getByText("Already saved for your next trading day’s Preparation.").waitFor();
  // A specific date, for both stages.
  await addFromLibrary(practice);
  await dialog().getByLabel("Choose a date").check();
  await dialog().locator(".ss-carry-calendar").waitFor();
  await dialog().getByRole("button", { name: "Friday 20 November", exact: true }).click();
  await dialog().getByLabel("Done for the day", { exact: true }).check();
  await shot("2-tuesday-date");
  await button("Save for Friday 20 November", dialog()).click();
  await notice().getByText("Saved for Friday 20 November’s Preparation and Done for the day.").waitFor();
  await button("Planned ahead (2)").waitFor();
  // Reopening the day it was chosen on leaves it waiting.
  await nav("Preparation").click();
  assert.equal(await preparationRows().filter({ hasText: note }).count(), 0, "Tuesday's own Preparation does not take it.");
  assert.deepEqual(await dayRecords(), [], "Planning ahead writes no trading day.");

  // Wednesday, a day away.
  await day("2026-11-18T09:00:00");
  await button("Day away from charts").click();
  await page.getByText("Day away saved.", { exact: true }).waitFor({ state: "attached" });
  await nav("Preparation").click();
  assert.equal(await preparationRows().filter({ hasText: note }).count(), 0, "A day away leaves it waiting.");
  // Intentional use on a day away: add a piece to today and use it from the day's review.
  await addFromLibrary(practice);
  await dialog().getByText("Today is a day away from charts.").waitFor();
  await button("Add to today, a day away", dialog()).click();
  await notice().getByText("Saved for today, a day away.").waitFor();
  await button("Open that day away", notice()).click();
  const carried = page.locator(".rr-away-carried");
  await carried.getByText(practice, { exact: true }).waitFor();
  await shot("3-wednesday-away");
  await button(`Begin ${practice}`, carried).click();
  await dialog().getByText(/YOUR SUPPORT \/ STEP 1/).waitFor();
  await button("Close support dialog", dialog()).click();
  await nav("Home").click();
  await page.getByText("· Saved for today").waitFor();
  await library();
  await button("Planned ahead (2)").waitFor();

  // Thursday: the next trading day.
  await day("2026-11-19T08:30:00");
  await page.locator(".rr-home-hero").getByRole("button", { name: /Begin preparation/ }).click();
  const row = preparationRows().filter({ hasText: note });
  await row.waitFor();
  assert.match(await row.textContent(), /Enough is a choice/);
  assert.match(await row.textContent(), /A note you left on Tuesday 17 November/);
  await page.getByRole("button", { name: /Start session/ }).waitFor();
  assert.equal(await sessions(), baselineSessions, "Seen before any session starts.");
  await shot("4-thursday-preparation");
  await nav("Done for the day").click();
  assert.equal(await preparationRows().filter({ hasText: note }).count(), 0, "Preparation support stays out of Done.");
  // Both stages when Preparation already holds the piece, then Undo.
  await addFromLibrary(practice);
  await button("Add for today", dialog()).click();
  await notice().getByText("Added to today’s Preparation.").waitFor();
  await addFromLibrary(practice);
  await dialog().getByLabel("Done for the day", { exact: true }).check();
  await button("Add for today", dialog()).click();
  await notice().getByText("Added to today’s Done for the day. Already in today’s Preparation.").waitFor();
  await nav("Done for the day").click();
  await preparationRows().filter({ hasText: practice }).waitFor();
  await button("Undo", notice()).click();
  await notice().getByText("Undone.").waitFor();
  // Undo removes only the Done placement.
  await preparationRows().filter({ hasText: practice }).waitFor({ state: "detached", timeout: 10000 });
  await nav("Preparation").click();
  await preparationRows().filter({ hasText: practice }).waitFor();
  // The boundary for the Journal reference.
  await page.getByText("Set an intention", { exact: true }).click();
  await page.getByRole("textbox", { name: "Intention", exact: true }).fill("Wait for my setup.");
  await page.getByRole("textbox", { name: "Boundary", exact: true }).fill("Stop after two losses.");
  await button("Save for today").click();
  await page.getByText("Saved for today.", { exact: true }).waitFor();
  // Persistence after reload.
  await page.reload();
  await nav("Preparation").click();
  await preparationRows().filter({ hasText: note }).waitFor();
  await preparationRows().filter({ hasText: practice }).waitFor();

  // Friday: the chosen date arrives in both stages, and Thursday's boundary reads back.
  await day("2026-11-20T08:30:00");
  await nav("Preparation").click();
  await preparationRows().filter({ hasText: practice }).waitFor();
  await nav("Done for the day").click();
  await preparationRows().filter({ hasText: practice }).waitFor();
  await library();
  await button("Planned ahead (0)").waitFor();
  assert.equal(await sessions(), baselineSessions, "Planning ahead and showing support started no session.");
  // Opening Journal dates below may create dated journal entries, as it always has.
  await nav("Daily journal").click();
  const reference = page.locator(".rr-daily-reference");
  // The review Journal opens on its sample session in October; step forward to the week of 16 November.
  const openDate = async (weekday, day) => {
    const target = reference.getByRole("button").filter({ hasText: new RegExp(`^${weekday}\\s*${day}(\\D|$)`) });
    for (let week = 0; week < 10 && !(await target.count()); week++) await button("Next reference week", reference).click();
    await target.first().click();
  };
  await openDate("THU", 19);
  await reference.getByRole("heading", { name: "Your boundary" }).waitFor();
  await reference.getByText("Stop after two losses.").waitFor();
  await reference.getByText("Wait for my setup.").waitFor();
  await shot("5-friday-journal-boundary");
  await openDate("TUE", 17);
  await reference.getByText("No preparation or trade recorded").waitFor();
  assert.equal(await reference.getByRole("heading", { name: "Your boundary" }).count(), 0, "An entry without a boundary reads naturally.");
  assert.deepEqual(errors, []);
  console.log("Stillness carry journey passed: next trading day across a day away, a chosen date, use on a day away, both stages with Undo, reload and the Journal boundary.");
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
}
