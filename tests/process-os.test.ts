import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRecord,
  recordSchema,
  type BodyOf,
} from "../src/lib/process/model";
import { applicability, conditionSchema } from "../src/lib/process/conditions";
import { preparation, processScore } from "../src/lib/process/engine";
import { replayContext, replayTimeline } from "../src/lib/process/replay";
import { workspaceSchema } from "../src/lib/process/workspace-schema";
import { emptyModuleLayout } from "../src/lib/module-layout";
import type { Session } from "../src/lib/model";
const day = createRecord(
  "day",
  {
    date: "2026-10-31",
    timezone: "UTC",
    status: "preparing",
    instrument: "ES",
    account: "",
    timeframes: [],
    sessionIds: [],
    goal: "",
  },
  undefined,
  [],
  100,
);
test("conditional preparation preserves unknown and excludes only evidenced false conditions", () => {
  const step: BodyOf<"protocol">["steps"][number] = {
    id: crypto.randomUUID(),
    name: "Event review",
    description: "",
    category: "Risk",
    requirement: "conditional",
    condition: "",
    verification: "manual",
    window: "",
    order: 0,
  };
  const template = createRecord(
    "protocol",
    {
      name: "Routine",
      description: "",
      instrument: "",
      strategy: "",
      session: "",
      steps: [step],
    },
    undefined,
    [],
    100,
  );
  const run = createRecord(
    "run",
    { dayId: day.id, templateId: template.id, steps: [step], startedAt: 100 },
    undefined,
    [],
    100,
  );
  assert.equal(preparation([day, template, run], day.id, 200).unknown, 1);
  const conditional = {
    ...run,
    body: {
      ...run.body,
      steps: [
        {
          ...step,
          applicability: { type: "instrument" as const, value: "NQ" },
        },
      ],
    },
  };
  assert.equal(
    preparation([day, template, conditional], day.id, 200).excluded,
    1,
  );
  assert.equal(
    applicability(
      {
        type: "variable-above",
        definitionId: crypto.randomUUID(),
        threshold: 2,
      },
      [day],
      day.id,
      200,
    ),
    null,
  );
  assert.equal(
    conditionSchema.safeParse({ type: "javascript", code: "true" }).success,
    false,
  );
  assert.equal(recordSchema.safeParse(template).success, true);
});
test("workspace snapshots validate coordinates and preserve legacy empty boards", () => {
  assert.equal(workspaceSchema.safeParse(emptyModuleLayout()).success, true);
  const layout = emptyModuleLayout();
  layout.modules.test = {
    section: "main",
    order: 0,
    width: 4,
    hidden: false,
    box: { x: 1100, y: 0, w: 400, h: 300 },
  };
  assert.equal(workspaceSchema.safeParse(layout).success, false);
});
test("replay excludes revisions and backdated notes unavailable at the cursor", () => {
  const checkin = createRecord(
    "checkin",
    {
      dayId: day.id,
      observedAt: 120,
      answers: [],
      physical: "",
      circumstances: "",
      reflection: "Later interpretation",
    },
    undefined,
    [],
    300,
  );
  assert.equal(replayContext([day, checkin], day.id, 200).available.length, 1);
  const session = {
    id: crypto.randomUUID(),
    events: [],
    journal: [
      {
        id: "note",
        t: 110,
        eventTime: 100,
        label: "Reflection",
        text: "Edited later",
        updatedAt: 400,
      },
    ],
  } as unknown as Session;
  const timeline = replayTimeline([day, checkin], day.id, session);
  assert.equal(timeline.filter((e) => e.at <= 200).length, 0);
  assert.equal(timeline.find((e) => e.type === "journal")?.at, 400);
});
test("variable conditions use the exact definition version and recorded-time corrections", () => {
  const definitionId = crypto.randomUUID();
  const observation = createRecord(
    "observation",
    {
      dayId: day.id,
      definitionId,
      observedAt: 120,
      phase: "pre-market",
      missing: "recorded",
      value: 8,
      source: "manual",
      provenance: "self report",
    },
    undefined,
    [],
    300,
  );
  const correction = createRecord(
    "observation",
    { ...observation.body, value: 2 },
    observation,
    [],
    500,
  );
  const condition = {
    type: "variable-above" as const,
    definitionId,
    threshold: 5,
  };
  assert.equal(
    applicability(condition, [day, observation, correction], day.id, 200),
    null,
  );
  assert.equal(
    applicability(condition, [day, observation, correction], day.id, 400),
    true,
  );
  assert.equal(
    applicability(condition, [day, observation, correction], day.id, 600),
    false,
  );
  assert.equal(
    applicability(
      { ...condition, definitionId: crypto.randomUUID() },
      [day, observation],
      day.id,
      400,
    ),
    null,
  );
});
test("unknown high-weight rules suppress the score even when count coverage is high", () => {
  const rules = Array.from({ length: 5 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: "Rule " + i,
    description: "",
    weight: i === 4 ? 100 : 1,
    verification: "manual" as const,
  }));
  const assessmentId = crypto.randomUUID();
  const evaluations = rules
    .slice(0, 4)
    .map((rule) =>
      createRecord("evaluation", {
        assessmentId,
        ruleId: rule.id,
        adherence: "followed",
        method: "manual",
        reason: "Confirmed",
        evidenceIds: [],
      }),
    );
  const score = processScore(evaluations, rules);
  assert.equal(score.coverage, 0.8);
  assert.ok(score.weightCoverage! < 0.05);
  assert.equal(score.score, null);
});
test("scenario and chart metadata round-trip in immutable thesis versions", () => {
  const body: BodyOf<"thesis"> = {
    scope: "daily",
    dayId: day.id,
    periodStart: "2026-10-31",
    instrument: "ES",
    bias: "neutral",
    timeframes: [
      {
        timeframe: "Custom",
        bias: "no-trade",
        structure: "Wait",
        invalidation: "Condition fails",
      },
    ],
    structure: "",
    events: "",
    levels: "",
    liquidity: "",
    primary: "",
    alternate: "",
    entries: "",
    invalidation: "",
    noTrade: "",
    targets: "",
    notes: "",
    screenshots: [],
    reason: "Plan",
    scenarios: [
      {
        id: crypto.randomUUID(),
        title: "Wait",
        role: "no-trade",
        condition: "No confirmation",
        confirmation: "Manual",
        action: "Observe",
        invalidation: "Confirmation recorded",
      },
    ],
    chart: {
      symbol: "ES",
      instrumentId: "known-instrument",
      interval: 300,
      source: "User annotation; no candle assertion",
      asOf: 100,
      annotations: [
        {
          id: crypto.randomUUID(),
          name: "My level",
          kind: "custom",
          price: 123,
          color: "#74b49d",
          recordedAt: 100,
        },
      ],
    },
  };
  const original = recordSchema.parse(
    createRecord("thesis", body, undefined, [], 100),
  );
  const changed = createRecord(
    "thesis",
    {
      ...body,
      reason: "Revised",
      scenarios: body.scenarios!.map((s) => ({ ...s, title: "Alternative" })),
    },
    original as ReturnType<typeof createRecord<"thesis">>,
    [],
    300,
  );
  assert.equal(
    replayContext([day, original, changed], day.id, 200).theses[0].body
      .scenarios?.[0].title,
    "Wait",
  );
  assert.equal(
    recordSchema.safeParse({
      ...changed,
      body: { ...changed.body, chart: { ...body.chart, symbol: "NQ" } },
    }).success,
    false,
  );
});
