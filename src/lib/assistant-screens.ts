import type { AssistantLink } from "./assistant-links";
import { topicStems, wordStem } from "./assistant-journal";
import { ideaStats } from "./journal-reference";
import { money, type Session } from "./model";
import { sessionIdeas, positionIdeas, type TradeIdea } from "./position-ideas";
import { dateInZone } from "./process/model";
import { PeriodError, resolvePeriod, weekdayOf, type RecordSync } from "./process/periods";
import { groupSessionDays } from "./session-days";
import { stillnessLibraryResults } from "./stillness-catalogue";
import { eventOrigin, isActualExecution, pnlByCurrency } from "./trade-context";

// Read-only. Totals come from the helpers behind Saved sessions and the weekly review. Results
// are built field by field, so account IDs, recording names and heart rate are never included.

/** The most individual trades one answer can send to the model. Totals always cover every trade. */
export const MAX_TRADES = 60;
export const MAX_PRACTICES = 6;

export type Amount = { currency: string; amount: number; text: string };
export type TradeRow = {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  status: "closed" | "open";
  entryTime: string;
  exitTime: string | null;
  entryPrice: number;
  exitPrice: number | null;
  pnl: Amount | null;
  /** Where the record came from, such as "CSV · Execution". */
  source: string;
  link: AssistantLink;
};
export type RecordingRow = { start: string; end: string | null; source: string; link: AssistantLink };
export type SessionHistoryDay = {
  date: string;
  weekday: string;
  recordings: number;
  reflections: number;
  orders: number;
  closedTrades: number;
  realised: Amount[];
  sessions: RecordingRow[];
  trades: TradeRow[];
};
export type TradeExtreme = { currency: string; largestGain: ExtremeTrade | null; largestLoss: ExtremeTrade | null };
type ExtremeTrade = { symbol: string; date: string; pnl: string };
export type SessionHistory = {
  label: string;
  from: string;
  to: string;
  timezone: string;
  sync: RecordSync;
  result: "found" | "empty" | "no-match";
  symbol: string | null;
  totals: {
    recordings: number;
    orders: number;
    closedTrades: number;
    realised: Amount[];
    /** Closed trades with a recorded P&L, the basis for the win rate. */
    completedWithKnownPnl: number;
    /** Written with its percent sign, so an answer can't lose the unit. */
    winRate: string | null;
    extremes: TradeExtreme[];
  };
  days: SessionHistoryDay[];
  /** Individual trades left out to stay within the limit. They still count in the totals. */
  omittedTrades: number;
};

const amount = ([currency, value]: readonly [string, number]): Amount => ({
  currency,
  amount: Number(value.toFixed(2)),
  text: `${value > 0 ? "+" : ""}${money(value, currency)}`,
});
const clock = (at: number, timezone: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(at);
const price = (value: number) => Number(value.toFixed(6));

function tradeRow(session: Session, idea: TradeIdea, timezone: string): TradeRow {
  const entry = session.events.find((event) => event.id === idea.entryEventId);
  return {
    symbol: idea.symbol,
    side: idea.side as "long" | "short",
    quantity: idea.quantity,
    status: idea.exit === undefined ? "open" : "closed",
    entryTime: clock(idea.entry, timezone),
    exitTime: idea.exit === undefined ? null : clock(idea.exit, timezone),
    entryPrice: price(idea.entryPrice),
    exitPrice: idea.exitPrice === undefined ? null : price(idea.exitPrice),
    pnl: idea.pnl !== undefined && Number.isFinite(idea.pnl) ? amount([idea.currency, idea.pnl]) : null,
    source: entry ? eventOrigin(entry) : "Recorded execution",
    link: { sessionId: session.id, at: idea.entry },
  };
}

function extremes(ideas: { idea: TradeIdea; date: string }[]): TradeExtreme[] {
  const known = ideaStats(ideas.map((row) => row.idea)).eligible;
  const rows = ideas.filter((row) => known.includes(row.idea));
  return [...new Set(rows.map((row) => row.idea.currency))].map((currency) => {
    const sorted = rows.filter((row) => row.idea.currency === currency).sort((a, b) => b.idea.pnl! - a.idea.pnl!);
    const pick = (row: (typeof rows)[number] | undefined) =>
      row ? { symbol: row.idea.symbol, date: row.date, pnl: amount([currency, row.idea.pnl!]).text } : null;
    return {
      currency,
      largestGain: pick(sorted[0]?.idea.pnl! > 0 ? sorted[0] : undefined),
      largestLoss: pick(sorted.at(-1)?.idea.pnl! < 0 ? sorted.at(-1) : undefined),
    };
  });
}

/** Saved sessions and recorded trades for a period, optionally for one symbol. */
export function sessionHistory(
  sessions: Session[],
  owner: string,
  input: unknown,
  now: number,
  timezone: string,
  sync: RecordSync,
): SessionHistory {
  const { symbol: asked, ...range } = (input ?? {}) as { symbol?: unknown } & Record<string, unknown>;
  const period = resolvePeriod(range, dateInZone(now, timezone));
  if (asked !== undefined && (typeof asked !== "string" || !asked.trim()))
    throw new PeriodError("Ask about one symbol, such as ES.");
  const symbol = typeof asked === "string" ? asked.trim().toUpperCase() : null;
  const matches = (name: string) => !symbol || name.toUpperCase() === symbol;
  const dates = new Set(period.dates);
  const saved = sessions.filter(
    (s) => s.owner === owner && !s.demo && s.id !== "workspace" && dates.has(dateInZone(s.startedAt, timezone)),
  );
  const rows: { date: string; session: Session; idea: TradeIdea }[] = [];
  const grouped = groupSessionDays(saved)
    .map((day) => ({ day, date: dateInZone(day.date, timezone), events: day.events.filter((event) => matches(event.symbol)) }))
    .filter(({ events }) => !symbol || events.length)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const { day, date } of grouped)
    for (const session of [...day.sessions].reverse())
      for (const idea of sessionIdeas(session)) if (matches(idea.symbol)) rows.push({ date, session, idea });
  const newestFirst = [...rows].sort((a, b) => b.idea.entry - a.idea.entry);
  const shown = new Set(newestFirst.slice(0, MAX_TRADES).map((row) => row.idea));
  const days = grouped.map(({ day, date, events }): SessionHistoryDay => ({
    date,
    weekday: weekdayOf(date),
    recordings: day.sessions.length,
    reflections: day.entries.length,
    orders: events.filter(isActualExecution).length,
    closedTrades: positionIdeas(events).filter((trade) => trade.exit).length,
    realised: pnlByCurrency(events).map(amount),
    sessions: [...day.sessions].reverse().map((session) => ({
      start: clock(session.startedAt, timezone),
      end: session.endedAt ? clock(session.endedAt, timezone) : null,
      source: session.source,
      link: { sessionId: session.id },
    })),
    trades: rows
      .filter((row) => row.date === date && shown.has(row.idea))
      .map((row) => tradeRow(row.session, row.idea, timezone)),
  }));
  const stats = ideaStats(rows.map((row) => row.idea));
  return {
    label: period.label,
    from: period.from,
    to: period.to,
    timezone,
    sync,
    result: days.length ? "found" : symbol && saved.length ? "no-match" : "empty",
    symbol,
    totals: {
      recordings: days.reduce((sum, day) => sum + day.recordings, 0),
      orders: days.reduce((sum, day) => sum + day.orders, 0),
      closedTrades: days.reduce((sum, day) => sum + day.closedTrades, 0),
      realised: pnlByCurrency(grouped.flatMap((row) => row.events)).map(amount),
      completedWithKnownPnl: stats.completed,
      winRate: stats.winRate === null ? null : `${Number(stats.winRate.toFixed(1))}%`,
      extremes: extremes(rows),
    },
    days,
    omittedTrades: rows.length - shown.size,
  };
}

