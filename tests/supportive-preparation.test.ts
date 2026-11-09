import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activePreparationSteps } from "../src/lib/process/active-preparation";
import { starterProfile, suggestedSteps, supportFocus, supportQuestion, journalProfileSchema } from "../src/lib/process/journal-guide";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";
import { preparation, validateAppend, withRefs } from "../src/lib/process/engine";
import ArchivedTools from "../src/components/command-center/archived-tools";
import type { ProcessStore } from "../src/components/command-center/use-process";

test("each chosen focus produces an optional editable question without archived dependencies", () => {
  for (const focus of Object.keys(supportFocus) as (keyof typeof supportFocus)[]) {
    const profile = { ...starterProfile(), focus };
    assert.ok(journalProfileSchema.safeParse(profile).success);
    const steps = suggestedSteps(profile);
    assert.equal(steps.length, 4);
    assert.deepEqual(activePreparationSteps(steps), steps);
    const question = steps.find(s => s.activity === "intentions")!.prompts![0];
    assert.equal(question.label, supportFocus[focus].question);
    assert.equal(question.required, false);
    question.label = "My own words";
    assert.equal(supportQuestion(profile), supportFocus[focus].question);
  }
  const { focus, ...legacy } = starterProfile();
  assert.ok(journalProfileSchema.safeParse(legacy).success, "old profiles stay valid");
  assert.match(supportQuestion(legacy), /urge/);
});

test("active preparation excludes retired requirements without changing historical snapshots or their validation", () => {
  const day = createRecord("day", { date: "2026-11-01", timezone: "UTC", status: "preparing", instrument: "MNQ", account: "", timeframes: [], sessionIds: [], goal: "" });
  const boundary = { ...suggestedSteps(starterProfile())[1], requirement: "required" as const };
  const thesis = { ...boundary, id: crypto.randomUUID(), name: "Weekly outlook", activity: "thesis" as const, verification: "weekly-thesis" as const };
  const mission = { ...boundary, id: crypto.randomUUID(), name: "Mission", activity: "missions" as const };
  const template = createRecord("protocol", { name: "Legacy routine", description: "", instrument: "", strategy: "", session: "", steps: [thesis, boundary, mission] });
  const run = createRecord("run", { dayId: day.rootId, templateId: template.id, startedAt: Date.now() - 1000, steps: template.body.steps });
  const records: ProcessRecord[] = [day, template, run].map(withRefs);
  const before = JSON.stringify(records);
  assert.equal(preparation(records, day.rootId).total, 1);
  assert.equal(preparation(records, day.rootId).sections, 1);
  assert.equal(preparation(records, day.rootId, Infinity, true).total, 3);
  assert.equal(JSON.stringify(records), before);
  const nextRun = withRefs(createRecord("run", { ...run.body, steps: activePreparationSteps(run.body.steps) }));
  assert.throws(() => validateAppend(records, [nextRun], []), /preserve its template version/);
  assert.doesNotThrow(() => validateAppend(records.slice(0, 2), [withRefs(run)], []));
});

test("retired records and their preparation answers have a read-only archive", () => {
  const step = { ...suggestedSteps(starterProfile())[0], activity: "missions" as const, verification: "manual" as const };
  const run = createRecord("run", { dayId: crypto.randomUUID(), templateId: crypto.randomUUID(), steps: [step], startedAt: Date.now() });
  const response = createRecord("response", { runId: run.id, stepId: step.id, status: "skipped", method: "manual", reason: "" });
  const routine = createRecord("protocol", { name: "Retained routine", description: "", instrument: "", strategy: "", session: "", steps: [step] });
  const records = [routine, run, response];
  const html = renderToStaticMarkup(createElement(ArchivedTools, { store: { records } as ProcessStore, onBack() {} }));
  assert.match(html, /Archived tools/);
  assert.match(html, /skipped/);
  assert.match(html, /Retained routine/);
  assert.doesNotMatch(html, /<form\b|<input\b|<textarea\b|<button[^>]*>(?:Save|Delete)/);
});
