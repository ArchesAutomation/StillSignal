import type { JournalEntry, Session, TradeEvent } from "./model";
import { liveNotes, mergeNotes, reconstructTrades } from "./smart-journal";
import { isActualExecution, mergeEvents } from "./trade-context";

export type SessionDay = {
  key: string;
  date: number;
  sessions: Session[];
  entries: JournalEntry[];
  events: TradeEvent[];
  sampleCount: number;
  executedOrders: number;
  closedTrades: number;
  labels: { name: string; count: number }[];
};

const localDay = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

export function groupSessionDays(sessions: Session[]): SessionDay[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = localDay(session.startedAt);
    groups.set(key, [...(groups.get(key) || []), session]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const ordered = [...group].sort((a, b) => b.startedAt - a.startedAt);
      const entries = ordered
        .flatMap((session) => liveNotes(mergeNotes(session.journal)))
        .sort((a, b) => a.t - b.t);
      const events = mergeEvents(...ordered.map((session) => session.events)).filter((event) => !event.voided);
      const labels = new Map<string, number>();
      for (const entry of entries)
        if (entry.label) labels.set(entry.label, (labels.get(entry.label) || 0) + 1);
      return {
        key,
        date: ordered[0].startedAt,
        sessions: ordered,
        entries,
        events,
        sampleCount: ordered.reduce((count, session) => count + session.sampleCount, 0),
        executedOrders: events.filter(isActualExecution).length,
        closedTrades: reconstructTrades(events.filter(isActualExecution)).filter((trade) => trade.exit).length,
        labels: [...labels.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => b.date - a.date);
}
