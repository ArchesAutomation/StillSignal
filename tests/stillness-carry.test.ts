import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { foldAwayEvents } from "../src/lib/away-day-state";
import { createAwayEvent, readAwayEvents, saveAwayEvents, syncAwayEventsWith, type AwayTransport } from "../src/lib/away-day-storage";
import { awayActionSchema, type AwayEvent, type AwayEventBody } from "../src/lib/process/away-days";
import { createRecord, latest } from "../src/lib/process/model";
import { readProcess, saveProcess } from "../src/lib/process/storage";
import { emptyTradingDay } from "../src/lib/process/trading-day";
import { readingRoomDayLabels, readingRoomReference } from "../src/lib/reading-room";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import {
  carriesFor, carryUnchangedSince, claimableCarries, foldCarries, libraryChoices, pendingCarries, planCarry, resolvedDate,
} from "../src/lib/stillness-carry";
import { StillnessLibrary, type CarrySupport } from "../src/components/stillness-library";
import type { ProcessStore } from "../src/components/process/use-process";

const tuesday = "2026-11-17", wednesday = "2026-11-18", thursday = "2026-11-19";
const reminder = { itemId: "fix-a-loss", piece: 1 };
let clock = 1000;
const event = (body: AwayEventBody) => createAwayEvent(body, clock++);
const fold = (bodies: AwayEventBody[]) => foldCarries(bodies.map(event));

test("a next-trading-day carry waits through a day away and attaches to the stage first opened", () => {
  const saved = planCarry({}, { source: tuesday, today: tuesday, target: "next", stages: ["Preparation"], choice: reminder, note: "Breathe before the open." });
  assert.equal(saved.status, "added");
  const events = saved.bodies.map(event);
  const carries = foldCarries(events);
  // Reopening Tuesday never claims it. Wednesday is a day away, so the screen never asks.
  assert.deepEqual(claimableCarries(carries, tuesday, "Preparation"), []);
  assert.deepEqual(claimableCarries(carries, thursday, "Done"), [], "A Preparation carry waits for Preparation.");
  const [claim] = claimableCarries(carries, thursday, "Preparation");
  assert.equal(claim.note, "Breathe before the open.");
  assert.deepEqual(pendingCarries(carries, wednesday).map(carry => carry.id), [saved.carryId], "Still waiting on Wednesday.");
  const surfaced = foldCarries([...events, event({ type: "carry-surfaced", date: tuesday, carryId: saved.carryId, day: thursday })]);
  assert.equal(resolvedDate(surfaced[saved.carryId]), thursday);
  assert.deepEqual(carriesFor(surfaced, thursday, "Preparation").map(carry => carry.choice), [reminder], "The exact piece arrives.");
  assert.deepEqual(pendingCarries(surfaced, thursday), []);
});

test("both stages share one day, fixed by whichever stage opens first, on every device", () => {
  const saved = planCarry({}, { source: tuesday, today: tuesday, target: "next", stages: ["Done", "Preparation"], choice: reminder });
  const created = saved.bodies.map(event);
  const doneFirst = event({ type: "carry-surfaced", date: tuesday, carryId: saved.carryId, day: thursday });
  const laterClaim = event({ type: "carry-surfaced", date: tuesday, carryId: saved.carryId, day: "2026-11-20" });
  const deviceA = foldCarries([...created, doneFirst, laterClaim]);
  const deviceB = foldCarries([laterClaim, doneFirst, ...created].reverse());
  assert.deepEqual(deviceA, deviceB);
  assert.equal(resolvedDate(deviceA[saved.carryId]), thursday);
  assert.deepEqual(carriesFor(deviceA, thursday).map(carry => carry.stages), [["Preparation", "Done"]]);
});

