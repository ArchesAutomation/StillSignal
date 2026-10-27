import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterMoments,
  momentHeartRate,
  clampChartRange,
  fitJournalRange,
} from "../src/lib/journal-space";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import type { JournalEntry } from "../src/lib/model";

test("combined journal filters retain a live capture labelled later and never assign unknown stages", () => {
  const session = reviewFixtures().session;
  const live: JournalEntry = {
    id: "live",
    t: 2000,
    eventTime: 2000,
    capturedAt: 2000,
    label: "Calm",
    labelAddedAt: 9000,
    text: "Waited for confirmation",
    captureMode: "live",
    tradeId: "idea",
    section: "entry",
  };
  const later: JournalEntry = {
    ...live,
    id: "later",
    t: 9000,
    eventTime: 2000,
    captureMode: "post-session",
  };
  const unassigned: JournalEntry = {
    id: "unknown",
    t: 1000,
    label: "Unlabelled",
    text: "Watching price",
    captureMode: "live",
  };
  const source = { ...session, journal: [later, live, unassigned] };
  assert.deepEqual(
    filterMoments(source, {
      search: "confirmation",
      trade: "idea",
      stage: "entry",
      capture: "live",
    }).map((n) => n.id),
    ["live"],
  );
  assert.deepEqual(
    filterMoments(source, {
      search: "",
      trade: "session",
      stage: "unassigned",
      capture: "unlabelled",
    }).map((n) => n.id),
    ["unknown"],
  );
  assert.equal(unassigned.section, undefined);
  assert.deepEqual(
    source.journal.map((n) => n.id),
    ["later", "live", "unknown"],
  );
});
test("later reflections match the original linked time; day scope, gaps, artifacts and pauses are explicit", () => {
  const session = {
    ...reviewFixtures().session,
    blueprint: {
      updatedAt: 1,
      measurementPauses: [{ start: 4000, end: 6000 }],
    },
  };
  const note: JournalEntry = {
    id: "later",
    t: 900000,
    eventTime: 2000,
    label: "Focused",
    text: "Later words",
    captureMode: "post-session",
  };
  const samples = [
    { t: 2000, bpm: 70 },
    { t: 5000, bpm: 120 },
    { t: 900000, bpm: 90 },
  ];
  assert.equal(momentHeartRate(session, samples, note), 70);
  assert.equal(
    momentHeartRate(session, samples, {
      ...note,
      eventTime: null,
      context: { bpm: 90 },
    }),
    null,
  );
  assert.equal(
    momentHeartRate(session, samples, { ...note, eventTime: 5000 }),
    null,
  );
  assert.equal(
    momentHeartRate(session, samples, { ...note, eventTime: 300000 }),
    null,
  );
  assert.equal(
    momentHeartRate(
      session,
      [{ t: 2000, bpm: 170, quality: "artifact" }],
      note,
    ),
    null,
  );
});
test("Fit session frames executions and relevant moments while all measurements retains earlier HR", () => {
  const original = reviewFixtures().session;
  const session = {
    ...original,
    blueprint: undefined,
    events: [{ ...original.events[0], t: 600000 }],
    journal: [],
  };
  const bounds: [number, number] = [0, 3600000];
  const fit = fitJournalRange(session, bounds);
  assert.deepEqual(fit, [540000, 660000]);
  assert.deepEqual(bounds, [0, 3600000]);
  assert.deepEqual(clampChartRange([-30000, 30000], bounds), [0, 60000]);
  assert.deepEqual(
    clampChartRange([3590000, 3650000], bounds),
    [3540000, 3600000],
  );
});
