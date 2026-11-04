import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import QuickCaffeine from "../src/components/variable-builder/quick-caffeine";
import GuidedCheckin from "../src/components/variable-builder/guided-checkin";
import Variables, { ObservationForm } from "../src/components/variable-builder/workspace";
import { createRecord, type ProcessRecord, type BodyOf } from "../src/lib/process/model";
import { temperatureRecords } from "../src/lib/environment/temperature";
import { activeObservations } from "../src/lib/environment/values";
import VariablesPanel from "../src/components/command-center/variables-panel";
import type { Context } from "../src/components/command-center/shared";

const day = () => createRecord("day", { date: "2026-10-27", timezone: "America/Denver", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
const caffeine = (name: string) => createRecord("variable", { name, category: "Context", type: "number", unit: "mg", min: 0, max: 60, choices: [], frequency: "event", phases: ["pre-market", "during"], required: false, source: "manual", archived: false, analytics: true });
function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, FormData: dom.window.FormData, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const root = createRoot(document.getElementById("root")!);
  return { dom, root, async close() { await act(async () => root.unmount()); dom.window.close(); } };
}
function context(records: ProcessRecord[], tradingDay = day()) {
  const saved: ProcessRecord[][] = [];
  const value = { day: tradingDay, props: { onPage() {}, history: [], pulse: { owner: "batch2-test" } }, store: { records: [tradingDay, ...records], busy: false, setError() {}, async save(batch: ProcessRecord[]) { saved.push(batch); return true; } } } as unknown as Context;
  return { value, saved };
}

test("multiple caffeine trackers require an explicit selection before adding a drink", async () => {
  const ui = setup(), c = context([caffeine("Caffeine workdays"), caffeine("Caffeine weekends")]);
  try {
    await act(async () => ui.root.render(createElement(QuickCaffeine, c.value)));
    const pepsi = [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Pepsi"))!;
    await act(async () => pepsi.click());
    await act(async () => document.querySelector("form")!.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(c.saved.length, 0, "must not silently select the first definition");
    assert.match(document.body.textContent!, /Choose.*caffeine tracker/i);
    const trackers = c.value.store.records.filter(r => r.kind === "variable");
    const select = document.querySelector("select")!;
    await act(async () => { select.value = trackers[1].rootId; select.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true })); });
    await act(async () => document.querySelector("form")!.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    const saved = c.saved.flat().find(r => r.kind === "observation")!;
    assert.equal(saved.kind, "observation");
    if (saved.kind === "observation") {
      assert.equal(saved.body.definitionId, trackers[1].id);
      assert.equal(saved.body.value, 38);
      assert.equal(saved.body.phase, "pre-market");
    }
  } finally { await ui.close(); }
});

test("generic observation corrections preserve unavailable original associations and phase", async () => {
  const ui = setup(), definition = caffeine("Caffeine"), tradingDay = day();
  definition.body.phases = ["pre-market"];
  const original = createRecord("observation", { dayId: tradingDay.rootId, definitionId: definition.id, observedAt: Date.parse("2026-10-27T15:00:42.123Z"), phase: "during", sessionId: crypto.randomUUID(), tradeId: "original-execution", value: 30, missing: "recorded", source: "manual", provenance: "Original" });
  const c = context([definition, original], tradingDay);
  try {
    await act(async () => ui.root.render(createElement(ObservationForm, { context: c.value, definition, previous: original, onSaved() {} })));
    await act(async () => document.querySelector("form")!.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    const saved = c.saved.flat().find(r => r.kind === "observation")!;
    assert.equal(saved.kind, "observation");
    if (saved.kind === "observation") {
      assert.equal(saved.body.phase, original.body.phase);
      assert.equal(saved.body.sessionId, original.body.sessionId);
      assert.equal(saved.body.tradeId, original.body.tradeId);
      assert.equal(saved.body.observedAt, original.body.observedAt);
      assert.equal(saved.body.definitionId, definition.id);
    }
  } finally { await ui.close(); }
});

test("caffeine totals use current doses across mg trackers and exclude missing values", async () => {
  const ui = setup(), a = caffeine("Caffeine workdays"), b = caffeine("Caffeine other"), tradingDay = day();
  const body: BodyOf<"observation"> = { dayId: tradingDay.rootId, definitionId: a.id, observedAt: Date.parse("2026-10-27T15:00:00Z"), phase: "pre-market", value: 30, missing: "recorded", source: "manual", provenance: "Dose" };
  const original = createRecord("observation", body);
  const corrected = createRecord("observation", { ...body, value: 40 }, original);
  const second = createRecord("observation", { ...body, definitionId: b.id, value: 20 });
  const missing = createRecord("observation", { ...body, value: null, missing: "not-recorded" });
  const c = context([a, b, original, corrected, second, missing], tradingDay);
  try {
    await act(async () => ui.root.render(createElement(QuickCaffeine, c.value)));
    assert.match(document.body.textContent!, /2 entries · 60 mg recorded for 2026-10-27/);
  } finally { await ui.close(); }
});

test("a new historical check-in records the selected trading date in its timezone", async () => {
  const ui = setup(), c = context([]);
  try {
    await act(async () => ui.root.render(createElement(GuidedCheckin, { context: c.value, onClose() {} })));
    for (let i = 0; i < 5; i++) {
      const next = [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Continue check-in"))!;
      await act(async () => next.click());
    }
    const save = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Record check-in")!;
    await act(async () => save.click());
    const checkin = c.saved.flat().find(r => r.kind === "checkin")!;
    assert.equal(checkin.kind, "checkin");
    if (checkin.kind === "checkin")
      assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: c.value.day.body.timezone }).format(checkin.body.observedAt), c.value.day.body.date);
  } finally { await ui.close(); }
});

