import { nearest } from "./analytics";
import type { JournalEntry, Sample, Session } from "./model";
import { collectedNotes, journalPlacement } from "./journal-collection";
import { sessionTrades } from "./journal-routing";

export const tradePhases = [
  "before",
  "entry",
  "management",
  "exit",
  "after",
] as const;
export type TradePhase = (typeof tradePhases)[number];

/** A destination owns its time. A chart selection is never a fallback for another trade. */
export function journalPhaseLink(
  session: Session,
  tradeId: string,
  phase: JournalEntry["section"],
  samples: Sample[],
  now = Date.now(),
  knownTrade?: ReturnType<typeof sessionTrades>[number],
) {
  const trade =
    knownTrade ??
    sessionTrades(session).find(
      (t) => t.id === tradeId || t.entryIds.includes(tradeId),
    );
  if (!trade || !tradePhases.includes(phase as TradePhase)) return null;
  const entry = session.events.find((e) => e.id === trade.entryEventId);
  const exit = session.events.find((e) => e.id === trade.exitEventId);
  const preciseEntry =
    entry && entry.timePrecision !== "day" && Number.isFinite(entry.t);
  const preciseExit =
    exit && exit.timePrecision !== "day" && Number.isFinite(exit.t);
  const dayStart = new Date(session.startedAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const end = Math.min(now, dayEnd.getTime() - 1);
  let start: number, stop: number;
  if (phase === "exit" || phase === "after") {
    if (!preciseExit || trade.exit === undefined) return null;
    start = trade.exit;
    stop = phase === "after" ? Math.min(end, trade.exit + 600000) : start;
  } else {
    if (!preciseEntry) return null;
    start = trade.entry;
    stop = start;
    if (phase === "before")
      start = Math.max(dayStart.getTime(), trade.entry - 600000);
    if (phase === "management") {
      if (trade.exit !== undefined && !preciseExit) return null;
      stop = trade.exit ?? Math.min(end, session.endedAt ?? now);
    }
  }
  if (stop < start || start > end) return null;
  const t = Math.round((start + stop) / 2);
  const point = nearest(samples, t);
  // Windows exclude the execution itself for Before/After, as in analytics.
  let low = 0,
    high = samples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (samples[middle].t < start) low = middle + 1;
    else high = middle;
  }
  const points: Sample[] = start === stop ? (point ? [point] : []) : [];
  if (start !== stop)
    for (let i = low; i < samples.length && samples[i].t <= stop; i++) {
      if (
        (phase !== "before" || samples[i].t < stop) &&
        (phase !== "after" || samples[i].t > start)
      )
        points.push(samples[i]);
    }
  return {
    t,
    start,
    end: stop,
    point,
    bpm: points.length
      ? Math.round(points.reduce((sum, p) => sum + p.bpm, 0) / points.length)
      : null,
    sampleCount: points.length,
  };
}

/** Explicit ownership only: nearby notes remain Day-level/Unsorted until assigned. */
export function journalTradeGroups(session: Session) {
  const notes = collectedNotes(session);
  const trades = sessionTrades(session);
  return {
    trades: trades.map((trade) => ({
      trade,
      phases: tradePhases.map((phase) => ({
        phase,
        notes: notes
          .filter(
            (n) =>
              (n.tradeId === trade.id ||
                (!!n.tradeId && trade.entryIds.includes(n.tradeId))) &&
              n.section === phase,
          )
          .reverse(),
        executions: session.events
          .filter(
            (e) =>
              !e.voided &&
              (phase === "entry"
                ? trade.entryIds.includes(e.id)
                : phase === "exit" && trade.exitIds.includes(e.id)),
          )
          .map((e) =>
            trade.allocations?.[e.id] === undefined
              ? e
              : { ...e, quantity: trade.allocations[e.id] },
          ),
      })),
    })),
    ungrouped: notes.filter((n) => {
      const placement = journalPlacement(n, session, trades);
      return (
        placement.unsorted ||
        !placement.trade ||
        !tradePhases.includes(n.section as TradePhase)
      );
    }),
  };
}
