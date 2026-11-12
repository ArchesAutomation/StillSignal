import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { mergeCsvEvents } from "../src/lib/csv-session";
import { temperatureRecords } from "../src/lib/environment/temperature";
import {
  activeObservations,
  validateValue,
} from "../src/lib/environment/values";
import { evidenceReadingLayout, moduleBoard } from "../src/lib/module-board";
import { emptyModuleLayout } from "../src/lib/module-layout";
import { keepRoutineAudio, privateFile } from "../src/lib/private-files";
import { validateAppend, withRefs } from "../src/lib/process/engine";
import {
  habitPrompt,
  moduleRecommendation,
  starterProfile,
  suggestedSteps,
} from "../src/lib/process/journal-guide";
import {
  createRecord,
  latest,
  recordSchema,
  type BodyOf,
  type ProcessRecord,
} from "../src/lib/process/model";
import { unansweredReflections } from "../src/lib/process/preparation-workflow";
import { goalProgress } from "../src/lib/process/reviews";
import {
  completedIdeas,
  completedOn,
  reviewInvitationKey,
  tradeRuleStatuses,
} from "../src/lib/process/session-review";
import { reviewFixtures } from "../src/lib/staging-fixtures";
const day = () =>
  createRecord("day", {
    date: "2026-10-13",
    timezone: "UTC",
    status: "preparing",
    instrument: "AAPL",
    account: "",
    timeframes: [],
    sessionIds: [],
    goal: "",
  });

test("guided presets distinguish position and scalp context without scoring or changing approved prompts", () => {
  const scalp = {
    ...starterProfile(),
    holding: "scalp" as const,
    habit: "forget-plan" as const,
  };
  const position = {
    ...starterProfile(),
    holding: "position" as const,
    habit: "results" as const,
  };
  assert.ok(moduleRecommendation(scalp).every(m => !["thesis", "missions"].includes(m.id)));
  assert.ok(suggestedSteps(position).every(s => s.activity !== "thesis" && s.activity !== "missions"));
  assert.match(habitPrompt(position.habit), /regardless of the result/);
  const protocol = createRecord("protocol", {
    name: "My journal",
    description: "",
    instrument: "AAPL",
    strategy: "",
    session: "",
    profile: scalp,
    steps: suggestedSteps(scalp),
  });
  assert.equal(recordSchema.safeParse(protocol).success, true);
  assert.ok(
    protocol.body.steps.every(
      (s) => s.checklistMode === "reminder" && s.allowReflectionSkip,
    ),
  );
  const changed = createRecord(
    "protocol",
    { ...protocol.body, profile: position },
    protocol,
  );
  assert.deepEqual(
    changed.body.steps,
    protocol.body.steps,
    "profile edits do not regenerate approved daily questions",
  );
});

test("skipped reflections remain omissions; invalid numbers and absent activity evidence are still rejected", () => {
  const d = day(),
    step = suggestedSteps(starterProfile()).at(-1)!;
  step.prompts = [
    {
      id: crypto.randomUUID(),
      label: "Risk amount",
      type: "number",
      required: true,
      choices: [],
    },
  ];
  const template = withRefs(
    createRecord("protocol", {
      name: "Guide",
      description: "",
      instrument: "",
      strategy: "",
      session: "",
      steps: [step],
    }),
  );
  const run = withRefs(
    createRecord("run", {
      dayId: d.id,
      templateId: template.id,
      steps: [step],
      startedAt: Date.now(),
    }),
  );
  const base: ProcessRecord[] = [d, template, run];
  const skipped = withRefs(
    createRecord("response", {
      runId: run.id,
      stepId: step.id,
      status: "complete",
      method: "manual",
      reason: "Skipped after the one reminder",
      answers: [{ id: step.prompts[0].id, value: "" }],
      skippedPromptIds: [step.prompts[0].id],
      completedAt: Date.now(),
    }),
  );
  assert.doesNotThrow(() => validateAppend(base, [skipped], []));
  assert.equal(unansweredReflections([...base, skipped], run).length, 1);
  const invalid = withRefs(
    createRecord(
      "response",
      {
        ...skipped.body,
        answers: [{ id: step.prompts[0].id, value: "abc" }],
        skippedPromptIds: [],
      },
      skipped,
    ),
  );
  assert.throws(
    () => validateAppend([...base, skipped], [invalid], []),
    /number/,
  );
  const skipSection = withRefs(
    createRecord("response", {
      runId: run.id,
      stepId: step.id,
      status: "skipped",
      method: "manual",
      reason: "",
    }),
  );
  assert.doesNotThrow(
    () => validateAppend(base, [skipSection], []),
    "skipping never requires an explanation",
  );
});