test("observation corrections for shared check-in answers open the source check-in", async () => {
  const ui = setup(), tradingDay = day();
  const body: BodyOf<"checkin"> = { dayId: tradingDay.rootId, observedAt: Date.parse("2026-10-27T15:00:00Z"), answers: [{ question: "Focus", value: 4 }], physical: "", circumstances: "", reflection: "", phase: "pre-market" };
  const records = temperatureRecords([tradingDay], body);
  const c = context(records, tradingDay);
  try {
    await act(async () => ui.root.render(createElement(Variables, c.value)));
    const history = [...document.querySelectorAll(".cc-panel")].find(p => p.querySelector("h2")?.textContent === "Observation history")!;
    const correct = [...history.querySelectorAll("button")].find(b => b.textContent?.trim() === "Correct check-in");
    assert.ok(correct, "derived observations must correct their shared source");
    await act(async () => correct.click());
    assert.ok(document.querySelector(".guide-checkin"));
    assert.equal(document.querySelector('input[name="value"]'), null);
    const rating = document.querySelector<HTMLButtonElement>('[aria-label="Focus: 9 of 10"]')!;
    await act(async () => rating.click());
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Continue check-in"))!.click());
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Save check-in correction")!.click());
    c.value.store.records.push(...c.saved.flat());
    const active = activeObservations(c.value.store.records);
    assert.equal(active.length, 1);
    assert.equal(active[0].body.value, 9);
    assert.equal(records.find(r => r.kind === "checkin")!.body.answers[0].value, 4, "original answer remains unchanged");
    await act(async () => ui.root.render(createElement(VariablesPanel, c.value)));
    assert.match(document.body.textContent!, /9 1–10/);
  } finally { await ui.close(); }
});

test("the range link opens the selected definition and the builder only shows relevant choices", async () => {
  const ui = setup(), definition = caffeine("Caffeine personal"), c = context([definition]);
  try {
    await act(async () => ui.root.render(createElement(QuickCaffeine, c.value)));
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Inspect / edit"))!.click());
    await act(async () => ui.root.render(createElement(Variables, c.value)));
    assert.equal(document.querySelector<HTMLInputElement>('[name="max"]')!.value, "60");
    assert.equal(document.querySelector('[name="choices"]'), null, "numeric tracker has no choice administration");
    const type = document.querySelector<HTMLSelectElement>('[name="type"]')!;
    await act(async () => { type.value = "single-select"; type.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true })); });
    assert.ok(document.querySelector('[name="choices"]'));
    assert.equal(document.querySelector('[name="max"]'), null);
    assert.equal(definition.body.max, 60, "editing form does not alter the saved definition");
    assert.match(document.body.textContent!, /does not connect a device/);
  } finally { await ui.close(); }
});

test("historical check-in corrections retain exact repeated-hour instants", async () => {
  const ui = setup(), tradingDay = day();
  tradingDay.body.date = "2026-11-01";
  tradingDay.body.timezone = "America/New_York";
  const original = createRecord("checkin", { dayId: tradingDay.rootId, observedAt: Date.parse("2026-11-01T06:30:42.123Z"), answers: [], physical: "", circumstances: "", reflection: "", phase: "pre-market" });
  const c = context([original], tradingDay);
  try {
    await act(async () => ui.root.render(createElement(GuidedCheckin, { context: c.value, previous: original, onClose() {} })));
    assert.equal(document.querySelector<HTMLInputElement>('input[type="datetime-local"]')!.value, "2026-11-01T01:30");
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Save check-in correction")!.click());
    const corrected = c.saved.flat().find(r => r.kind === "checkin")!;
    if (corrected.kind === "checkin") assert.equal(corrected.body.observedAt, original.body.observedAt);
  } finally { await ui.close(); }
});
