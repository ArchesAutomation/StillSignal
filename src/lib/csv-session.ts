import { Temporal } from "@js-temporal/polyfill";
import type { Session, TradeEvent } from "./model";

export type CsvDestination = "daily" | "new" | "current";

// Match calendar days in the export's timezone, including DST and overnight
// recordings. Trade timestamps themselves remain UTC instants.
export function planCsvSessions(
  events: TradeEvent[],
  sessions: Session[],
  owner: string,
  timezone: string,
  preferredId?: string,
  activeId?: string,
) {
  const groups = new Map<string, TradeEvent[]>();
  for (const event of events) {
    const day = Temporal.Instant.fromEpochMilliseconds(event.t)
      .toZonedDateTimeISO(timezone).toPlainDate().toString();
    groups.set(day, [...(groups.get(day) || []), event]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => {
    const start = Temporal.PlainDate.from(day).toZonedDateTime(timezone);
    const startAt = start.epochMilliseconds;
    const endAt = start.add({ days: 1 }).epochMilliseconds;
    const candidates = sessions.filter((s) =>
      s.owner === owner && s.id !== "workspace" &&
      !s.events.some((e) => e.provenance === "backtest") &&
      s.startedAt < endAt &&
      (s.endedAt ?? (s.id === activeId ? Date.now() : Math.max(s.startedAt, s.events.at(-1)?.t ?? 0))) >= startAt,
    );
    candidates.sort((a, b) =>
      Number(b.id === preferredId) - Number(a.id === preferredId) ||
      b.sampleCount - a.sampleCount || a.startedAt - b.startedAt || a.id.localeCompare(b.id),
    );
    return { day, events: rows.sort((a, b) => a.t - b.t), session: candidates[0] };
  });
}

export function mergeCsvEvents(session: Session, events: TradeEvent[]): Session {
  const merged = new Map(session.events.map((e) => [e.id, e]));
  for (const event of events) {
    const old = merged.get(event.id);
    if (old && old.pnl !== event.pnl)
      throw new Error("This execution already exists with different P&L. Keep its original values or supply a different execution ID.");
    if (!old) merged.set(event.id, event);
  }
  if (merged.size > 5000) throw new Error("This session supports up to 5,000 events. Import a smaller period.");
  const all = [...merged.values()].sort((a, b) => a.t - b.t);
  return {
    ...session,
    // Recording bounds and identity are immutable in cloud storage. The
    // dashboard derives its display range from both recording and trade times.
    events: all,
  };
}
