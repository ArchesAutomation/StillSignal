import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import PersistentForm from "../src/components/persistent-form";
import Missions from "../src/components/process-goals/workspace";
import { createRecord } from "../src/lib/process/model";
import type { Context } from "../src/components/command-center/shared";
import TradeQuality from "../src/components/trade-quality/workspace";
import GuidedCheckin from "../src/components/variable-builder/guided-checkin";

test("draft recovery retains unchecked boxes and all selected choices after leaving a form", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, FormData: dom.window.FormData, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  const form = () => h(PersistentForm, { draftKey: "recovery-test" },
    h("input", { type: "checkbox", name: "enabled", value: "yes", defaultChecked: true }),
    h("select", { multiple: true, name: "choices", defaultValue: ["a"] },
      ...["a", "b", "c"].map(v => h("option", { key: v, value: v }, v))));
  try {
    await act(async () => root.render(form()));
    const checkbox = document.querySelector("input")!;
    const select = document.querySelector("select")!;
    checkbox.checked = false;
    for (const option of select.options) option.selected = option.value !== "a";
    await act(async () => select.dispatchEvent(new dom.window.Event("input", { bubbles: true })));
    await act(async () => root.render(null));
    await act(async () => root.render(form()));
    assert.equal(document.querySelector("input")!.checked, false);
    assert.deepEqual([...document.querySelector("select")!.selectedOptions].map(o => o.value), ["b", "c"]);
    const restored = document.querySelector("select")!;
    for (const option of restored.options) option.selected = false;
    await act(async () => restored.dispatchEvent(new dom.window.Event("input", { bubbles: true })));
    await act(async () => root.render(null));
    await act(async () => root.render(form()));
    assert.equal(document.querySelector("select")!.selectedOptions.length, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("Missions opens a usable builder rather than navigating back to itself; its draft survives leaving", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, FormData: dom.window.FormData, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const day = createRecord("day", { date: "2026-11-03", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  let navigations = 0;
  const context = { day, props: { page: "Missions", onPage() { navigations++; } }, store: { records: [day], busy: false } } as unknown as Context;
  const root = createRoot(document.getElementById("root")!);
  const open = async () => act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Create mission")!.click());
  try {
    await act(async () => root.render(h(Missions, context)));
    await open();
    assert.equal(navigations, 0);
    const input = document.querySelector<HTMLInputElement>('[name="name"]')!;
    assert.ok(input);
    input.value = "Keep my mission draft";
    await act(async () => input.dispatchEvent(new dom.window.Event("input", { bubbles: true })));
    await act(async () => root.render(null));
    await act(async () => root.render(h(Missions, context)));
    await open();
    assert.equal(document.querySelector<HTMLInputElement>('[name="name"]')!.value, "Keep my mission draft");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("an unfinished playbook rule is restored before it is ready for final validation", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, FormData: dom.window.FormData, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const day = createRecord("day", { date: "2026-11-03", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  const body = { name: "My unfinished playbook", instrument: "ES", entries: "", confirmations: "", sizing: "", risk: "", exits: "", invalid: "", behavioral: "", rules: [{ id: crypto.randomUUID(), name: "My unfinished time window", description: "Keep this criterion", weight: 0, verification: "time-window", startMinute: 540 }] };
  localStorage.setItem("ss-playbook-editor:local", JSON.stringify({ body }));
  const book = createRecord("playbook", { ...body, rules: [{ ...body.rules[0], weight: 1, verification: "manual" }] } as never);
  const context = { day, props: { history: [], onPage() {} }, store: { records: [day, book], busy: false } } as unknown as Context;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(h(TradeQuality, context)));
    assert.equal(document.querySelector<HTMLInputElement>('[name="name"]')?.value, "My unfinished playbook");
    assert.ok([...document.querySelectorAll("input")].some(input => input.value === "My unfinished time window"));
    assert.ok([...document.querySelectorAll("input")].some(input => input.value === "Keep this criterion"));
    assert.equal(document.querySelector<HTMLInputElement>('input[type="number"]')?.value, "0");
    assert.equal(document.querySelectorAll('input[type="time"]').length, 2);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("the check-in editor brings its heading into view after its draft has loaded", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const scrolled: Element[] = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this); };
  const day = createRecord("day", { date: "2026-11-03", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  const context = { day, props: { history: [] }, store: { records: [day], busy: false } } as unknown as Context;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(h(GuidedCheckin, { context, onClose() {} })));
    const heading = document.querySelector("h3");
    assert.ok(heading);
    assert.equal(document.activeElement, heading);
    assert.ok(scrolled.includes(heading));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
