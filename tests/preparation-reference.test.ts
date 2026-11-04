import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PreparationSummary from "../src/components/pre-market/preparation-summary";
import { createRecord } from "../src/lib/process/model";
import type { Context } from "../src/components/command-center/shared";
import { JSDOM } from "jsdom";

test("restarting a routine keeps historical runs out of the current reference", () => {
  const day = createRecord("day", { date: "2026-11-03", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  const prompt = { id: crypto.randomUUID(), label: "My perspective", type: "text" as const, required: false, choices: [] };
  const step = { id: crypto.randomUUID(), name: "Reflect", description: "", category: "Preparation", requirement: "optional" as const, condition: "", verification: "manual" as const, window: "", order: 0, prompts: [prompt] };
  const template = createRecord("protocol", { name: "My routine", description: "", instrument: "ES", strategy: "", session: "", steps: [step] });
  const old = createRecord("run", { dayId: day.rootId, templateId: template.id, steps: [step], startedAt: 1 });
  const current = createRecord("run", old.body, undefined, [], old.createdAt + 1);
  const response = (runId: string, value: string) => createRecord("response", { runId, stepId: step.id, status: "complete", method: "manual", reason: "", answers: [{ id: prompt.id, value }] });
  const context = { day, props: {}, store: { records: [day, template, old, current, response(old.id, "Obsolete answer"), response(current.id, "Current answer")] } } as unknown as Context;
  const html = renderToStaticMarkup(createElement(PreparationSummary, context));
  assert.ok(html.includes("Current answer"));
  const dom = new JSDOM(html);
  const reference = [...dom.window.document.querySelectorAll(".guide-summary-item")].map(e => e.textContent).join(" ");
  assert.ok(!reference.includes("Obsolete answer"));
  dom.window.close();
  assert.equal((html.match(/Edit my perspective/g) ?? []).length, 1);
});
