import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import ThesisWorkspace, {
  emptyThesis,
} from "../src/components/trading-thesis/workspace";
import {
  createRecord,
  type ProcessRecord,
  type RecordOf,
} from "../src/lib/process/model";
import type { Context } from "../src/components/command-center/shared";
import { verificationEvidence } from "../src/lib/process/engine";

test("preparation uses the current plan version and respects archived plans", () => {
  const day = createRecord("day", { date: "2026-11-02", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  const step = { id: crypto.randomUUID(), name: "Weekly plan", description: "", category: "Preparation", requirement: "required" as const, condition: "", verification: "weekly-thesis" as const, window: "", order: 0 };
  const protocol = createRecord("protocol", { name: "Routine", description: "", instrument: "ES", strategy: "", session: "", steps: [step] });
  const run = createRecord("run", { dayId: day.rootId, templateId: protocol.id, steps: [step], startedAt: Date.now() });
  const thesis = createRecord("thesis", { ...emptyThesis(day, "weekly"), primary: "Plan" }, undefined, [], run.createdAt + 1);
  const archived = { ...createRecord("thesis", thesis.body, thesis, [], thesis.createdAt + 1), archived: true };
  const records = [day, protocol, run, thesis, archived];
  assert.equal(verificationEvidence(records, run, step.id, thesis.createdAt)?.id, thesis.id);
  assert.equal(verificationEvidence(records, run, step.id, archived.createdAt), undefined);
});
test("custom thesis fields preserve hidden saved analysis when revising visible fields", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const day = createRecord("day", {
    date: "2026-11-02",
    timezone: "UTC",
    status: "preparing",
    instrument: "ES",
    account: "",
    timeframes: [],
    sessionIds: [],
    goal: "",
  });
  const thesis = createRecord("thesis", {
    ...emptyThesis(day, "weekly"),
    primary: "Original scenario",
    events: "Keep my economic calendar analysis",
    targets: "Keep my target notes",
  });
  let saved: ProcessRecord[] = [];
  const context = {
    day,
    props: { onPage() {} },
    store: {
      records: [day, thesis],
      busy: false,
      setError() {},
      async save(batch: ProcessRecord[]) {
        saved = batch;
        return true;
      },
    },
  } as unknown as Context;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () =>
      root.render(
        createElement(ThesisWorkspace, {
          ...context,
          initialScope: "weekly",
          visibleFields: ["primary"],
        }),
      ),
    );
    const button = (label: string) => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === label,
      );
      assert.ok(b, label);
      return b;
    };
    await act(async () => button("Revise thesis").click());
    assert.equal(document.querySelector('[name="events"]'), null);
    (document.querySelector('[name="primary"]') as HTMLTextAreaElement).value =
      "Updated visible scenario";
    (document.querySelector('[name="reason"]') as HTMLTextAreaElement).value =
      "Refined my scenario";
    await act(async () =>
      button("Save thesis revision").form!.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    const result = saved[0] as RecordOf<"thesis">;
    assert.equal(result.body.primary, "Updated visible scenario");
    assert.equal(result.body.events, thesis.body.events);
    assert.equal(result.body.targets, thesis.body.targets);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
