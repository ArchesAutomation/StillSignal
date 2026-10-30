import { nearest } from "./analytics";
import type { JournalEntry, Sample, Session, TradeEvent } from "./model";
import { liveNotes, mergeNotes, reconstructTrades } from "./smart-journal";
import { isActualExecution, mergeEvents } from "./trade-context";
import { noteTime } from "./journal-routing";
import { sessionIdeas } from "./position-ideas";

export type JourneyStage = {
  key: "before" | "entry" | "management" | "exit" | "after";
  title: string;
  bpm: number | null;
  sampleCount: number;
  notes: JournalEntry[];
};
export type TradeJourney = {
  id: string;
  symbol: string;
  side: TradeEvent["side"];
  quantity: number;
  entry: number;
  exit?: number;
  entryPrice: number;
  exitPrice?: number;
  currency: string;
  pnl?: number;
  approximate: boolean;
  dayOnly: boolean;
  standalone: boolean;
  eventKind?: TradeEvent["kind"];
  stages: JourneyStage[];
};

const lowerBound = (samples: Sample[], t: number) => {
  let low = 0,
    high = samples.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (samples[mid].t < t) low = mid + 1;
    else high = mid;
  }
  return low;
};
const mean = (samples: Sample[], start: number, end: number) => {
  if (end <= start) return { bpm: null, sampleCount: 0 };
  const first = lowerBound(samples, start),
    last = lowerBound(samples, end);
  if (first === last) return { bpm: null, sampleCount: 0 };
  let total = 0;
  for (let i = first; i < last; i++) total += samples[i].bpm;
  return { bpm: Math.round(total / (last - first)), sampleCount: last - first };
};
const at = (samples: Sample[], t: number) => {
  const point = nearest(samples, t);
  return { bpm: point?.bpm ?? null, sampleCount: point ? 1 : 0 };
};

export function buildTradeJourneys(
  session: Session,
  samples: Sample[],
): TradeJourney[] {
  const events = mergeEvents(session.events).filter(isActualExecution);
  const notes = liveNotes(mergeNotes(session.journal));
  const positions = sessionIdeas(session);
  const covered = new Set<string>();
  const journeys: TradeJourney[] = [];
  const add = (
    id: string,
    symbol: string,
    side: TradeEvent["side"],
    quantity: number,
    entry: number,
    exit: number | undefined,
    entryPrice: number,
    exitPrice: number | undefined,
    entryEvent: TradeEvent | undefined,
    exitEvent: TradeEvent | undefined,
    standalone: boolean,
  ) => {
    const dayOnly =
      entryEvent?.timePrecision === "day" || exitEvent?.timePrecision === "day";
    const approximate =
      entryEvent?.timestampSource === "order-update" ||
      exitEvent?.timestampSource === "order-update";
    const latest =
      session.endedAt ?? samples.at(-1)?.t ?? events.at(-1)?.t ?? entry;
    const end = exit ?? Math.max(entry, latest);
    const instrumentId =
      entryEvent?.instrument?.id || exitEvent?.instrument?.id;
    const around = dayOnly
      ? []
      : notes.filter((note) => {
          if (note.tradeId) return note.tradeId === entryEvent?.id;
          const timestamp = noteTime(note);
          if (timestamp === null) return false;
          if (
            timestamp < entry - 600000 ||
            timestamp >
              (standalone
                ? entry + 600000
                : exit === undefined
                  ? end
                  : exit + 600000)
          )
            return false;
          if (
            note.captureScope?.instrumentId &&
            instrumentId &&
            note.captureScope.instrumentId !== instrumentId
          )
            return false;
          const linkedEvent =
            note.context?.eventId &&
            events.find((event) => event.id === note.context?.eventId);
          if (
            linkedEvent &&
            (linkedEvent.instrument?.id || linkedEvent.symbol) !==
              (instrumentId || symbol)
          )
            return false;
          return true;
        });
    const byStage = (key: JourneyStage["key"]) =>
      around.filter((note) => {
        if (note.section) return note.section === key;
        const timestamp = noteTime(note);
        if (timestamp === null) return false;
        if (standalone)
          return key === "before"
            ? timestamp < entry
            : key === "entry"
              ? timestamp === entry
              : key === "after" && timestamp > entry;
        if (key === "before") return timestamp < entry;
        if (key === "entry") return timestamp === entry;
        if (key === "management") return timestamp > entry && timestamp < end;
        if (key === "exit") return exit !== undefined && timestamp === exit;
        return exit !== undefined && timestamp > exit;
      });
    const stage = (
      key: JourneyStage["key"],
      title: string,
      reading: ReturnType<typeof mean>,
    ): JourneyStage => ({
      key,
      title,
      bpm: dayOnly ? null : reading.bpm,
      sampleCount: dayOnly ? 0 : reading.sampleCount,
      notes: byStage(key),
    });
    const stages: JourneyStage[] = [
      stage("before", "10 min before", mean(samples, entry - 600000, entry)),
      stage("entry", standalone ? "Execution" : "At entry", at(samples, entry)),
    ];
    if (!standalone) {
      stages.push(
        stage(
          "management",
          exit === undefined ? "While open" : "During trade",
          mean(samples, entry, end),
        ),
      );
      if (exit !== undefined)
        stages.push(
          stage("exit", "At exit", at(samples, exit)),
          stage(
            "after",
            "10 min after",
            mean(samples, exit + 1, exit + 600001),
          ),
        );
    } else
      stages.push(
        stage(
          "after",
          "10 min after",
          mean(samples, entry + 1, entry + 600001),
        ),
      );
    journeys.push({
      id,
      symbol,
      side,
      quantity,
      entry,
      exit,
      entryPrice,
      exitPrice,
      currency: exitEvent?.currency || entryEvent?.currency || "USD",
      pnl:
        exitEvent &&
        positions.filter((position) => position.exitEventId === exitEvent.id)
          .length === 1
          ? exitEvent.pnl
          : standalone
            ? entryEvent?.pnl
            : undefined,
      approximate: !!approximate,
      dayOnly: !!dayOnly,
      standalone,
      eventKind: standalone ? entryEvent?.kind : undefined,
      stages,
    });
  };
  for (const [index, trade] of positions.entries()) {
    const entryEvent = events.find((event) => event.id === trade.entryEventId);
    const exitEvent = events.find((event) => event.id === trade.exitEventId);
    if (entryEvent) covered.add(entryEvent.id);
    if (exitEvent) covered.add(exitEvent.id);
    trade.fillIds.forEach((id) => covered.add(id));
    add(
      `position-${index}`,
      trade.symbol,
      trade.side,
      trade.quantity,
      trade.entry,
      trade.exit,
      trade.entryPrice,
      trade.exitPrice,
      entryEvent,
      exitEvent,
      false,
    );
    journeys.at(-1)!.pnl = trade.pnl;
  }
  for (const event of events) {
    if (covered.has(event.id)) continue;
    add(
      `event-${event.id}`,
      event.symbol,
      event.side,
      event.quantity,
      event.t,
      undefined,
      event.price,
      undefined,
      event,
      undefined,
      true,
    );
  }
  return journeys.sort((a, b) => a.entry - b.entry || a.id.localeCompare(b.id));
}
