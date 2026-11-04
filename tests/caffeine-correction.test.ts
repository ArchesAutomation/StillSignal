import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import QuickCaffeine from "../src/components/variable-builder/quick-caffeine";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";
import type { Context } from "../src/components/command-center/shared";

test("caffeine corrections preserve the original phase and trade association; range errors stay beside the entry", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const day = createRecord("day", { date: "2026-11-03", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  const variable = createRecord("variable", { name: "Caffeine", category: "Context", type: "number", unit: "mg", min: 0, max: 60, choices: [], frequency: "event", phases: ["pre-market", "during"], required: false, source: "manual", archived: false, analytics: true });
  const original = createRecord("observation", { dayId: day.rootId, definitionId: variable.id, phase: "during", sessionId: crypto.randomUUID(), tradeId: "position-1", observedAt: Date.now(), value: 30, missing: "recorded", source: "manual", provenance: "Coffee" });
  let saved: ProcessRecord[] = [];
  const context = { day, props: { onPage() {} }, store: { records: [day, variable, original], busy: false, async save(batch: ProcessRecord[]) { saved = batch; return true; } } } as unknown as Context;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(QuickCaffeine, context)));
    const button = (text: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
    const submit = async () => act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => button("Monster · example 473 ml").click());
    await submit();
    assert.equal(saved.length, 0);
    assert.match(document.querySelector('[role="status"]')!.textContent!, /at most 60 mg/);
    const other = createRecord("variable", { ...variable.body, name: "Caffeine - another tracker", max: 1 });
    context.store.records = [other, ...context.store.records];
    await act(async () => root.render(createElement(QuickCaffeine, context)));
    await act(async () => button("Correct amount / time").click());
    await submit();
    const result = saved[0];
    assert.equal(result.kind, "observation");
    if (result.kind === "observation") {
      assert.equal(result.rootId, original.rootId);
      assert.equal(result.body.phase, "during");
      assert.equal(result.body.sessionId, original.body.sessionId);
      assert.equal(result.body.tradeId, "position-1");
      assert.equal(result.body.definitionId, variable.id);
      assert.equal(result.body.observedAt, original.body.observedAt);
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
