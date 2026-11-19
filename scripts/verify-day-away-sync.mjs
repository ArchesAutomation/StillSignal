// Signed-in sync check for away days. It only runs against a disposable loopback Supabase stack.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const appUrl = new URL(process.env.DAY_AWAY_APP_URL || "http://127.0.0.1:3195");
const supabaseUrl = new URL(process.env.DAY_AWAY_SUPABASE_URL || "http://127.0.0.1:55321");
const serviceKey = process.env.DAY_AWAY_SERVICE_KEY;
const publishableKey = process.env.DAY_AWAY_PUBLISHABLE_KEY;
assert.equal(appUrl.hostname, "127.0.0.1", "Use a loopback app.");
assert.equal(supabaseUrl.hostname, "127.0.0.1", "Use a disposable loopback Supabase stack.");
assert(serviceKey && publishableKey, "Set DAY_AWAY_SERVICE_KEY and DAY_AWAY_PUBLISHABLE_KEY from the local stack.");

const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const api = (path, init = {}) => fetch(new URL(path, supabaseUrl), { ...init, headers: { ...admin, "Content-Type": "application/json", ...init.headers } });
const rows = async (table, owner) => {
  const response = await api(`/rest/v1/${table}?select=*&user_id=eq.${owner}`);
  const body = await response.text();
  assert(response.ok, `${table}: ${response.status} ${body}`);
  return JSON.parse(body);
};
async function createUser(label) {
  const email = `${label}-${randomUUID()}@example.test`, password = randomUUID();
  const response = await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) });
  const body = await response.text();
  assert(response.ok, body);
  return { id: JSON.parse(body).id, email, password };
}
async function until(check, message) {
  const stop = Date.now() + 30000;
  for (;;) {
    if (await check()) return;
    assert(Date.now() < stop, message);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZFwAAAAASUVORK5CYII=", "base64");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", args: ["--disable-gpu"] });
const errors = [];
async function device(user, time) {
  // The app's security policy only trusts hosted *.supabase.co origins, not this loopback stack.
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, bypassCSP: true });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  // A device can start on a chosen local time. The clock then keeps moving, as on a real day.
  if (time) {
    await page.clock.install({ time: new Date(time) });
    await page.clock.resume();
  }
  await page.goto(appUrl.href);
  await page.getByPlaceholder("you@example.com").fill(user.email);
  await page.getByPlaceholder("Your password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).first().waitFor({ timeout: 60000 });
  return page;
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const nav = (page, name) => page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).filter({ visible: true }).first();
const writing = page => page.locator("#rr-away-writing");

