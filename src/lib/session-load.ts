import type { Sample, Settings } from "./model";
import { detectHrMoments } from "./smart-journal";
export function measureLoad(samples: Sample[], settings: Pick<Settings, "baselineSeconds" | "threshold">) {
  const moments = detectHrMoments(samples, settings);
  const complete = samples.length >= 30 && (samples.at(-1)?.t ?? 0) - (samples[0]?.t ?? 0) >= settings.baselineSeconds * 1000;
  const windows = moments.map(moment => {
    const points = samples.filter(p => p.t >= moment.t && p.t <= moment.end);
    const peak = points.find(p => p.bpm === moment.peak)?.t ?? moment.t;
    const afterPeak = points.filter(p => p.t >= peak);
    const recovery = afterPeak.find(p => p.bpm < moment.baseline + settings.threshold / 2);
    const continuous = afterPeak.every((p, i) => !i || p.t - afterPeak[i - 1].t <= 10000);
    return { ...moment, duration: (moment.end - moment.t) / 1000, recovery: continuous && recovery ? (recovery.t - peak) / 1000 : null };
  });
  return {
    complete, windows, count: moments.length,
    magnitude: windows.length ? windows.reduce((a, m) => a + m.delta, 0) / windows.length : 0,
    duration: windows.reduce((a, m) => a + m.duration, 0),
    recovery: windows.some(m => m.recovery !== null) ? windows.reduce((a, m) => a + (m.recovery ?? 0), 0) / windows.filter(m => m.recovery !== null).length : null,
  };
}
export function compareLoad(current: ReturnType<typeof measureLoad>, history: ReturnType<typeof measureLoad>[]) {
  const usable = history.filter(h => h.complete);
  if (!current.complete || usable.length < 10)
    return { label: "Provisional", count: usable.length, reasons: ["Showing recorded components while personal history builds."] };
  const reasons: string[] = [];
  for (const [key, title] of [["count", "Number of rises"], ["magnitude", "Average rise above baseline"], ["duration", "Total rise duration"], ["recovery", "Recovery time"]] as const) {
    const values = usable.map(h => h[key]).filter((v): v is number => v !== null).sort((a, b) => a - b);
    if (current[key] !== null && values.length >= 10 && current[key]! > values[Math.floor((values.length - 1) * .9)])
      reasons.push(`${title} above your recent personal range.`);
  }
  return { label: reasons.length ? "Unusual for you" : "Within recent range", count: usable.length, reasons: reasons.length ? reasons : ["Components are within the range of your recent recordings."] };
}
