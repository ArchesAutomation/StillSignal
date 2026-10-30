import type { Sample, Session, TradeEvent } from "../model";
/** Preserve the journal's explicit source choices and measurement exclusions. */
export function analyticalSamples(session: Session, samples: Sample[]): Sample[] {
  if (session.blueprint?.combine?.hr === false) return [];
  const pauses = session.blueprint?.measurementPauses;
  return samples.filter(p => p.t >= session.startedAt && (!session.endedAt || p.t <= session.endedAt))
    .map(p => pauses?.some(g => p.t >= g.start && p.t <= (g.end ?? Infinity))
      ? { ...p, quality: "artifact" as const } : p);
}
export type WindowMetric = {
  start: number;
  end: number;
  count: number;
  coverage: number;
  mean: number | null;
  meanDeviation: number | null;
  maximumDeviation: number | null;
  ratePerMinute: number | null;
  aboveSeconds: number | null;
  missingIntervals: { start: number; end: number }[];
};
const sampleCache = new WeakMap<Sample[], Sample[]>();
function usable(samples: Sample[]) {
  const cached = sampleCache.get(samples);
  if (cached) return cached;
  const points = [
    ...new Map(
      samples
        .filter(
          (p) =>
            Number.isFinite(p.t) &&
            Number.isFinite(p.bpm) &&
            p.bpm >= 25 &&
            p.bpm <= 240,
        )
        .map((p) => [p.t, p]),
    ).values(),
  ].sort((a, b) => a.t - b.t);
  sampleCache.set(samples, points);
  sampleCache.set(points, points);
  return points;
}
function lowerBound(points: Sample[], t: number) {
  let left = 0,
    right = points.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (points[middle].t < t) left = middle + 1;
    else right = middle;
  }
  return left;
}
/** Integrate only observed intervals, with a maximum interpolation gap of 10 seconds.
 * No extrapolation, sample-count coverage, or filling disconnected intervals. */
export function windowMetric(
  samples: Sample[],
  start: number,
  end: number,
  baseline: number | null,
  threshold = 20,
): WindowMetric {
  const sorted = usable(samples),
    points = sorted.slice(
      lowerBound(sorted, start - 10000),
      lowerBound(sorted, end + 10001),
    ),
    observed = points.filter((p) => p.quality !== "artifact" && p.t >= start && p.t <= end);
  let duration = 0,
    integral = 0,
    above = 0,
    change = 0,
    peak: number | null = observed.length
      ? Math.max(...observed.map((p) => p.bpm))
      : null;
  const intervals: { start: number; end: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      left = Math.max(start, a.t),
      right = Math.min(end, b.t);
    if (a.quality === "artifact" || b.quality === "artifact" || b.t - a.t > 10000 || right <= left) continue;
    const v1 = a.bpm + ((b.bpm - a.bpm) * (left - a.t)) / (b.t - a.t),
      v2 = a.bpm + ((b.bpm - a.bpm) * (right - a.t)) / (b.t - a.t),
      span = right - left;
    duration += span;
    integral += ((v1 + v2) / 2) * span;
    change += v2 - v1;
    peak = Math.max(peak ?? -Infinity, v1, v2);
    intervals.push({ start: left, end: right });
    if (baseline !== null) {
      const limit = baseline + threshold;
      if (v1 > limit && v2 > limit) above += span;
      else if (v1 > limit !== v2 > limit)
        above +=
          span *
          (v1 > limit ? (v1 - limit) / (v1 - v2) : (v2 - limit) / (v2 - v1));
    }
  }
  const missingIntervals: WindowMetric["missingIntervals"] = [];
  let cursor = start;
  for (const interval of intervals) {
    if (interval.start > cursor)
      missingIntervals.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < end) missingIntervals.push({ start: cursor, end });
  const mean = duration ? integral / duration : null;
  return {
    start,
    end,
    count: observed.length,
    coverage: end > start ? duration / (end - start) : 0,
    mean,
    meanDeviation: mean !== null && baseline !== null ? mean - baseline : null,
    maximumDeviation:
      peak !== null && baseline !== null ? peak - baseline : null,
    ratePerMinute: duration ? (change / duration) * 60000 : null,
    aboveSeconds: baseline !== null && duration ? above / 1000 : null,
    missingIntervals,
  };
}
export function validBaseline(
  samples: Sample[],
  eventTime: number,
  seconds = 300,
) {
  const points = usable(samples),
    start = points[0]?.t;
  if (start === undefined || start + seconds * 1000 > eventTime) return null;
  const result = windowMetric(
    points.filter((p) => p.t < start + seconds * 1000),
    start,
    start + seconds * 1000,
    null,
  );
  return result.coverage >= 0.8 ? result.mean : null;
}
export function recoverySeconds(
  samples: Sample[],
  exit: number,
  baseline: number | null,
) {
  if (baseline === null) return null;
  const points = usable(samples).filter(
    (p) => p.t >= exit && p.t <= exit + 300000,
  );
  if (!points.length || points[0].t - exit > 10000) return null;
  let stable: number | undefined;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.quality === "artifact" || (i && p.t - points[i - 1].t > 10000)) return null;
    if (Math.abs(p.bpm - baseline) <= 5) {
      stable ??= p.t;
      if (p.t - stable >= 30000) return (stable - exit) / 1000;
    } else stable = undefined;
  }
  return null;
}
export function eventPhysiology(
  samples: Sample[],
  event: TradeEvent,
  exit?: number,
  baselineSeconds = 300,
  threshold = 20,
) {
  if (event.timePrecision === "day" || event.timestampSource === "order-update")
    return {
      baseline: null,
      windows: {} as Record<string, WindowMetric>,
      recovery: null,
      exclusion:
        event.timePrecision === "day"
          ? "Date-only execution timestamp"
          : "Approximate order-update timestamp; execution-aligned HR is unavailable",
    };
  const baseline = validBaseline(samples, event.t, baselineSeconds),
    windows: Record<string, WindowMetric> = {};
  for (const [name, start, end] of [
    ["5m before", event.t - 300000, event.t],
    ["1m before", event.t - 60000, event.t],
    ["Entry", event.t - 5000, event.t + 5000],
  ] as const)
    windows[name] = windowMetric(samples, start, end, baseline, threshold);
  if (exit !== undefined && exit >= event.t) {
    if (exit > event.t)
      windows.Holding = windowMetric(
        samples,
        event.t,
        exit,
        baseline,
        threshold,
      );
    windows.Exit = windowMetric(
      samples,
      exit - 5000,
      exit + 5000,
      baseline,
      threshold,
    );
    windows["1m after exit"] = windowMetric(
      samples,
      exit,
      exit + 60000,
      baseline,
      threshold,
    );
    windows["5m after exit"] = windowMetric(
      samples,
      exit,
      exit + 300000,
      baseline,
      threshold,
    );
  }
  return {
    baseline,
    windows,
    recovery:
      exit === undefined ? null : recoverySeconds(samples, exit, baseline),
    exclusion: samples.length
      ? baseline === null
        ? "No sufficiently covered pre-event baseline"
        : null
      : "No HR samples",
  };
}
