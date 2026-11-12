import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import TradeQuality from "../src/components/trade-quality/workspace";

import PersistentForm from "../src/components/persistent-form";
import type { Context } from "../src/components/process/shared";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";

function setup() {
  const dom = new JSDOM('<button id="opener">Open editor</button><div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, FormData: dom.window.FormData, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  dom.window.scrollTo = () => {};
  const root = createRoot(document.getElementById("root")!);
  return { dom, root, async close() { await act(async () => root.unmount()); dom.window.close(); } };
}
const day = () => createRecord("day", { date: "2026-11-04", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
const book = () => createRecord("playbook", { name: "My saved playbook", instrument: "ES", entries: "Saved entry", confirmations: "", sizing: "", risk: "", exits: "", invalid: "", behavioral: "", rules: [{ id: crypto.randomUUID(), name: "Saved rule", description: "Saved criterion", weight: 1, verification: "manual" }] });
function context(records: ProcessRecord[]) {
  return { day: day(), props: { history: [], onPage() {} }, store: { records, busy: false, error: "", setError() {}, async save() { return false; } } } as unknown as Context;
}
const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name);
  assert.ok(found, name);
  return found;
};

test("closing and reopening a playbook revision retains its edited rules", async () => {
  const ui = setup(), saved = book(), c = context([saved]);
  localStorage.setItem("ss-playbook-editor:local", JSON.stringify({ body: { ...saved.body, rules: [{ ...saved.body.rules[0], description: "Unsaved criterion" }] }, previousId: saved.id }));
  try {
    await act(async () => ui.root.render(h(TradeQuality, c)));
    assert.ok([...document.querySelectorAll("input")].some(i => i.value === "Unsaved criterion"));
    await act(async () => button("Cancel").click());
    await act(async () => button("Edit next version").click());
    assert.ok([...document.querySelectorAll("input")].some(i => i.value === "Unsaved criterion"), "rule edits must survive closing and reopening");
  } finally { await ui.close(); }
});

test("inert and collapsed supporting forms cannot steal focus", async () => {
  const ui = setup(), opener = document.getElementById("opener")!;
  try {
    for (const wrapper of ["inert", "details"] as const) {
      opener.focus();
      const child = h(PersistentForm, { draftKey: wrapper }, h("input", { name: "answer" }));
      await act(async () => ui.root.render(wrapper === "inert" ? h("div", { inert: true }, child) : h("details", null, h("summary", null, "Supporting tool"), child)));
      assert.ok(document.activeElement === opener, `${wrapper} form must not move focus`);
      await act(async () => ui.root.render(null));
    }
  } finally { await ui.close(); }
});

test("closing an expanded form returns focus and scroll to its opener", async () => {
  const ui = setup(), opener = document.getElementById("opener")!;
  const scrolls: unknown[] = [];
  ui.dom.window.scrollTo = ((value: unknown) => { scrolls.push(value); }) as typeof window.scrollTo;
  try {
    opener.focus();
    await act(async () => ui.root.render(h(PersistentForm, { draftKey: "focus-return" }, h("input", { name: "answer" }))));
    assert.equal(document.activeElement?.tagName, "INPUT");
    await act(async () => ui.root.render(null));
    assert.ok(document.activeElement === opener);
    assert.deepEqual(scrolls, [{ left: 0, top: 0 }]);
  } finally { await ui.close(); }
});

test("saving errors retain a playbook draft and concurrent submission is ignored", async () => {
  const ui = setup(), saved = book(), c = context([saved]);
  localStorage.setItem("ss-playbook-editor:local", JSON.stringify({ body: saved.body, previousId: saved.id }));
  let attempts = 0, finish: ((value: boolean) => void) | undefined;
  c.store.save = async () => { attempts++; return new Promise<boolean>(resolve => { finish = resolve; }); };
  try {
    await act(async () => ui.root.render(h(TradeQuality, c)));
    const form = button("Save playbook version").form!;
    await act(async () => {
      form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(attempts, 1);
    await act(async () => finish!(false));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Could not save/);
    assert.equal(document.querySelector<HTMLInputElement>('[name="name"]')!.value, saved.body.name);
    assert.ok(localStorage.getItem(`ss-playbook-editor:local:${saved.id}:editor`));
  } finally { await ui.close(); }
});

test("a failed playbook archive has explicit feedback and preserves the record", async () => {
  const ui = setup(), saved = book(), c = context([saved]);
  try {
    await act(async () => ui.root.render(h(TradeQuality, c)));
    await act(async () => button("Archive").click());
    assert.match(document.body.textContent!, /Could not archive/i);
    assert.equal(saved.archived, false);
  } finally { await ui.close(); }
});

test("a missing draft source is reported instead of silently creating a new playbook", async () => {
  const ui = setup(), saved = book(), c = context([saved]);
  const raw = JSON.stringify({ body: saved.body, previousId: crypto.randomUUID() });
  localStorage.setItem("ss-playbook-editor:local", raw);
  try {
    await act(async () => ui.root.render(h(TradeQuality, c)));
    assert.match(document.body.textContent!, /original playbook version is not loaded/);
    assert.equal(document.querySelector('[name="name"]'), null);
    assert.equal(localStorage.getItem("ss-playbook-editor:local"), raw);
  } finally { await ui.close(); }
});



test("switching accounts cannot copy an open playbook draft into the next account", async () => {
  const ui = setup(), saved = book(), c = context([saved]);
  c.props.pulse = { owner: "draft-alice" } as Context["props"]["pulse"];
  localStorage.setItem("ss-playbook-editor:draft-alice", JSON.stringify({ body: { ...saved.body, name: "Alice private draft" }, previousId: saved.id }));
  try {
    await act(async () => ui.root.render(h(TradeQuality, c)));
    assert.equal(document.querySelector<HTMLInputElement>('[name="name"]')!.value, "Alice private draft");
    const next = { ...c, props: { ...c.props, pulse: { ...c.props.pulse, owner: "draft-bob" } }, store: { ...c.store, records: [book()] } };
    await act(async () => ui.root.render(h(TradeQuality, next)));
    assert.equal(document.querySelector('[name="name"]'), null);
    assert.equal(localStorage.getItem("ss-playbook-editor:draft-bob"), null);
  } finally { await ui.close(); }
});

test("unavailable draft storage still allows opening a playbook editor", async () => {
  const ui = setup(), saved = book(), c = context([saved]);
  const getItem = ui.dom.window.Storage.prototype.getItem;
  ui.dom.window.Storage.prototype.getItem = () => { throw Error("Draft storage denied"); };
  try {
    await act(async () => ui.root.render(h(TradeQuality, c)));
    await act(async () => button("New playbook").click());
    assert.ok(document.querySelector('[name="name"]'));
  } finally {
    ui.dom.window.Storage.prototype.getItem = getItem;
    await ui.close();
  }
});
