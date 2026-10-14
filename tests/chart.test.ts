import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartTime,
  hrSegments,
  measurementAt,
  replayCandles,
  visibleChartEvents,
} from "../src/lib/market/chart-data";
import { executionAction } from "../src/lib/trade-context";
import type { Candle } from "../src/lib/market/model";
test("chart boundary preserves millisecond time and uses explicit HR freshness", () => {
  assert.equal(chartTime(1700000000123), 1700000000.123);
  const samples = [
    { t: 1000, bpm: 80 },
    { t: 10000, bpm: 150 },
    { t: 40000, bpm: 90 },
  ];
  assert.equal(measurementAt(samples, 20001), null);
  assert.equal(measurementAt(samples, 20000)?.bpm, 150);
});
test("HR rendering retains spikes and never connects gaps longer than 10 seconds", () => {
  const samples = Array.from({ length: 10000 }, (_, i) => ({
    t: i * 100,
    bpm: i === 4321 ? 180 : 75,
  }));
  samples.push({ t: 1100000, bpm: 85 });
  const segments = hrSegments(samples, 0, 1200000);
  assert.equal(segments.length, 2);
  assert.ok(segments[0].some((s) => s.bpm === 180));
  assert.ok(segments[0].length <= 800);
});
test("replay hides future OHLC, execution markers, and HR beyond its cutoff", () => {
  const bar: Candle = {
    t: 1000,
    end: 61000,
    open: 10,
    high: 100,
    low: 5,
    close: 90,
    complete: true,
    observedAt: 70000,
  };
  assert.deepEqual(replayCandles([bar], 30000, true), []);
  assert.equal(replayCandles([bar], 61000, true).length, 1);
  assert.equal(
    replayCandles([{ ...bar, complete: false }], 61000, true).length,
    0,
  );
  assert.equal(
    hrSegments(
      [
        { t: 1000, bpm: 80 },
        { t: 40000, bpm: 150 },
      ],
      0,
      30000,
    ).flat().length,
    1,
  );
  const event = {
    id: "1",
    t: 20000,
    symbol: "ABC",
    kind: "entry" as const,
    side: "long" as const,
    price: 10,
    quantity: 1,
    source: "manual" as const,
  };
  assert.equal(
    visibleChartEvents([event, { ...event, id: "2", t: 40000 }], 0, 30000)
      .length,
    1,
  );
});
test("execution arrows represent buy and sell across all entry/exit directions", () => {
  const event = {
    id: "e",
    t: 1000,
    symbol: "ABC",
    price: 10,
    quantity: 1,
    source: "manual" as const,
  };
  assert.equal(
    executionAction({ ...event, kind: "entry", side: "long" }),
    "buy",
  );
  assert.equal(
    executionAction({ ...event, kind: "exit", side: "short" }),
    "buy",
  );
  assert.equal(
    executionAction({ ...event, kind: "entry", side: "short" }),
    "sell",
  );
  assert.equal(
    executionAction({ ...event, kind: "exit", side: "long" }),
    "sell",
  );
});
