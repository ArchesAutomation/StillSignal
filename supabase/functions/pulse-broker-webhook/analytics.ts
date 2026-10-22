import type { Sample, TradeEvent } from "./model.ts";
export function summary(
  samples: Sample[],
  start: number,
  baselineSeconds: number,
) {
  let sum = 0,
    peak = 0,
    baselineSum = 0,
    baselineCount = 0,
    gaps = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    sum += p.bpm;
    peak = Math.max(peak, p.bpm);
    if (p.t < start + baselineSeconds * 1000) {
      baselineSum += p.bpm;
      baselineCount++;
    }
    if (i && p.t - samples[i - 1].t > 10000) gaps++;
  }
  return {
    count: samples.length,
    mean: samples.length ? sum / samples.length : null,
    peak: samples.length ? peak : null,
    baseline: baselineCount ? baselineSum / baselineCount : null,
    gaps,
  };
}
// Peak-preserving min/max buckets. Rendering stays bounded regardless of session length.
export function downsample(samples: Sample[], budget = 600): Sample[] {
  if (samples.length <= budget) return samples;
  const result: Sample[] = [samples[0]],
    step = (samples.length - 2) / Math.floor((budget - 2) / 2);
  for (let k = 0; k < Math.floor((budget - 2) / 2); k++) {
    const a = 1 + Math.floor(k * step),
      b = Math.min(samples.length - 1, 1 + Math.floor((k + 1) * step));
    let lo = a,
      hi = a;
    for (let i = a; i < b; i++) {
      if (samples[i].bpm < samples[lo].bpm) lo = i;
      if (samples[i].bpm > samples[hi].bpm) hi = i;
    }
    if (lo <= hi) {
      result.push(samples[lo]);
      if (hi !== lo) result.push(samples[hi]);
    } else result.push(samples[hi], samples[lo]);
  }
  result.push(samples.at(-1)!);
  return result;
}
export function nearest(
  samples: Sample[],
  t: number,
  maxDistance = 10000,
): Sample | null {
  let l = 0,
    r = samples.length;
  while (l < r) {
    const m = (l + r) >>> 1;
    if (samples[m].t < t) l = m + 1;
    else r = m;
  }
  const candidates = [samples[l], samples[l - 1]].filter(Boolean);
  const p = candidates.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  return p && Math.abs(p.t - t) <= maxDistance ? p : null;
}
export function eventWindow(
  samples: Sample[],
  event: Pick<TradeEvent, "t">,
  seconds: number,
) {
  const before = samples.filter(
    (p) => p.t >= event.t - seconds * 1000 && p.t < event.t,
  );
  const after = samples.filter(
    (p) => p.t >= event.t && p.t <= event.t + seconds * 1000,
  );
  const avg = (p: Sample[]) =>
    p.length ? p.reduce((a, b) => a + b.bpm, 0) / p.length : null;
  return {
    before: avg(before),
    after: avg(after),
    at: nearest(samples, event.t)?.bpm ?? null,
  };
}
// A position runs from its first known entry until all its quantity is closed.
// Partial exits and scale-ins remain in that window; accounts never cross-pair.
export function positionWindow(samples: Sample[], events: TradeEvent[], selected: TradeEvent, seconds: number, viewEnd: number) {
  const usable = (e: TradeEvent) => !e.voided && e.kind !== "fill" &&
    e.timePrecision !== "day" && !["alert", "strategy", "backtest"].includes(e.provenance || "");
  if (!usable(selected)) return null;
  const account = (e: TradeEvent) => e.broker?.accountId || e.account || "";
  const instrument = (e: TradeEvent) => e.instrument?.id || e.symbol;
  const rows = events.filter((e) => usable(e) && e.t <= viewEnd &&
    account(e) === account(selected) && instrument(e) === instrument(selected) && e.side === selected.side)
    .sort((a, b) => a.t - b.t);
  let quantity = 0, start: number | undefined, contains = false, approximate = false;
  let closedAt: number | undefined;
  for (const row of rows) {
    if (row.kind === "entry") {
      if (quantity === 0) { start = row.t; contains = false; approximate = false; }
      quantity += row.quantity;
    } else {
      if (quantity === 0) continue;
      // Incomplete position history cannot establish a reliable holding window.
      if (row.quantity > quantity + 1e-8) return null;
      quantity = Math.max(0, quantity - row.quantity);
    }
    contains ||= row.id === selected.id;
    approximate ||= row.timestampSource === "order-update";
    if (quantity < 1e-8) {
      quantity = 0;
      if (contains) { closedAt = row.t; break; }
      start = undefined;
    }
  }
  if (!contains || start === undefined) return null;
  const end = closedAt ?? viewEnd;
  const before = samples.filter((p) => p.t >= start - seconds * 1000 && p.t < start);
  const during = samples.filter((p) => p.t >= start && p.t <= end);
  const after = closedAt === undefined ? [] : samples.filter((p) => p.t > end && p.t <= end + seconds * 1000);
  const mean = (points: Sample[]) => points.length ? points.reduce((sum, p) => sum + p.bpm, 0) / points.length : null;
  return { start, end, closed: closedAt !== undefined, approximate, before: mean(before), during: mean(during), after: mean(after), count: during.length };
}

export function decodeHeartRate(value: DataView): number | null {
  if (value.byteLength < 2) return null;
  const is16 = (value.getUint8(0) & 1) !== 0;
  if (is16 && value.byteLength < 3) return null;
  // Contact-supported flag with no detected contact is not a usable sample.
  const flags = value.getUint8(0);
  if ((flags & 4) !== 0 && (flags & 2) === 0) return null;
  const bpm = is16 ? value.getUint16(1, true) : value.getUint8(1);
  return bpm >= 25 && bpm <= 240 ? bpm : null;
}
