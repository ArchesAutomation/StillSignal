import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRecord,
  type ProcessRecord,
  type BodyOf,
  type RecordOf,
  recordSchema,
} from "../src/lib/process/model";
import {
  preparation,
  validateAppend,
  withRefs,
} from "../src/lib/process/engine";
import {
  preparationResponse,
  scheduledOn,
  answerError,
} from "../src/lib/process/preparation-workflow";
const t = Date.now() - 100000;
function fixture(
  cadence: NonNullable<
    BodyOf<"protocol">["steps"][number]["cadence"]
  > = "weekly",
) {
  const step: BodyOf<"protocol">["steps"][number] = {
    id: crypto.randomUUID(),
    name: "My checks",
    description: "",
    category: "Preparation",
    requirement: "required",
    condition: "",
    verification: "manual",
    window: "",
    order: 0,
    cadence,
    activity: "checklist",
    checklist: ["My boundary"],
  };
  const protocol = createRecord(
    "protocol",
    {
      name: "Personal routine",
      description: "",
      instrument: "ES",
      strategy: "My strategy",
      session: "New York",
      steps: [step],
    },
    undefined,
    [],
    t,
  );
  const day = (date: string, time = t) =>
    createRecord(
      "day",
      {
        date,
        timezone: "America/Denver",
        status: "preparing",
        instrument: "ES",
        account: "A",
        timeframes: [],
        sessionIds: [],
        goal: "",
      },
      undefined,
      [],
      time,
    );
  const firstDay = day("2026-11-02");
  const run = (d: RecordOf<"day">, time: number, p = protocol) =>
    withRefs(
      createRecord(
        "run",
        {
          dayId: d.rootId,
          templateId: p.id,
          steps: p.body.steps,
          startedAt: time,
        },
        undefined,
        [],
        time,
      ),
    );
  const firstRun = run(firstDay, t + 10);
  const complete = withRefs(
    createRecord(
      "response",
      {
        runId: firstRun.id,
        stepId: step.id,
        status: "complete",
        method: "manual",
        reason: "",
        answers: [{ id: "check-0", value: "yes" }],
        completedAt: t + 20,
      },
      undefined,
      [],
      t + 20,
    ),
  );
  const rows: ProcessRecord[] = [firstDay, protocol, firstRun, complete];
  return { step, protocol, day, run, firstDay, firstRun, complete, rows };
}
test("weekly work carries actual answers within the trading week and becomes due next Monday", () => {
  const f = fixture(),
    today = f.day("2026-11-03", t + 30),
    run = f.run(today, t + 40),
    rows = [...f.rows, today, run];
  validateAppend([], rows, []);
  assert.equal(preparationResponse(rows, run, f.step)?.id, f.complete.id);
  assert.equal(preparation(rows, today.rootId).percent, 100);
  assert.equal(preparation(rows, today.rootId).finishedAt, run.body.startedAt);
  const monday = f.day("2026-11-09", t + 50),
    next = f.run(monday, t + 60);
  assert.equal(
    preparationResponse([...rows, monday, next], next, f.step),
    undefined,
  );
  assert.equal(preparation([...rows, monday, next], monday.rootId).percent, 0);
});
test("per-session, daily and monthly schedules have separate boundaries", () => {
  for (const [cadence, date, reuse] of [
    ["session", "2026-11-02", false],
    ["daily", "2026-11-02", true],
    ["daily", "2026-11-03", false],
    ["monthly", "2026-11-30", true],
    ["monthly", "2026-12-01", false],
  ] as const) {
    const f = fixture(cadence),
      day = date === f.firstDay.body.date ? f.firstDay : f.day(date, t + 30),
      run = f.run(day, t + 40),
      rows = [...f.rows, ...(day === f.firstDay ? [] : [day]), run];
    assert.equal(
      !!preparationResponse(rows, run, f.step),
      reuse,
      `${cadence} ${date}`,
    );
  }
});
test("weekdays exclude off-days without inventing completions", () => {
  const f = fixture("weekdays"),
    step = { ...f.step, weekdays: [1, 3, 5] };
  assert.equal(scheduledOn(step, "2026-11-03"), false);
  assert.equal(scheduledOn(step, "2026-11-04"), true);
  const protocol = createRecord(
      "protocol",
      { ...f.protocol.body, steps: [step] },
      undefined,
      [],
      t,
    ),
    day = f.day("2026-11-03"),
    run = f.run(day, t + 40, protocol);
  const result = preparation([day, protocol, run], day.rootId);
  assert.equal(result.excluded, 1);
  assert.equal(result.complete, 0);
  assert.equal(result.total, 0);
});
test("routine edits, changed instruments and later revisions cannot silently reuse old answers", () => {
  const f = fixture(),
    day = f.day("2026-11-03", t + 30);
  const edited = createRecord(
    "protocol",
    {
      ...f.protocol.body,
      steps: [{ ...f.step, checklist: ["A different boundary"] }],
    },
    f.protocol,
    [],
    t + 35,
  );
  const run = f.run(day, t + 40, edited);
  assert.equal(
    preparationResponse(
      [...f.rows, day, edited, run],
      run,
      edited.body.steps[0],
    ),
    undefined,
  );
  const otherDay = createRecord(
      "day",
      { ...day.body, instrument: "NQ" },
      undefined,
      [],
      t + 30,
    ),
    otherRun = f.run(otherDay, t + 40);
  assert.equal(
    preparationResponse([...f.rows, otherDay, otherRun], otherRun, f.step),
    undefined,
  );
  const current = f.run(day, t + 40),
    correction = createRecord(
      "response",
      { ...f.complete.body, status: "incomplete", completedAt: undefined },
      f.complete,
      [],
      t + 50,
    );
  assert.equal(
    preparationResponse([...f.rows, day, current, correction], current, f.step)
      ?.id,
    f.complete.id,
    "new run uses only completion known at its start",
  );
  assert.equal(
    preparation([...f.rows, day, current], day.rootId, t + 39).runs.length,
    0,
  );
});
test("completion rejects unchecked non-negotiables and invalid required answers", () => {
  const f = fixture(),
    prompt = {
      id: crypto.randomUUID(),
      label: "My number",
      type: "number" as const,
      required: true,
      choices: [],
    },
    step = { ...f.step, prompts: [prompt] };
  assert.match(answerError(step, []), /My boundary/);
  assert.match(
    answerError(step, [{ id: "check-0", value: "yes" }]),
    /My number/,
  );
  assert.match(
    answerError(step, [
      { id: "check-0", value: "yes" },
      { id: prompt.id, value: "words" },
    ]),
    /number/,
  );
  assert.equal(
    answerError(step, [
      { id: "check-0", value: "yes" },
      { id: prompt.id, value: "0" },
    ]),
    "",
  );
  const invalid = createRecord(
    "response",
    { ...f.complete.body, answers: [] },
    undefined,
    [],
    t + 30,
  );
  assert.throws(
    () => validateAppend(f.rows.slice(0, -1), [invalid], []),
    /My boundary/,
  );
  assert.equal(
    recordSchema.safeParse({
      ...f.protocol,
      body: { ...f.protocol.body, steps: [{ ...f.step, weekdays: [7] }] },
    }).success,
    false,
  );
});