test("correcting a check-in updates shared observations without duplicates and removes superseded questions", () => {
  const d = day();
  let rows: ProcessRecord[] = [d];
  const body: BodyOf<"checkin"> = {
    dayId: d.id,
    observedAt: Date.now() - 1000,
    phase: "pre-market",
    answers: [
      { question: "Focus", value: 4 },
      { question: "Energy", value: null },
    ],
    physical: "",
    circumstances: "",
    reflection: "",
  };
  const first = temperatureRecords(rows, body).map(withRefs);
  validateAppend(rows, first, []);
  rows.push(...first);
  const previous = latest(rows, "checkin")[0];
  const corrected = temperatureRecords(
    rows,
    { ...body, answers: [{ question: "Focus", value: 7 }] },
    previous,
  ).map(withRefs);
  validateAppend(rows, corrected, []);
  rows.push(...corrected);
  assert.equal(latest(rows, "checkin").length, 1);
  const active = activeObservations(rows);
  assert.equal(active.length, 1);
  assert.equal(active[0].body.value, 7);
  assert.equal(active[0].body.phase, "pre-market");
  assert.equal(
    rows.filter((r) => r.kind === "checkin").length,
    2,
    "the original self-report stays in history",
  );
});

test("caffeine bounds explain the exact pinned unit and range; revising a definition preserves older observations", () => {
  const d = day(),
    definition = createRecord("variable", {
      name: "Caffeine",
      category: "Context",
      type: "number",
      unit: "mg",
      min: 0,
      max: 60,
      choices: [],
      frequency: "event",
      phases: ["pre-market"],
      required: false,
      source: "manual",
      archived: false,
      analytics: true,
    });
  const body: BodyOf<"observation"> = {
    dayId: d.id,
    definitionId: definition.id,
    observedAt: Date.now(),
    phase: "pre-market",
    value: 150,
    missing: "recorded",
    source: "manual",
    provenance: "User-entered drink amount",
  };
  assert.throws(() => validateValue(definition, body), /at most 60 mg/);
  const revised = createRecord(
    "variable",
    { ...definition.body, max: 300 },
    definition,
  );
  assert.doesNotThrow(() =>
    validateValue(revised, { ...body, definitionId: revised.id }),
  );
  assert.equal(definition.body.max, 60);
});

test("partial exits never invite review; a complete closure has a stable key across reimports and timezone dates", () => {
  const session = reviewFixtures().session;
  const original = completedIdeas([session]);
  assert.ok(original.length >= 2);
  const again = mergeCsvEvents(session, session.events);
  assert.deepEqual(
    completedIdeas([again, again]).map(reviewInvitationKey),
    original.map(reviewInvitationKey),
  );
  const entry = {
    ...session.events[0],
    kind: "entry" as const,
    quantity: 2,
    side: "long" as const,
    positionKnown: true,
  };
  const exit = {
    ...entry,
    id: "partial",
    kind: "exit" as const,
    quantity: 1,
    t: entry.t + 1000,
  };
  assert.equal(
    completedIdeas([{ ...session, events: [entry, exit] }]).length,
    0,
  );
  const closed = { ...exit, id: "final", t: entry.t + 2000 };
  assert.equal(
    completedIdeas([{ ...session, events: [entry, exit, closed] }]).length,
    1,
  );
  assert.equal(
    completedOn([session], "2026-10-13", "America/Denver").length,
    original.length,
  );
});

