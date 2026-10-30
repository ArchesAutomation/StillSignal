import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRecord,
  latest,
  recordSchema,
  type BodyOf,
  type ProcessRecord,
} from "../src/lib/process/model";
import {
  evaluateRule,
  preparation,
  processScore,
  thesisAt,
  validateAppend,
  withRefs,
} from "../src/lib/process/engine";
import { validateValue, observationsAt } from "../src/lib/environment/values";
import { auditSnapshot, goalProgress } from "../src/lib/process/reviews";
import {
  eventPhysiology,
  recoverySeconds,
  windowMetric,
} from "../src/lib/pattern-engine/physiology";
import type { Session, TradeEvent } from "../src/lib/model";
const now = Date.now() - 1000000;
const day = () =>
  createRecord(
    "day",
    {
      date: "2026-10-29",
      timezone: "UTC",
      status: "no-trade",
      instrument: "ES",
      account: "",
      timeframes: [],
      sessionIds: [],
      goal: "",
    },
    undefined,
    [],
    now,
  );
const thesisBody = (dayId: string): BodyOf<"thesis"> => ({
  scope: "daily",
  dayId,
  periodStart: "2026-10-29",
  instrument: "ES",
  bias: "bullish",
  timeframes: [],
  structure: "",
  events: "",
  levels: "",
  liquidity: "",
  primary: "My recorded market scenario",
  alternate: "",
  entries: "",
  invalidation: "",
  noTrade: "",
  targets: "",
  notes: "",
  screenshots: [],
  reason: "Initial plan",
});
const event: TradeEvent = {
  id: "entry-1",
  t: now + 10000,
  symbol: "ES",
  kind: "entry",
  side: "long",
  quantity: 2,
  price: 100,
  source: "manual",
  provenance: "execution",
  timePrecision: "second",
};
test("preparation keeps actual requirement versions and evidence timing", () => {
  const d = day(),
    step = {
      id: crypto.randomUUID(),
      name: "Write a daily thesis",
      description: "",
      category: "Preparation",
      requirement: "required" as const,
      condition: "",
      verification: "daily-thesis" as const,
      window: "Before trading",
      order: 0,
    },
    template = createRecord(
      "protocol",
      {
        name: "My process",
        description: "",
        instrument: "ES",
        strategy: "",
        session: "",
        steps: [step],
      },
      undefined,
      [],
      now,
    );
  const run = withRefs(
    createRecord(
      "run",
      { dayId: d.id, templateId: template.id, steps: [step], startedAt: now },
      undefined,
      [],
      now,
    ),
  );
  let records: ProcessRecord[] = validateAppend([], [d, template, run], []);
  assert.equal(preparation(records, d.id).complete, 0);
  assert.equal(preparation(records, d.id).unknown, 1);
  const bad = createRecord(
    "response",
    {
      runId: run.id,
      stepId: step.id,
      status: "complete",
      method: "verified",
      reason: "assumed",
      completedAt: now,
    },
    undefined,
    [],
    now,
  );
  assert.throws(() => recordSchema.parse(bad), /support|evidence|Completion/);
  const thesis = withRefs(
    createRecord("thesis", thesisBody(d.id), undefined, [], now + 1000),
  );
  records = validateAppend(records, [thesis], []);
  const response = withRefs(
    createRecord(
      "response",
      {
        runId: run.id,
        stepId: step.id,
        status: "complete",
        method: "verified",
        reason: "Saved thesis",
        completedAt: now + 2000,
        evidenceId: thesis.id,
      },
      undefined,
      [{ kind: "thesis", id: thesis.id }],
      now + 2000,
    ),
  );
  records = validateAppend(records, [response], []);
  assert.equal(preparation(records, d.id, now + 1500).complete, 0);
  assert.equal(preparation(records, d.id).percent, 100);
  const next = createRecord(
    "protocol",
    {
      ...template.body,
      steps: [
        ...template.body.steps,
        { ...step, id: crypto.randomUUID(), name: "New requirement" },
      ],
    },
    template,
    [],
    now + 3000,
  );
  records = validateAppend(records, [withRefs(next)], []);
  assert.equal(
    preparation(records, d.id).total,
    1,
    "Later checklist edits do not rewrite a completed run",
  );
});
test("thesis and rule evaluations use execution-time history, never HR or P&L", () => {
  const d = day(),
    first = withRefs(
      createRecord("thesis", thesisBody(d.id), undefined, [], now),
    ),
    revised = withRefs(
      createRecord(
        "thesis",
        { ...first.body, bias: "bearish", reason: "Changed view" },
        first,
        [],
        now + 20000,
      ),
    );
  const records = [d, first, revised];
  assert.equal(thesisAt(records, d.id, "ES", event.t)?.id, first.id);
  const rule = {
    id: crypto.randomUUID(),
    name: "Follow thesis",
    description: "",
    weight: 1,
    verification: "thesis-direction" as const,
  };
  assert.equal(evaluateRule(rule, event, d, records).adherence, "followed");
  assert.equal(
    evaluateRule(rule, { ...event, timePrecision: "day" }, d, records)
      .adherence,
    "unknown",
  );
  assert.equal(
    evaluateRule(
      { ...rule, verification: "manual" },
      { ...event, pnl: -500 },
      d,
      records,
    ).adherence,
    "unknown",
  );
  const max = {
    ...rule,
    id: crypto.randomUUID(),
    verification: "max-size" as const,
    limit: 1,
  };
  assert.equal(evaluateRule(max, event, d, records).adherence, "broken");
  const unknown = processScore([], [rule, max]);
  assert.equal(unknown.score, null);
  assert.equal(unknown.coverage, 0);
  const assessmentId = crypto.randomUUID();
  const evals = [
    createRecord("evaluation", {
      assessmentId,
      ruleId: rule.id,
      adherence: "followed",
      method: "manual",
      reason: "Confirmed",
      evidenceIds: [],
    }),
  ];
  const score = processScore(evals, [rule, max]);
  assert.equal(score.score, 100);
  assert.equal(score.coverage, 0.5);
  assert.equal(score.unknown, 1);
});
test("typed variables preserve numeric unit versions, missing states, corrected values and archives", () => {
  const d = day(),
    v = createRecord(
      "variable",
      {
        name: "Caffeine",
        category: "Lifestyle",
        type: "number",
        unit: "mg",
        min: 0,
        choices: [],
        frequency: "event",
        phases: ["pre-market", "during"],
        source: "manual",
        required: false,
        archived: false,
        analytics: true,
      },
      undefined,
      [],
      now,
    );
  const o = withRefs(
    createRecord(
      "observation",
      {
        definitionId: v.id,
        dayId: d.id,
        observedAt: now + 1000,
        phase: "pre-market",
        missing: "recorded",
        value: 100,
        source: "manual",
        provenance: "One coffee",
      },
      undefined,
      [],
      now + 1000,
    ),
  );
  assert.throws(() => validateValue(v, { ...o.body, value: "100" }), /number/);
  assert.throws(
    () =>
      recordSchema.parse({
        ...o,
        body: { ...o.body, missing: "unavailable", value: 0 },
      }),
    /Missing/,
  );
  const edited = withRefs(
    createRecord("variable", { ...v.body, unit: "g" }, v, [], now + 2000),
  );
  let records = validateAppend([], [d, v, o, edited], []);
  assert.equal(
    observationsAt(records, d.id, now + 1500)[0].definition.body.unit,
    "mg",
  );
  const corrected = withRefs(
    createRecord(
      "observation",
      { ...o.body, value: 80, provenance: "Corrected dose" },
      o,
      [],
      now + 3000,
    ),
  );
  records = validateAppend(records, [corrected], []);
  assert.equal(
    observationsAt(records, d.id, now + 1500)[0].observation.body.value,
    80,
  );
  const removed = {
    ...withRefs(
      createRecord("observation", corrected.body, corrected, [], now + 4000),
    ),
    archived: true,
  };
  records = validateAppend(records, [removed], []);
  assert.equal(observationsAt(records, d.id, now + 1500).length, 0);
  assert.equal(latest(records, "variable")[0].body.unit, "g");
});
test("time-weighted HR windows report gaps, require completed baselines and reject date-only resolution", () => {
  const samples = Array.from({ length: 901 }, (_, i) => ({
    t: i * 1000,
    bpm: i < 300 ? 80 : 90,
  }));
  const e = { ...event, t: 400000 },
    hr = eventPhysiology(samples, e, 500000);
  assert.equal(hr.baseline, 80);
  assert.equal(hr.windows["1m before"].coverage, 1);
  assert.equal(hr.windows["1m before"].meanDeviation, 10);
  const gap = windowMetric(
    [
      { t: 0, bpm: 80 },
      { t: 1000, bpm: 100 },
      { t: 59000, bpm: 120 },
      { t: 60000, bpm: 100 },
    ],
    0,
    60000,
    80,
  );
  assert.ok(gap.coverage < 0.04);
  assert.equal(gap.missingIntervals.length, 1);
  assert.ok(gap.aboveSeconds! <= 2);
  assert.equal(
    eventPhysiology(samples, { ...e, timePrecision: "day" }, 500000).baseline,
    null,
  );
  assert.deepEqual(
    eventPhysiology(samples, { ...e, timePrecision: "day" }).windows,
    {},
  );
  assert.equal(
    eventPhysiology(samples, { ...e, t: 60000 }).baseline,
    null,
    "Opening baseline must precede execution",
  );
  assert.equal(
    recoverySeconds(
      [
        { t: 500000, bpm: 80 },
        { t: 550000, bpm: 80 },
        { t: 580000, bpm: 80 },
      ],
      500000,
      80,
    ),
    null,
    "A disconnect is not recovery",
  );
});
test("no-trade days count toward preparation/audits and missions stay evidence based", () => {
  const d = day(),
    goal = createRecord("goal", {
      name: "Record check-ins",
      description: "",
      source: "checkin",
      start: "2026-10-29",
      end: "2026-10-30",
      target: 2,
      milestones: [1],
    });
  const check = withRefs(
    createRecord("checkin", {
      dayId: d.id,
      observedAt: now,
      answers: [{ question: "Focus", value: 7 }],
      physical: "",
      circumstances: "",
      reflection: "",
    }),
  );
  const records = [d, goal, check];
  assert.equal(goalProgress(goal, records).value, 1);
  const snapshot = auditSnapshot(
    records,
    [] as Session[],
    "2026-10-29",
    "2026-10-29",
    "UTC",
  );
  assert.equal(snapshot.days, 1);
  assert.equal(snapshot.executions, 0);
  assert.equal(snapshot.hrSessions, 0);
});

test("temperature answers become version-pinned measurements without invented missing values", async () => {
  const { temperatureRecords } = await import(
    "../src/lib/environment/temperature"
  );
  const d = day(),
    body: BodyOf<"checkin"> = {
      dayId: d.id,
      observedAt: Date.now(),
      answers: [
        { question: "Focus", value: 7 },
        { question: "Perceived stress", value: null },
      ],
      physical: "",
      circumstances: "",
      reflection: "",
    };
  const batch = temperatureRecords([d], body).map(withRefs),
    records = validateAppend([d], batch, []),
    observed = observationsAt(records, d.id, Date.now() + 1000);
  assert.equal(observed.length, 2);
  assert.equal(
    observed.find((v) => v.definition.body.name === "Focus")?.observation.body
      .value,
    7,
  );
  assert.equal(
    observed.find((v) => v.definition.body.name === "Perceived stress")
      ?.observation.body.value,
    null,
  );
  const source = latest(records, "checkin")[0],
    removed = {
      ...createRecord("checkin", source.body, source),
      archived: true,
    };
  assert.equal(
    observationsAt([...records, withRefs(removed)], d.id, Date.now() + 1000)
      .length,
    0,
    "Removing the check-in also excludes its linked measurements from current analyses",
  );
});
