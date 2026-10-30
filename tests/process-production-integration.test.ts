import { test } from "node:test";
import assert from "node:assert/strict";
import type { Sample } from "../src/lib/model";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import { analyticalSamples, recoverySeconds, windowMetric } from "../src/lib/pattern-engine/physiology";

test("process HR comparisons respect journal source choices, pauses, artifacts and recording bounds", () => {
  const session = { ...reviewFixtures().session, startedAt: 1000, endedAt: 41000 };
  const samples: Sample[] = Array.from({ length: 45 }, (_, i) => ({ t: i * 1000, bpm: 70 }));
  samples[20] = { t: 20000, bpm: 230, quality: "artifact" };
  session.blueprint = { updatedAt: 1, measurementPauses: [{ start: 10000, end: 12000 }] };
  const selected = analyticalSamples(session, samples);
  assert.equal(selected[0].t, 1000);
  assert.equal(selected.at(-1)!.t, 41000);
  const metric = windowMetric(selected, 1000, 41000, 70);
  assert.equal(metric.mean, 70);
  assert.equal(metric.maximumDeviation, 0);
  assert.ok(metric.coverage < 1);
  assert.ok(metric.missingIntervals.some(g => g.start <= 10000 && g.end >= 12000));
  assert.equal(recoverySeconds(selected, 1000, 70), null);
  assert.equal(samples[10].quality, undefined, "analysis must not mutate the recording");
  session.blueprint.combine = { hr: false, audio: true, transcript: true, pnl: true, profile: true, environment: true };
  assert.deepEqual(analyticalSamples(session, samples), []);
  const excluded = windowMetric(analyticalSamples(session, samples), 1000, 41000, 70);
  assert.equal(excluded.coverage, 0);
  assert.equal(excluded.mean, null);
});
