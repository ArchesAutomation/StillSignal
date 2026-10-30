import type { JournalEntry, Sample, Session } from "./model";
import { nearest } from "./analytics";
import { noteTime } from "./journal-routing";
import { captureMode } from "./session-timeline";
import { localInstant } from "./journal-reference";

export type MomentFilters = {
  search: string;
  trade: string;
  stage: string;
  capture: string;
};
export function filterMoments(session: Session, filters: MomentFilters) {
  return session.journal
    .filter((n) => {
      if (n.deletedAt && Date.now() - n.deletedAt > 600000) return false;
      if (
        filters.search &&
        !`${n.text} ${n.label}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      )
        return false;
      if (
        filters.trade === "session"
          ? !!n.tradeId
          : filters.trade && n.tradeId !== filters.trade
      )
        return false;
      if (
        filters.stage === "unassigned"
          ? !!n.section
          : filters.stage && n.section !== filters.stage
      )
        return false;
      if (filters.capture === "unlabelled")
        return !n.label || n.label === "Unlabelled";
      return (
        !filters.capture ||
        captureMode(n) ===
          (filters.capture === "live" ? "LIVE" : "POST-SESSION")
      );
    })
    .sort(
      (a, b) =>
        (noteTime(a) ?? a.capturedAt ?? a.t) -
        (noteTime(b) ?? b.capturedAt ?? b.t),
    );
}

/** One match definition for the row, evidence and label summary. Never match a day note. */
export function momentHeartRate(
  session: Session,
  samples: Sample[],
  note: JournalEntry,
) {
  const at = noteTime(note);
  if (at === null) return null;
  if (
    session.blueprint?.measurementPauses?.some(
      (p) => at >= p.start && at <= (p.end ?? Infinity),
    )
  )
    return null;
  const point = nearest(
    samples.filter(
      (p) =>
        p.quality !== "artifact" &&
        !session.blueprint?.measurementPauses?.some(
          (g) => p.t >= g.start && p.t <= (g.end ?? Infinity),
        ),
    ),
    at,
    10000,
  );
  return point?.bpm ?? note.context?.bpm ?? null;
}

export type ChartRange = [number, number];
export function clampChartRange(
  range: ChartRange,
  bounds: ChartRange,
): ChartRange {
  const width = Math.min(
    bounds[1] - bounds[0],
    Math.max(1000, range[1] - range[0]),
  );
  const start = Math.max(bounds[0], Math.min(bounds[1] - width, range[0]));
  return [start, start + width];
}
export function fitJournalRange(
  session: Session,
  bounds: ChartRange,
): ChartRange {
  const precise = session.events.filter(
    (e) => !e.voided && e.timePrecision !== "day",
  );
  const times = [
    ...precise.map((e) => e.t),
    ...session.journal
      .filter((n) => !n.deletedAt)
      .flatMap((n) => (noteTime(n) === null ? [] : [noteTime(n)!])),
  ];
  const plan = session.blueprint?.plan;
  if (plan) {
    try {
      const zone =
        session.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(session.startedAt));
      times.push(localInstant(`${day}T${plan.start}`, zone));
      const end = localInstant(`${day}T${plan.end}`, zone);
      if (plan.end > plan.start) times.push(end);
    } catch {
      /* Invalid or ambiguous plan times do not alter raw data. */
    }
  }
  if (!times.length) return bounds;
  const start = Math.min(...times),
    end = Math.max(...times);
  const pad = Math.max(60000, (end - start) * 0.08);
  return clampChartRange([start - pad, end + pad], bounds);
}
