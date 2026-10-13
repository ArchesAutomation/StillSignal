import type { Sample, TradeEvent } from "./model";
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
