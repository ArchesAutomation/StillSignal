import { downsample, nearest } from "../analytics.ts";
import type { Sample, TradeEvent } from "../model.ts";
import type { Candle } from "./model.ts";
export const HR_FRESHNESS_MS = 10_000;
export const chartTime = (t: number) => t / 1000;
export const measurementAt = (samples: Sample[], t: number) =>
  nearest(samples, t, HR_FRESHNESS_MS);
export function replayCandles(
  candles: Candle[],
  cutoff: number,
  replay: boolean,
) {
  // OHLC bars have no intra-bar history. Only reveal a completed bar after its end.
  return candles.filter(
    (c) => c.t <= cutoff && (!replay || (c.complete && c.end <= cutoff)),
  );
}
export function hrSegments(samples: Sample[], start: number, end: number) {
  const segments: Sample[][] = [];
  for (const sample of samples) {
    if (sample.t < start || sample.t > end) continue;
    const segment = segments.at(-1);
    if (!segment || sample.t - segment.at(-1)!.t > HR_FRESHNESS_MS)
      segments.push([sample]);
    else if (sample.t !== segment.at(-1)!.t) segment.push(sample);
  }
  return segments.map((s) =>
    downsample(
      s,
      Math.max(40, Math.floor(1600 / Math.max(1, segments.length))),
    ),
  );
}
export function visibleChartEvents(
  events: TradeEvent[],
  start: number,
  end: number,
) {
  return events.filter((e) => !e.voided && e.t >= start && e.t <= end);
}