export type PracticeRow = {
  name: string;
  kind: string;
  duration: string;
  focus: string[];
  description: string;
  steps: string[];
  question: string;
  link: AssistantLink;
};
export type StillnessPractices = {
  focus: string | null;
  kind: string | null;
  query: string | null;
  maxMinutes: number | null;
  result: "found" | "no-match";
  practices: PracticeRow[];
  omitted: number;
};

/** Adds up a library duration such as "5 min away + 2 min guided" or "30 sec". */
export function practiceMinutes(duration: string) {
  return [...duration.matchAll(/(\d+)\s*(sec|min)/g)].reduce(
    (sum, [, value, unit]) => sum + Number(value) / (unit === "sec" ? 60 : 1),
    0,
  );
}

/** Finds practices in the same library and with the same filters as the Stillness screen. */
export function stillnessPractices(input: unknown): StillnessPractices {
  const { focus, kind, query, maxMinutes } = (input ?? {}) as {
    focus?: string;
    kind?: string;
    query?: string;
    maxMinutes?: number;
  };
  const asked = query ? topicStems(query) : [];
  if (query !== undefined && !asked.length) throw new PeriodError("Ask about a word or short phrase, such as “waiting”.");
  // "After a loss" is about the loss. Connecting words only count when nothing else was asked.
  const specific = asked.filter((stem) => !["after", "befor", "dur", "when", "whil", "help", "practic"].includes(stem));
  const stems = specific.length ? specific : asked;
  const library = stillnessLibraryResults({ filter: kind ?? "All", tags: focus ? [focus] : [] });
  const searchable = library.map((item) =>
    ([item.name, item.desc, ...item.tags].join(" ").toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map(wordStem),
  );
  const has = (words: string[], stem: string) => words.some((word) => word === stem || (stem.length >= 4 && word.startsWith(stem)));
  // A word few practices use says more about the question than a common one such as "after".
  const weight = (stem: string) => 1 / Math.max(1, searchable.filter((words) => has(words, stem)).length);
  const found = library
    .map((item, index) => ({ item, score: stems.reduce((sum, stem) => sum + (has(searchable[index], stem) ? weight(stem) : 0), 0) }))
    .filter(({ item }) => maxMinutes === undefined || practiceMinutes(item.duration) <= maxMinutes)
    .filter((row) => !stems.length || row.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    focus: focus ?? null,
    kind: kind ?? null,
    query: query?.trim() ?? null,
    maxMinutes: maxMinutes ?? null,
    result: found.length ? "found" : "no-match",
    practices: found.slice(0, MAX_PRACTICES).map(({ item }) => ({
      name: item.name,
      kind: item.kind,
      duration: item.duration,
      focus: item.tags,
      description: item.desc,
      steps: item.steps.map(([title]) => title),
      question: item.question,
      link: { stillness: item.id },
    })),
    omitted: Math.max(0, found.length - MAX_PRACTICES),
  };
}