test("repeated saves add no second placement, keep notes unless edited, and Undo reverses only that save", () => {
  const first = planCarry({}, { source: tuesday, today: tuesday, target: thursday, stages: ["Preparation"], choice: reminder, note: "Original note" });
  let events = first.bodies.map(event);
  let carries = foldCarries(events);
  assert.equal(planCarry(carries, { source: tuesday, today: tuesday, target: thursday, stages: ["Preparation"], choice: reminder }).status, "unchanged");
  const different = planCarry(carries, { source: tuesday, today: tuesday, target: thursday, stages: ["Preparation"], choice: reminder, note: "Something else" });
  assert.equal(different.status, "unchanged", "A different note does not silently replace the saved one.");
  const both = planCarry(carries, { source: tuesday, today: tuesday, target: thursday, stages: ["Preparation", "Done"], choice: reminder });
  events = [...events, ...both.bodies.map(event)];
  carries = foldCarries(events);
  assert.deepEqual(carries[first.carryId].stages, ["Preparation", "Done"]);
  assert.equal(carries[first.carryId].note, "Original note");
  assert.equal(Object.keys(carries).length, 1);
  assert.ok(carryUnchangedSince(carries, both));
  events = [...events, ...both.undo.map(event)];
  carries = foldCarries(events);
  assert.deepEqual(carries[first.carryId].stages, ["Preparation"], "Undo keeps the placement that was already there.");
  const edited = planCarry(carries, { source: tuesday, today: tuesday, target: thursday, stages: ["Preparation"], choice: reminder, note: "Edited", editNote: true });
  carries = foldCarries([...events, ...edited.bodies.map(event)]);
  assert.equal(carries[first.carryId].note, "Edited");
  const removed = foldCarries([...events, ...first.undo.map(event)]);
  assert.equal(removed[first.carryId].removed, true);
  assert.equal(carryUnchangedSince(carries, both), false, "Undo refuses once something else changed it.");
});

test("bookmarks are independent and older saved support stays listed", () => {
  const older = [{ itemId: "release" }];
  const added = event({ type: "library", date: tuesday, choice: reminder, saved: true });
  assert.deepEqual(libraryChoices([added], older), [{ itemId: "release" }, reminder]);
  const undone = event({ type: "library", date: tuesday, choice: reminder, saved: false });
  assert.deepEqual(libraryChoices([added, undone], older), [{ itemId: "release" }]);
  const sameAsOlder = event({ type: "library", date: tuesday, choice: { itemId: "release" }, saved: false });
  assert.deepEqual(libraryChoices([sameAsOlder], older), [{ itemId: "release" }], "Undoing a new bookmark never hides an older one.");
});

test("carries change no away day, trading-day record or Prep label", () => {
  const events = [
    event({ type: "carry", date: tuesday, carryId: crypto.randomUUID(), target: thursday, stages: ["Preparation"], choice: reminder, note: "For Thursday" }),
    event({ type: "library", date: tuesday, choice: reminder, saved: true }),
  ];
  assert.deepEqual(foldAwayEvents(events), {});
  assert.deepEqual(readingRoomDayLabels([], [], [], []), {});
  assert.throws(() => createAwayEvent({ type: "carry", date: tuesday, carryId: crypto.randomUUID(), target: "next", stages: ["Preparation"] }), /piece or write a note/);
  assert.throws(() => createAwayEvent({ type: "carry", date: tuesday, carryId: crypto.randomUUID(), target: "next", stages: [], note: "x" }));
});

function transport() {
  const server: AwayEvent[] = [];
  let reject = false;
  const api: AwayTransport = {
    append: async events => {
      // The server validates every append exactly as the Edge Function does.
      if (reject || !awayActionSchema.safeParse({ action: "away-append", events }).success) throw new Error("rejected");
      for (const item of events) if (!server.some(row => row.id === item.id)) server.push(item);
    },
    list: async after => ({ events: server.slice(Number(after)), cursor: String(server.length), more: false }),
    upload: async () => {},
  };
  return { api, server, setReject: (value: boolean) => { reject = value; } };
}