try {
  const owner = await createUser("away-owner"), other = await createUser("away-other");
  const first = await device(owner);

  await button(first, "Day away from charts").click();
  await button(first, "Open in Daily journal").click();
  await button(first, "Add a reason").click();
  await writing(first).fill("Stepping back to rest.");
  await button(first, "Save").click();
  await button(first, "Review charts").click();
  await first.getByLabel("Add screenshots").setInputFiles([{ name: "walk.png", mimeType: "image/png", buffer: png }]);
  await first.getByLabel("Caption (optional)").fill("The chart I came back to.");
  await writing(first).fill("I noticed how much I wanted reassurance.");
  await button(first, "Save").click();
  await first.getByText("The chart I came back to.", { exact: true }).waitFor();
  const journalMode = page => page.getByRole("group", { name: "Journal view" });
  await journalMode(first).getByRole("button", { name: "Journal", exact: true }).click();
  await button(first, "Write first").click();
  const book = page => page.getByRole("textbox", { name: "Journal page", exact: true });
  await book(first).fill("Words for the book on a quiet day.");
  await book(first).blur();
  await first.locator(".ss-book-status").getByText("Saved", { exact: true }).waitFor();
  await journalMode(first).getByRole("button", { name: "Day in Action", exact: true }).click();

  await button(first, "Mark another date").click();
  const earlier = await first.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() - 3);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  });
  const dialog = first.getByRole("dialog", { name: "Mark a day away" });
  await dialog.getByLabel("Journal date").fill(earlier);
  await dialog.getByRole("button", { name: "Mark as day away" }).click();
  await dialog.waitFor({ state: "hidden" });
  await button(first, "Write a reflection").click();
  await writing(first).fill("An earlier thought worth carrying.");
  await button(first, "Save").click();
  await button(first, "Carry forward to a later day").click();
  await first.locator(".ss-carry-form").getByLabel("Today", { exact: true }).check();
  await first.locator(".ss-carry-form textarea").fill("Notice what I want to prove.");
  await button(first, "Add to today, a day away").click();
  await button(first, "Stop carrying it forward").waitFor();

  const expected = ["day", "reason", "note", "book", "carry"];
  await until(async () => {
    const saved = (await rows("away_day_events", owner.id)).map(row => row.data.body.type);
    return expected.every(type => saved.includes(type)) && saved.filter(type => type === "note").length === 2;
  }, "Away changes did not reach the account.");
  const events = await rows("away_day_events", owner.id);
  const note = events.map(row => row.data.body).find(body => body.type === "note" && body.images.length);
  assert.match(note.images[0].path, new RegExp(`^${owner.id}/away-days/`));
  assert.deepEqual(await rows("pulse_sessions", owner.id), [], "Marking and writing created no trading session.");
  assert.deepEqual(await rows("trading_days", owner.id), [], "Marking and writing opened no trading day.");

  const second = await device(owner);
  await button(second, "Open in Daily journal").click({ timeout: 45000 });
  await second.getByText("Stepping back to rest.", { exact: true }).waitFor();
  await button(second, "Open reflection and charts").click();
  await second.getByText("The chart I came back to.", { exact: true }).waitFor();
  await second.locator(".rr-away-images img").first().evaluate(async image => { await image.decode(); if (!image.naturalWidth) throw new Error("Screenshot did not load."); });
  await journalMode(second).getByRole("button", { name: "Journal", exact: true }).click();
  await button(second, "Open where you left off").click();
  assert.equal(await book(second).inputValue(), "Words for the book on a quiet day.");
  await journalMode(second).getByRole("button", { name: "Day in Action", exact: true }).click();
  await button(second, "Back to the day").click();
  await button(second, "Write a reflection").click();
  await writing(second).fill("Written on the second device.");
  await button(second, "Save").click();
  await button(second, "Back to the day").click();

  await until(async () => (await rows("away_day_events", owner.id)).some(row => row.data.body.text === "Written on the second device."), "The second device did not sync.");
  await first.reload();
  await button(first, "Open in Daily journal").click({ timeout: 45000 });
  await first.getByText("Written on the second device.", { exact: true }).waitFor({ timeout: 45000 });

  await nav(second, "Home").click();
  await button(second, "Return to trading day").click();
  await button(second, "Begin preparation").click();
  await second.getByText("Notice what I want to prove.", { exact: true }).waitFor();
  await button(second, "Mark as seen").click();
  await button(second, "Mark as seen").waitFor({ state: "hidden" });
  await until(async () => (await rows("away_day_events", owner.id)).some(row => row.data.body.type === "carry-removed"), "The seen note did not sync.");
  assert.deepEqual(await rows("pulse_sessions", owner.id), [], "Carry-forward created no trading session.");

  // Carrying a Stillness piece and note to the next trading day, across two devices.
  // Simulated days stay before the real time, so the account's sign-in tokens remain valid.
  const carrier = await createUser("carry-owner");
  const piece = "Enough is a choice", carryNote = "Notice the urge to make it back before the open.";
  const tuesday = "2026-11-17", wednesday = "2026-11-18", thursday = "2026-11-19";
  const awayRows = async () => (await rows("away_day_events", carrier.id)).map(row => row.data.body);
  const carryRows = page => page.locator(".ss-support-root .ss-support-row").filter({ hasText: carryNote });
  const planned = (page, count) => page.getByRole("button", { name: `Planned ahead (${count})`, exact: true });
  const library = async page => {
    await nav(page, "Stillness").click();
    await button(page, "Support library").click();
  };
  async function travel(page, time) {
    await page.clock.setSystemTime(new Date(time));
    await page.reload();
    await page.getByRole("navigation", { name: "Main navigation" }).first().waitFor({ timeout: 60000 });
  }
  async function showsCarriedPiece(page, label) {
    await nav(page, "Preparation").click();
    const shown = carryRows(page);
    await shown.first().waitFor({ timeout: 45000 });
    assert.equal(await shown.count(), 1, `${label}: the piece and note show once.`);
    const text = await shown.textContent();
    assert.match(text, /Enough is a choice/, `${label}: the exact piece.`);
    assert.match(text, /A note you left on Tuesday 17 November/, `${label}: the note, beside the piece.`);
    await page.getByRole("button", { name: /Start session/ }).waitFor();
    await nav(page, "Done for the day").click();
    assert.equal(await carryRows(page).count(), 0, `${label}: Preparation support stays out of Done.`);
    await library(page);
    await planned(page, 0).waitFor({ timeout: 45000 });
  }

  // Device A, Tuesday after the close: save the piece and a note for the next trading day.
  const deviceA = await device(carrier, `${tuesday}T17:30:00`);
  await library(deviceA);
  await deviceA.locator(".ss-support-card").filter({ hasText: piece }).click();
  const addDialog = deviceA.locator("dialog.ss-support-dialog[open]");
  await button(addDialog, "Add to my day").click();
  await addDialog.getByLabel("My next trading day").check();
  assert(await addDialog.getByLabel("Preparation", { exact: true }).isChecked(), "Preparation is the default for a later day.");
  await addDialog.getByLabel("A note for that day (optional)").fill(carryNote);
  await button(addDialog, "Save for my next trading day").click();
  await deviceA.getByText(/Saved for your next trading day’s Preparation\./).waitFor();
  await until(async () => (await awayRows()).some(body => body.type === "carry" && body.note === carryNote), "Device A's carry did not reach the account.");
  const [saved] = (await awayRows()).filter(body => body.type === "carry");
  assert.deepEqual([saved.date, saved.target, saved.stages, saved.choice], [tuesday, "next", ["Preparation"], { itemId: "enough" }]);

  // Device B, Wednesday: a day away leaves it waiting, even with Preparation open.
  const deviceB = await device(carrier, `${wednesday}T09:00:00`);
  await library(deviceB);
  await planned(deviceB, 1).waitFor({ timeout: 45000 });
  await nav(deviceB, "Home").click();
  await button(deviceB, "Day away from charts").click();
  await until(async () => (await awayRows()).some(body => body.type === "day" && body.date === wednesday && body.away), "Wednesday's day away did not sync.");
  await nav(deviceB, "Preparation").click();
  await deviceB.getByRole("button", { name: /Start session/ }).waitFor();
  assert.equal(await carryRows(deviceB).count(), 0, "A day away does not take the piece.");
  await library(deviceB);
  await planned(deviceB, 1).waitFor();
  assert.equal((await awayRows()).filter(body => body.type === "carry-surfaced").length, 0, "Still waiting after the day away.");

  // Device B, Thursday: opening Preparation fixes it to Thursday, before any session.
  await travel(deviceB, `${thursday}T08:30:00`);
  await deviceB.locator(".rr-home-hero").getByRole("button", { name: /Begin preparation/ }).click();
  await carryRows(deviceB).first().waitFor({ timeout: 45000 });
  await until(async () => (await awayRows()).some(body => body.type === "carry-surfaced"), "Thursday's opening did not sync.");
  assert.deepEqual(await rows("pulse_sessions", carrier.id), [], "No session was started.");

  // Device A catches up on Thursday. Both devices reload and show the same piece, note and day once.
  await travel(deviceA, `${thursday}T08:45:00`);
  await library(deviceA);
  await planned(deviceA, 0).waitFor({ timeout: 45000 });
  await showsCarriedPiece(deviceA, "Device A");
  await travel(deviceB, `${thursday}T09:00:00`);
  await showsCarriedPiece(deviceB, "Device B");
  const finalRows = await awayRows();
  const surfaced = finalRows.filter(body => body.type === "carry-surfaced");
  assert.deepEqual([...new Set(surfaced.map(body => body.day))], [thursday], "Every device resolved it to Thursday.");
  assert.equal(new Set(finalRows.filter(body => body.type === "carry").map(body => body.carryId)).size, 1, "One carry, saved once.");
  assert.deepEqual(await rows("trading_days", carrier.id), [], "Planning ahead and showing support wrote no trading day.");
  console.log(`Signed-in carry passed: saved on device A (Tuesday), waited through device B's day away (Wednesday), shown with its note on both devices on Thursday; ${surfaced.length} opening change(s), all Thursday.`);

  const stranger = await device(other);
  await button(stranger, "Day away from charts").waitFor({ timeout: 45000 });
  assert.equal(await button(stranger, "Open in Daily journal").count(), 0, "Another account sees no away day.");
  const token = await stranger.evaluate(() => {
    const key = Object.keys(localStorage).find(name => name.endsWith("-auth-token"));
    return JSON.parse(localStorage.getItem(key)).access_token;
  });
  const asStranger = { apikey: publishableKey, Authorization: `Bearer ${token}` };
  const foreign = await fetch(new URL(`/rest/v1/away_day_events?select=id&user_id=eq.${owner.id}`, supabaseUrl), { headers: asStranger });
  assert.deepEqual(await foreign.json(), [], "Row-level security hides another account's away days.");
  const image = await fetch(new URL(`/storage/v1/object/authenticated/pulse-screenshots/${note.images[0].path}`, supabaseUrl), { headers: asStranger });
  assert(!image.ok, "Another account cannot read the screenshot.");
  assert.deepEqual(errors, []);
  console.log(`Signed-in sync passed: ${(await rows("away_day_events", owner.id)).length} away changes across two devices, 0 sessions, 0 trading days, private to the account.`);
} finally {
  await browser.close();
}
