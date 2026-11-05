import type { Sample } from "./model";
import { nearest } from "./analytics";
/** A nearby observation, never an interpolation across a measurement pause. */
export function measuredSampleAt(samples: Sample[], at: number, pauses: { start: number; end?: number }[] = []) {
  if (pauses.some(p => at >= p.start && at <= (p.end ?? Infinity))) return null;
  const candidates = samples.filter(p => p.quality !== "artifact" && Number.isFinite(p.t) && Number.isFinite(p.bpm) && !pauses.some(g =>
    Math.min(at, p.t) <= (g.end ?? Infinity) && Math.max(at, p.t) >= g.start,
  ));
  return nearest(candidates.sort((a,b) => a.t-b.t), at, 10000);
}
