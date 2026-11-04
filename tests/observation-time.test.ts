import { test } from "node:test";
import assert from "node:assert/strict";
import { currentTimeOnDay, observationTimeInput, observationTime, earlierObservationTime } from "../src/lib/environment/observation-time";

test("observation inputs use the trading timezone and retain an explicitly selected historical date", () => {
  const now = Date.parse("2026-11-04T01:30:00Z");
  assert.equal(currentTimeOnDay("2026-10-27", "America/Denver", now), "2026-10-27T18:30");
  assert.equal(currentTimeOnDay("2026-10-27", "Europe/London", now), "2026-10-27T01:30");
  assert.equal(observationTime("2026-10-27T18:30", "America/Denver"), Date.parse("2026-10-28T00:30:00Z"));
  assert.equal(earlierObservationTime("2026-10-27T00:05", 15), "2026-10-26T23:50");
});

test("DST gaps and repeated hours are rejected for new entries, while an unchanged historical instant stays exact", () => {
  assert.throws(() => observationTime("2026-03-08T02:30", "America/New_York"), /unambiguous/);
  assert.throws(() => observationTime("2026-11-01T01:30", "America/New_York"), /unambiguous/);
  for (const original of [Date.parse("2026-11-01T05:30:42.123Z"), Date.parse("2026-11-01T06:30:42.123Z")]) {
    const input = observationTimeInput(original, "America/New_York");
    assert.equal(input, "2026-11-01T01:30");
    assert.equal(observationTime(input, "America/New_York", original), original);
  }
  assert.throws(() => observationTime("", "UTC"), /valid/);
});
