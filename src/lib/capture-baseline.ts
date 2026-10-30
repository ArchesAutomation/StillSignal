import type { Sample, Session } from "./model";
import { isDemoSession } from "./demo-market";

// Give each completed session equal weight, regardless of its sample cadence.
export function previousSessionBaseline(
  sessions: { session: Session; samples: Sample[] }[],
  current: Pick<Session, "id" | "owner" | "startedAt">,
  seconds: number,
) {
  const means = sessions.flatMap(({ session, samples }) => {
    if (
      session.owner !== current.owner ||
      session.id === current.id ||
      isDemoSession(session) ||
      !session.endedAt ||
      session.endedAt > current.startedAt ||
      !samples.length
    )
      return [];
    const valid = samples
      .filter(
        (p) =>
          Number.isFinite(p.bpm) &&
          p.bpm >= 25 &&
          p.bpm <= 240 &&
          p.quality !== "artifact" &&
          p.t >= session.startedAt &&
          p.t <= session.endedAt! &&
          !session.blueprint?.measurementPauses?.some(
            (g) => p.t >= g.start && p.t <= (g.end ?? Infinity),
          ),
      )
      .sort((a, b) => a.t - b.t);
    if (!valid.length) return [];
    const opening = valid.filter((p) => p.t < valid[0].t + seconds * 1000);
    return [opening.reduce((n, p) => n + p.bpm, 0) / opening.length];
  });
  return {
    bpm: means.length ? means.reduce((n, v) => n + v, 0) / means.length : null,
    count: means.length,
  };
}
