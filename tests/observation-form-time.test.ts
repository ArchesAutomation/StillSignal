import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { ObservationForm } from "../src/components/variable-builder/workspace";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";
import type { Context } from "../src/components/command-center/shared";

test("correcting a timestamp observation preserves both original instants in a repeated DST hour", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, FormData: dom.window.FormData, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const day = createRecord("day", { date: "2026-11-01", timezone: "America/New_York", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  const definition = createRecord("variable", { name: "Start time", category: "Context", type: "timestamp", unit: "", choices: [], frequency: "event", phases: ["pre-market"], required: false, source: "manual", archived: false, analytics: true });
  const original = createRecord("observation", { dayId: day.rootId, definitionId: definition.id, phase: "pre-market", observedAt: Date.parse("2026-11-01T06:30:42.123Z"), value: Date.parse("2026-11-01T05:45:20.456Z"), missing: "recorded", source: "manual", provenance: "Original" });
  let saved: ProcessRecord[] = [];
  const context = { day, props: { history: [] }, store: { records: [day, definition, original], busy: false, setError(message: string) { throw Error(message); }, async save(batch: ProcessRecord[]) { saved = batch; return true; } } } as unknown as Context;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(ObservationForm, { context, definition, previous: original, onSaved() {} })));
    assert.equal(document.querySelector<HTMLInputElement>('[name="observedAt"]')!.value, "2026-11-01T01:30");
    assert.equal(document.querySelector<HTMLInputElement>('[name="value"]')!.value, "2026-11-01T01:45");
    await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(saved[0].kind, "observation");
    if (saved[0].kind === "observation") {
      assert.equal(saved[0].body.observedAt, original.body.observedAt);
      assert.equal(saved[0].body.value, original.body.value);
    }
    await act(async () => root.render(null));
    await act(async () => root.render(createElement(ObservationForm, { context, definition, onSaved() {} })));
    assert.ok(document.querySelector<HTMLInputElement>('[name="observedAt"]')!.value.startsWith("2026-11-01T"));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
