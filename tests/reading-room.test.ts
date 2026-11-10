import { test } from "node:test";
import assert from "node:assert/strict";
import { readingRoomDashboard, readingRoomReference, isReadingRoom } from "../src/lib/reading-room";
import { dashboardRecords, dashboardSnapshot, readDashboardSnapshot, freshDashboard } from "../src/lib/process/dashboard";
import { createRecord, recordSchema } from "../src/lib/process/model";
import { reviewFixtures } from "../src/lib/staging-fixtures";

test("Reading Room is a non-default Journal starter compatible with existing snapshots", () => {
  const old = createRecord("layout", { ...freshDashboard(), page: "Journal", isDefault: true });
  const original = structuredClone(old);
  const preset = readingRoomDashboard();
  assert.equal(isReadingRoom(preset.workspace), true);
  assert.equal(preset.page, "Journal");
  assert.equal(preset.isDefault, false);
  assert.doesNotThrow(() => recordSchema.parse(createRecord("layout", preset)));
  assert.deepEqual(readDashboardSnapshot(dashboardSnapshot(preset)), preset);
  const result = dashboardRecords(preset, undefined, [old]);
  assert.equal(result.batch.length, 1);
  assert.notEqual(result.record.rootId, old.rootId);
  assert.deepEqual(old, original);
  assert.equal(isReadingRoom(old.body.workspace), false);
});

test("secondary journal widgets remain registered but hidden; core IDs stay intact", () => {
  const layout = readingRoomDashboard().workspace!;
  assert.deepEqual(Object.entries(layout.modules).filter(([,p]) => !p.hidden).map(([id]) => id), ["daily-reference", "timeline", "moments", "evidence"]);
  for (const id of ["calendar", "dates", "writing", "session-controls", "process-context", "review-chart", "observations"]) assert.equal(layout.modules[id].hidden, true);
  const another = readingRoomDashboard();
  another.workspace!.modules.timeline.hidden = true;
  assert.equal(readingRoomDashboard().workspace!.modules.timeline.hidden, false);
});

test("daily reference reads the selected timezone date and current check-in without writing", () => {
  const session = { ...reviewFixtures().session, startedAt: Date.parse("2026-11-10T00:30:00Z"), timezone: "America/New_York" };
  const day = createRecord("day", { date: "2026-11-09", timezone: session.timezone, status: "preparing", instrument: "", account: "", timeframes: [], sessionIds: [], goal: "Give myself time" });
  const other = createRecord("day", { ...day.body, date: "2026-11-10", goal: "Another day" });
  const rows = [day, other];
  const original = structuredClone(rows);
  const result = readingRoomReference(rows, session);
  assert.equal(result.intention, "Give myself time");
  assert.equal(result.arrival, "No check-in recorded for this day.");
  assert.deepEqual(rows, original);
  const first = createRecord("checkin", { dayId: day.rootId, observedAt: session.startedAt - 2000, answers: [{ question: "Energy", value: 3 }], physical: "", circumstances: "", reflection: "" });
  const correction = createRecord("checkin", { ...first.body, answers: [{ question: "Energy", value: 6 }, { question: "Stress", value: null }] }, first);
  const anotherDay = createRecord("checkin", { ...first.body, dayId: other.rootId, observedAt: session.startedAt, reflection: "Do not borrow this" });
  assert.equal(readingRoomReference([...rows, first, correction, anotherDay], session).arrival, "Energy: 6/10");
});

test("empty and ambiguous process days do not borrow another day's context", () => {
  const session = { ...reviewFixtures().session, timezone: "UTC", blueprint: undefined };
  const result = readingRoomReference([], session);
  assert.match(result.intention, /No intention recorded/);
  assert.match(result.arrival, /No check-in recorded/);
  const date = new Date(session.startedAt).toISOString().slice(0,10);
  const day = createRecord("day", { date, timezone: "Europe/London", status: "preparing", instrument: "", account: "", timeframes: [], sessionIds: [], goal: "Wrong timezone" });
  const other = createRecord("day", { ...day.body, timezone: "Asia/Tokyo" });
  assert.match(readingRoomReference([day, other], session).intention, /No intention recorded/);
});