test("a carry syncs to another device and resolves to the same day; a rejected write stays pending", async () => {
  const phone = crypto.randomUUID(), laptop = crypto.randomUUID();
  const remote = transport();
  const saved = planCarry({}, { source: tuesday, today: tuesday, target: "next", stages: ["Preparation"], choice: reminder, note: "Before Thursday" });
  await saveAwayEvents(phone, saved.bodies.map(event));
  remote.setReject(true);
  await assert.rejects(syncAwayEventsWith(phone, remote.api), /rejected/);
  assert.equal(remote.server.length, 0);
  remote.setReject(false);
  assert.equal(await syncAwayEventsWith(phone, remote.api), 0, "Retried and confirmed once accepted.");
  // The laptop opens Thursday's Preparation and fixes the day.
  await syncAwayEventsWith(laptop, remote.api);
  await saveAwayEvents(laptop, [event({ type: "carry-surfaced", date: tuesday, carryId: saved.carryId, day: thursday })]);
  await syncAwayEventsWith(laptop, remote.api);
  await syncAwayEventsWith(phone, remote.api);
  const onPhone = foldCarries(await readAwayEvents(phone));
  const onLaptop = foldCarries(await readAwayEvents(laptop));
  assert.deepEqual(onPhone, onLaptop);
  assert.equal(resolvedDate(onPhone[saved.carryId]), thursday);
});

test("a change from a newer app version is kept, skipped for display, and does not stop sync", async () => {
  const owner = crypto.randomUUID();
  const remote = transport();
  const future = { id: crypto.randomUUID(), createdAt: 5, body: { type: "future-kind", date: tuesday, extra: true } } as unknown as AwayEvent;
  const known = event({ type: "day", date: wednesday, away: true });
  remote.server.push(future, known);
  await syncAwayEventsWith(owner, remote.api);
  assert.deepEqual((await readAwayEvents(owner)).map(item => item.id), [known.id]);
  assert.equal(foldAwayEvents(await readAwayEvents(owner))[wednesday]?.away, true);
  const { openDB } = await import("idb");
  const stored = await (await openDB("still-signal-away-days-v1", 1)).getAll("events");
  assert.ok(stored.some(row => row.id === future.id && row.pending === 0), "The unknown change is preserved on the device.");
  await assert.rejects(saveAwayEvents(owner, [future]), "A local change must be valid.");
});

test("the Journal reference shows that date’s saved boundary, and none for older entries", () => {
  const session = { ...reviewFixtures().session, timezone: "UTC", blueprint: undefined };
  const date = new Date(session.startedAt).toISOString().slice(0, 10);
  const day = createRecord("day", { ...emptyTradingDay(date, "UTC"), goal: "Wait for my setup", boundary: "Stop after two losses" });
  assert.equal(readingRoomReference([day], session).boundary, "Stop after two losses");
  const older = createRecord("day", { ...emptyTradingDay(date, "UTC"), goal: "Wait for my setup" });
  assert.equal(readingRoomReference([older], session).boundary, undefined);
  const other = createRecord("day", { ...emptyTradingDay("2026-01-02", "UTC"), boundary: "Another morning" });
  assert.equal(readingRoomReference([older, other], session).boundary, undefined, "Another day’s boundary is never borrowed.");
});

