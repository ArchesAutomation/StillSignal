import { test } from "node:test";
import assert from "node:assert/strict";
import { planCsvSessions, mergeCsvEvents } from "../src/lib/csv-session";
import { eventWindow, positionWindow } from "../src/lib/analytics";
import type { Session, TradeEvent } from "../src/lib/model";

const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const at = (time: string) => Date.parse(`2026-01-15T${time}Z`);
const entry: TradeEvent = { id: "entry", t: at("09:00:00"), symbol: "ES", source: "csv", provenance: "execution", kind: "entry", side: "long", quantity: 2, price: 5000 };
const exit: TradeEvent = { ...entry, id: "exit", kind: "exit", t: at("09:10:00"), price: 5010 };
const session: Session = { id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", owner, name: "Recorded day", startedAt: at("08:30:00"), endedAt: at("09:05:00"), source: "journal", sampleCount: 100, events: [], journal: [{ id: "note", t: at("08:45:00"), label: "Calm", text: "Keep me" }] };

test("daily CSV matches the recorded session and retains its immutable bounds, notes and HR metadata", () => {
  const [plan] = planCsvSessions([exit, entry], [session, { ...session, owner: "other", sampleCount: 900 }], owner, "UTC");
  assert.equal(plan.session?.id, session.id);
  const merged = mergeCsvEvents(plan.session!, plan.events);
  assert.equal(merged.sampleCount, 100);
  assert.deepEqual(merged.journal, session.journal);
  assert.equal(merged.endedAt, session.endedAt);
  assert.equal(mergeCsvEvents(merged, plan.events).events.length, 2);
});

test("CSV day matching respects export timezone, DST, multiple dates and selected session", () => {
  const events = [entry, { ...entry, id: "next-day", t: Date.parse("2026-01-16T00:30:00Z") }];
  assert.equal(planCsvSessions(events, [], owner, "UTC").length, 2);
  assert.equal(planCsvSessions(events, [], owner, "America/New_York").length, 1);
  const smaller = { ...session, id: "cccccccc-cccc-4ccc-cccc-cccccccccccc", sampleCount: 5 };
  assert.equal(planCsvSessions([entry], [session, smaller], owner, "UTC", smaller.id)[0].session?.id, smaller.id);
  const dst = { ...entry, t: Date.parse("2026-03-09T03:30:00Z") };
  const day = planCsvSessions([dst], [], owner, "America/New_York")[0];
  assert.equal(day.day, "2026-03-08");
  const stale = { ...session, endedAt: undefined };
  assert.equal(planCsvSessions([events[1]], [stale], owner, "UTC")[0].session, undefined, "an old interrupted recording must not capture later days");
});

test("importing earlier trades does not end an active session or alter sample count", () => {
  const live = { ...session, endedAt: undefined, startedAt: at("09:02:00") };
  const result = mergeCsvEvents(live, [entry, exit]);
  assert.equal(result.endedAt, undefined);
  assert.equal(result.startedAt, live.startedAt);
  assert.equal(result.sampleCount, live.sampleCount);
  assert.deepEqual(result.journal, live.journal);
});

test("position HR aligns to event time, handles partial exits, and leaves missing measurements blank", () => {
  const partial = { ...exit, id: "partial", t: at("09:05:00"), quantity: 1 };
  const last = { ...exit, quantity: 1 };
  const samples = [
    { t: entry.t - 30000, bpm: 70 }, { t: entry.t, bpm: 80 },
    { t: partial.t, bpm: 100 }, { t: last.t, bpm: 90 },
    { t: last.t + 30000, bpm: 75 },
  ];
  const p = positionWindow(samples, [entry, partial, last], partial, 60, last.t + 60000)!;
  assert.equal(p.start, entry.t);
  assert.equal(p.end, last.t);
  assert.equal(p.before, 70);
  assert.equal(p.during, 90);
  assert.equal(p.after, 75);
  assert.equal(p.count, 3);
  assert.equal(positionWindow([], [entry, last], entry, 60, last.t)!.during, null);
  assert.equal(eventWindow(samples, { t: entry.t - 3600000 }, 60).at, null);
  assert.equal(positionWindow(samples, [entry, { ...last, account: "other" }], entry, 60, last.t)!.closed, false);
  assert.equal(positionWindow(samples, [{ ...entry, provenance: "backtest" }], { ...entry, provenance: "backtest" }, 60, last.t), null);
  assert.equal(positionWindow(samples, [entry, last], { ...entry, timePrecision: "day" }, 60, last.t), null);
  assert.equal(positionWindow(samples, [{ ...entry, timestampSource: "order-update" }, last], last, 60, last.t)!.approximate, true);
});