test("a broken trade remains visible beside a followed trade, and corrections update mission progress", () => {
  const session = reviewFixtures().session,
    ideas = completedIdeas([session]),
    d = day();
  const rule = {
    id: crypto.randomUUID(),
    name: "My entry rule",
    description: "I checked my entry conditions",
    weight: 1,
    verification: "manual" as const,
  };
  const book = createRecord("playbook", {
    name: "My rules",
    instrument: "AAPL",
    entries: "",
    confirmations: "",
    sizing: "",
    risk: "",
    exits: "",
    invalid: "",
    behavioral: "",
    rules: [rule],
  });
  let rows: ProcessRecord[] = [d, book];
  for (const [i, idea] of ideas.slice(0, 2).entries()) {
    const a = withRefs(
      createRecord("assessment", {
        dayId: d.id,
        sessionId: session.id,
        tradeId: idea.entryEventId,
        playbookId: book.id,
        retrospective: true,
        assessedAt: Date.now(),
        quality: null,
        notes: "",
        screenshots: [],
      }),
    );
    const e = withRefs(
      createRecord("evaluation", {
        assessmentId: a.id,
        ruleId: rule.id,
        adherence: i ? "followed" : "broken",
        method: "manual",
        reason: "My confirmation",
        evidenceIds: [],
      }),
    );
    validateAppend(rows, [a, e], [session]);
    rows.push(a, e);
  }
  assert.equal(tradeRuleStatuses(rows, ideas[0])[0].status, "broken");
  assert.equal(tradeRuleStatuses(rows, ideas[1])[0].status, "followed");
  const goal = createRecord("goal", {
    name: "Practise rule",
    description: "",
    source: "rule-adherence",
    target: 2,
    start: d.body.date,
    end: d.body.date,
    ruleId: rule.id,
    milestones: [],
  });
  assert.equal(goalProgress(goal, rows).value, 1);
  const e = tradeRuleStatuses(rows, ideas[0])[0].evaluation!;
  const correction = withRefs(
    createRecord("evaluation", { ...e.body, adherence: "followed" }, e),
  );
  validateAppend(rows, [correction], [session]);
  rows.push(correction);
  assert.equal(goalProgress(goal, rows).value, 2);
  assert.equal(latest(rows, "evaluation").length, 2);
});

test("content expansion reflows neighbors without changing saved coordinates, and routines retain their own audio", async () => {
  const layout = emptyModuleLayout();
  layout.modules.a = {
    section: "main",
    order: 0,
    width: 12,
    hidden: false,
    box: { x: 0, y: 0, w: 500, h: 200 },
  };
  layout.modules.b = {
    section: "main",
    order: 1,
    width: 12,
    hidden: false,
    box: { x: 0, y: 220, w: 500, h: 200 },
  };
  const modules = [
    { id: "a", section: "main", order: 0, width: 12, initiallyHidden: false },
    { id: "b", section: "main", order: 1, width: 12, initiallyHidden: false },
  ];
  const expanded = moduleBoard(layout, modules, { a: 750, b: 120 });
  assert.equal(expanded.b.y, 766);
  assert.equal(layout.modules.b.box!.y, 220);
  const collapsed = moduleBoard(layout, modules, { a: 120, b: 120 });
  assert.equal(collapsed.b.y, 220);
  const blob = new Blob(["my saved routine"], { type: "audio/webm" }),
    path = await keepRoutineAudio("guide-owner", blob);
  assert.equal(
    await (await privateFile(path, "guide-owner")).text(),
    "my saved routine",
  );
  await assert.rejects(privateFile(path, "other-owner"), /unavailable/);
});

test("the process edge validator is generated from the same profile and preparation schemas", () => {
  const local = readFileSync("src/lib/process/model.ts", "utf8"),
    edge = readFileSync(
      "supabase/functions/pulse-process/process/model.ts",
      "utf8",
    );
  assert.equal(
    edge,
    local
      .replace('"zod"', '"npm:zod@4.6.7"')
      .replaceAll('"./journal-guide"', '"./journal-guide.ts"')
      .replaceAll('"./widget-layout"', '"./widget-layout.ts"'),
  );
  assert.doesNotMatch(readFileSync("src/app/layout.tsx", "utf8"), /AppearanceProvider|SharkBackground|GlassProvider/);
});

test("the wider evidence preset changes displayed widths without rewriting workspace preferences", () => {
  const layout = emptyModuleLayout();
  const modules = [
    {
      id: "moments",
      section: "main",
      order: 1,
      width: 12,
      initiallyHidden: false,
    },
    {
      id: "evidence",
      section: "side",
      order: 1,
      width: 12,
      initiallyHidden: false,
    },
  ];
  const preset = evidenceReadingLayout(layout, modules, {
    moments: 400,
    evidence: 300,
  });
  const boxes = moduleBoard(preset, modules, { moments: 400, evidence: 300 });
  assert.ok(boxes.evidence.w > boxes.moments.w);
  assert.deepEqual(layout.modules, {});
});