async function library(today: string) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const realNow = Date.now;
  Date.now = () => new Date(`${today}T09:00:00`).getTime();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const owner = crypto.randomUUID();
  let events: AwayEvent[] = [];
  let saves = 0;
  const store: ProcessStore = {
    records: [], loaded: true, busy: false, error: "", syncState: "local", setError() {}, refresh: async () => {},
    save: async records => { await saveProcess(owner, records); store.records = await readProcess(owner); return true; },
  };
  const away = new Set<string>();
  const carry = (): CarrySupport => ({
    ready: true, events, carries: foldCarries(events), isAway: date => away.has(date),
    save: async bodies => { saves++; await new Promise(resolve => setTimeout(resolve, 5)); events = [...events, ...bodies.map(event)]; return true; },
    onOpenAway() {}, onOpenReflection() {},
  });
  async function render(page: "Stillness" | "Preparation" | "Done" = "Stillness") {
    await act(async () => root.render(createElement(StillnessLibrary, {
      owner, page, store, carry: carry(), onPage() {}, onOpenDay() {}, onReflect: async () => {},
    })));
  }
  const dialog = () => document.querySelector("dialog[open]")!;
  const button = (label: string | RegExp, scope: ParentNode = document) => {
    const found = [...scope.querySelectorAll("button")].find(item => typeof label === "string" ? item.textContent?.trim() === label : label.test(item.textContent ?? ""));
    assert.ok(found, `button: ${label}`);
    return found;
  };
  // Saves are asynchronous. Wait for what the screen should show, never a fixed delay, so slow build machines pass too.
  async function until(check: () => boolean, message: string) {
    // Each short act lets React apply what finished meanwhile before the screen is checked again.
    const deadline = performance.now() + 10000;
    while (!check()) {
      if (performance.now() > deadline) throw new Error(`Timed out: ${message}`);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    await render();
  }
  const noticeText = () => document.querySelector(".ss-support-notice")?.textContent ?? "";
  const click = async (label: string | RegExp, scope?: ParentNode, done?: () => boolean) => {
    await act(async () => button(label, scope).click());
    await (done ? until(done, `after ${label}`) : render());
  };
  const labelled = (text: string) => [...dialog().querySelectorAll("label")].find(item => item.textContent?.includes(text))!.querySelector("input")!;
  const tick = async (text: string) => { await act(async () => labelled(text).click()); };
  async function note(value: string) {
    const area = dialog().querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(area, value);
      area.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  async function submit(times = 1) {
    await act(async () => {
      const form = dialog().querySelector("form")!;
      for (let i = 0; i < times; i++) form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    // A successful save closes the dialog.
    await until(() => !document.querySelector("dialog[open]"), "the save to finish");
  }
  async function openItem(name: string) {
    const card = [...document.querySelectorAll<HTMLButtonElement>(".ss-support-card")].find(item => item.textContent?.includes(name))!;
    await act(async () => card.click());
    await click("Add to my day", dialog());
  }
  await render();
  return {
    render, click, tick, note, submit, openItem, dialog, store, away, owner, noticeText,
    events: () => events, saves: () => saves,
    close: async () => { Date.now = realNow; await act(async () => root.unmount()); dom.window.close(); },
  };
}

test("Today with both stages keeps the earlier placement on Undo, and keeps the note with the account", async () => {
  const ui = await library(tuesday);
  try {
    // The piece is already in today's Preparation.
    await ui.openItem("When the mind wants to fix a loss");
    await ui.submit();
    await ui.openItem("When the mind wants to fix a loss");
    await ui.tick("Done for the day");
    await ui.note("Notice the urge to win it back.");
    await ui.tick("Also save to my Stillness library");
    await ui.submit(2);
    const day = () => latest(ui.store.records, "day")[0].body.stillness ?? [];
    assert.deepEqual(day().map(choice => choice.destination), ["Preparation", "Done"], "A double submit adds one placement.");
    assert.match(document.body.textContent!, /Added to today’s Done for the day\. Already in today’s Preparation\. Your note is with it\. Saved to your Stillness library\./);
    await ui.render("Done");
    assert.match(document.querySelector(".ss-carry-note")!.textContent!, /Notice the urge to win it back\.Your note for today/);
    assert.ok(Object.values(foldCarries(ui.events())).some(carry => carry.note === "Notice the urge to win it back." && carry.target === tuesday),
      "The note is kept in the account's synced change log, not only on screen.");
    await ui.click("Undo", undefined, () => ui.noticeText().includes("Undone."));
    assert.deepEqual(day().map(choice => choice.destination), ["Preparation"], "Undo keeps the earlier Preparation placement.");
    await ui.render("Done");
    assert.equal(document.querySelector(".ss-carry-note"), null);
    await ui.render("Stillness");
    assert.ok([...document.querySelectorAll("button")].some(item => item.textContent?.trim() === "Saved support (0)"), "The bookmark is undone too.");
  } finally { await ui.close(); }
});

test("next trading day and a chosen date save as carries, never as a future trading day", async () => {
  const ui = await library(tuesday);
  try {
    await ui.openItem("When the mind wants to fix a loss");
    await ui.tick("My next trading day");
    assert.ok((ui.dialog().querySelector('input[type="checkbox"]') as HTMLInputElement).checked, "Preparation is the default.");
    await ui.note("Read before the open.");
    await ui.submit();
    assert.match(document.body.textContent!, /Saved for your next trading day’s Preparation\. It will be there when you open it on a day you trade\./);
    assert.equal(ui.store.records.length, 0, "No trading-day record is written.");
    // Choosing the same piece again shows the saved note instead of a blank field.
    await ui.openItem("When the mind wants to fix a loss");
    await ui.tick("My next trading day");
    assert.match(ui.dialog().querySelector(".ss-carry-existing")!.textContent!, /Read before the open\./);
    await ui.click("Edit this note", ui.dialog());
    await ui.note("Read slowly before the open.");
    await ui.submit();
    assert.equal(Object.values(foldCarries(ui.events())).filter(carry => !carry.removed).length, 1);
    assert.equal(Object.values(foldCarries(ui.events()))[0].note, "Read slowly before the open.");
    // A chosen date that is a day away offers that day's review.
    ui.away.add(thursday);
    await ui.openItem("When the mind wants to fix a loss");
    await ui.tick("Choose a date");
    await ui.click(/^19$/, ui.dialog());
    assert.match(ui.dialog().textContent!, /Thursday 19 November is marked as a day away\./);
    assert.ok([...ui.dialog().querySelectorAll("button")].some(item => item.textContent === "Add to this day away"));
    assert.ok([...ui.dialog().querySelectorAll("button")].some(item => item.textContent === "Open that day away"));
    await ui.submit();
    const carries = foldCarries(ui.events());
    assert.deepEqual(carriesFor(carries, thursday).map(carry => carry.choice), [{ itemId: "fix-a-loss" }]);
    // See, change and remove what is waiting.
    await ui.click(/^Planned ahead \(2\)$/);
    assert.match(ui.dialog().textContent!, /Your next trading day · Preparation/);
    assert.match(ui.dialog().textContent!, /Thursday 19 November · day away/);
    await ui.click("Remove", ui.dialog(), () => ui.noticeText().includes("Removed from"));
    await ui.render();
    assert.equal(pendingCarries(foldCarries(ui.events()), tuesday).length, 1);
  } finally { await ui.close(); }
});

test("carried support shows beside its note in Preparation on its day only", async () => {
  const ui = await library(thursday);
  try {
    const carryId = crypto.randomUUID();
    ui.events().push(...[
      event({ type: "carry", date: tuesday, carryId, target: "next", stages: ["Preparation"], choice: reminder, note: "From Tuesday" }),
      event({ type: "carry-surfaced", date: tuesday, carryId, day: thursday }),
    ]);
    await ui.render("Preparation");
    const row = document.querySelector(".ss-support-row[data-carried]")!;
    assert.match(row.textContent!, /From Tuesday/);
    assert.match(row.textContent!, /A note you left on Tuesday 17 November/);
    assert.ok([...row.querySelectorAll("button")].some(item => /^Begin /.test(item.textContent!)));
    await ui.render("Done");
    assert.equal(document.querySelector(".ss-support-row[data-carried]"), null, "A Preparation carry stays out of Done.");
    assert.equal(ui.store.records.length, 0, "Showing it writes nothing to the day.");
  } finally { await ui.close(); }
});
