import type { AssistantLink, JournalLink } from "./assistant-links";
import { BOOK_PAGE, BOOK_SILVER_LINING, bookPassages, bookText, isBookEntry } from "./journal-book";
import { noteTime } from "./journal-routing";
import type { JournalEntry, Session } from "./model";
import { dateInZone, type ProcessRecord } from "./process/model";
import { PeriodError, resolvePeriod, shiftDate, weekdayOf, MAX_DAYS, type RecordSync, type ResolvedPeriod } from "./process/periods";
import { supportHistory, type SupportPractice } from "./process/support-history";
import { tradingDayFor } from "./process/trading-day";
import { mergeNotes } from "./smart-journal";

// Everything here is read-only. Each result is built field by field, so audio, screenshots,
// heart rate, original transcripts, trades and P&L cannot reach the assistant by accident.

/** The most journal text one answer can send to the model. */
export const MAX_ENTRY_CHARS = 1500;
export const MAX_TOTAL_CHARS = 12000;
export const MAX_ENTRIES = 30;
const EXCERPT_BEFORE = 300;
const EXCERPT_AFTER = 500;

export type JournalReadEntry = {
  kind: string;
  /** HH:MM in the day's timezone, when the entry has a time. */
  time: string | null;
  label: string | null;
  question: string | null;
  text: string;
  /** Only part of the entry was read. */
  clipped: boolean;
  /** Used by the card. The server removes it before the result goes to the model. */
  link: JournalLink;
};
export type JournalReadDay = { date: string; weekday: string; entries: JournalReadEntry[] };
export type JournalHistory = {
  label: string;
  from: string;
  to: string;
  timezone: string;
  sync: RecordSync;
  result: "found" | "empty" | "no-match";
  topic: string | null;
  days: JournalReadDay[];
  /** Matching entries left out to stay within the limits above. */
  omitted: number;
};
export type DoneDay = {
  date: string;
  weekday: string;
  outcome: string | null;
  process: string | null;
  practices: SupportPractice[];
  writing: JournalReadEntry[];
  /** Today opens Done for the Day. Past days have no Done screen, so they open that day's Journal. */
  link: AssistantLink;
};
export type DoneHistory = {
  label: string;
  from: string;
  to: string;
  timezone: string;
  sync: RecordSync;
  result: "found" | "empty";
  days: DoneDay[];
  omitted: number;
  /** "What changed?" stays on the Done screen for that day and is never stored. */
  whatChanged: "not-saved";
  completion: "not-recorded";
};

const outcomes: Record<string, string> = {
  profit: "Profit",
  loss: "Loss",
  breakeven: "Breakeven",
  "no-trade": "No trade",
  "rather-not-say": "Rather not say",
};
// Older days may hold "not-reviewed". The Done screen shows that as no answer, so this does too.
const processes: Record<string, string> = { followed: "Followed it", partial: "Partly", broken: "Not today" };
const stages: Record<string, string> = {
  before: "Before the trade",
  entry: "Entry",
  management: "Management",
  exit: "Exit",
  after: "After the trade",
  "day-review": "Day review",
  "post-session": "After the session",
  stillness: "Stillness reflection",
};

const ignored = new Set("a an and about at did do for from i in is it me my of on or the to was were what when with wrote write".split(" "));
const words = (text: string) => [...text.matchAll(/[\p{L}\p{N}']+/gu)].map((m) => ({ word: m[0].toLowerCase(), at: m.index }));

/** Reduces rushing, rushed and rushes to rush, so a topic finds the forms of its own word. */
export function wordStem(word: string) {
  const bare = word.toLowerCase().replace(/'s$/, "");
  const cut = bare.replace(/(ing|ed|es|e)$/, "").replace(/([^s])s$/, "$1");
  const single = cut !== bare && /([^aeiouslz])\1$/.test(cut) ? cut.slice(0, -1) : cut;
  return single.length >= 3 ? single : bare;
}

export function topicStems(topic: string) {
  return [...new Set(words(topic).map((w) => w.word).filter((w) => !ignored.has(w)).map(wordStem))];
}

/** Where the entry first mentions the topic, or -1 unless it mentions every word of it. */
export function topicPosition(text: string, stems: string[]) {
  const found = words(text).map((w) => ({ at: w.at, stem: wordStem(w.word) }));
  const hits = stems.map((stem) => found.find((w) => w.stem === stem || (stem.length >= 4 && w.stem.startsWith(stem)))?.at ?? -1);
  return hits.includes(-1) ? -1 : Math.min(...hits);
}

function excerpt(text: string, position: number | null) {
  if (position === null) {
    const clipped = text.length > MAX_ENTRY_CHARS;
    return { text: clipped ? `${text.slice(0, MAX_ENTRY_CHARS).trimEnd()}…` : text, clipped };
  }
  let start = Math.max(0, position - EXCERPT_BEFORE);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  const end = Math.min(text.length, position + EXCERPT_AFTER);
  const clipped = start > 0 || end < text.length;
  return { text: `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`, clipped };
}

type Source = Omit<JournalReadEntry, "text" | "clipped"> & { text: string; at: number; dayReview: boolean };

const clock = (at: number, timezone: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(at);

function noteSource(note: JournalEntry, sessionId: string, timezone: string): Source {
  const at = noteTime(note);
  return {
    kind: note.origin === "stillness" ? stages.stillness : stages[note.section ?? ""] ?? "Reflection",
    time: at === null ? null : clock(at, timezone),
    label: note.label?.trim() || null,
    question: note.prompt?.question ?? null,
    text: note.text.trim(),
    at: at ?? note.t,
    dayReview: note.section === "day-review",
    link: { sessionId, noteId: note.id, at: at ?? note.t },
  };
}

/** One day's writing, read the way the Journal screen merges a day's sessions. */
function daySources(sessions: Session[], timezone: string): Source[] {
  const journal = mergeNotes(...sessions.map((s) => s.journal));
  const day = { ...sessions[0], journal };
  const holder = (id: string) => sessions.find((s) => s.journal.some((n) => n.id === id))?.id ?? sessions[0].id;
  const book = ([[BOOK_PAGE, "Journal page"], [BOOK_SILVER_LINING, "Silver lining"]] as const).flatMap(([part, kind]): Source[] => {
    const text = bookText(day, part).trim();
    const first = bookPassages(day, part)[0];
    return text && first
      ? [{ kind, time: null, label: null, question: null, text, at: first.t, dayReview: true, link: { sessionId: holder(first.id), book: true } }]
      : [];
  });
  const notes = journal
    // A heart-rate check-in is a measurement prompt, not the trader's journal writing.
    .filter((n) => !n.deletedAt && !isBookEntry(n) && n.source !== "hr-checkin" && n.text.trim())
    .map((n) => noteSource(n, holder(n.id), timezone));
  const written = sessions
    .filter((s) => s.blueprint?.dailyWriting?.trim())
    .sort((a, b) => (b.blueprint!.dailyWritingUpdatedAt ?? b.blueprint!.updatedAt) - (a.blueprint!.dailyWritingUpdatedAt ?? a.blueprint!.updatedAt))[0];
  const daily: Source[] = written
    ? [{ kind: "Daily writing", time: null, label: null, question: null, text: written.blueprint!.dailyWriting!.trim(), at: written.startedAt, dayReview: false, link: { sessionId: written.id } }]
    : [];
  return [...daily, ...book, ...notes].sort((a, b) => a.at - b.at);
}

function sessionsByDate(sessions: Session[], owner: string, timezone: string) {
  const byDate = new Map<string, Session[]>();
  for (const session of sessions) {
    if (session.owner !== owner || session.demo || session.id === "workspace") continue;
    const date = dateInZone(session.startedAt, timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), session]);
  }
  return byDate;
}

/** Keeps the newest entries within the limits, then returns each day's entries in reading order. */
function withinLimits(found: { date: string; source: Source; position: number | null }[]) {
  let total = 0, omitted = 0;
  const kept = new Map<string, JournalReadEntry[]>();
  for (const { date, source, position } of [...found].sort((a, b) => b.date.localeCompare(a.date) || b.source.at - a.source.at)) {
    const part = excerpt(source.text, position);
    if (total + part.text.length > MAX_TOTAL_CHARS || [...kept.values()].flat().length >= MAX_ENTRIES) {
      omitted++;
      continue;
    }
    total += part.text.length;
    const { kind, time, label, question, link } = source;
    kept.set(date, [{ kind, time, label, question, link, ...part }, ...(kept.get(date) ?? [])]);
  }
  return { kept, omitted };
}

/** With a topic and no period, the search covers the longest range a question may ask about. */
export function journalPeriod(input: unknown, today: string): ResolvedPeriod {
  const { topic, ...period } = (input ?? {}) as { topic?: unknown } & Record<string, unknown>;
  if (topic !== undefined && !Object.keys(period).length) {
    const from = shiftDate(today, 1 - MAX_DAYS);
    const dates = Array.from({ length: MAX_DAYS }, (_, day) => shiftDate(from, day));
    return { label: `Last ${MAX_DAYS} days`, from, to: today, dates };
  }
  return resolvePeriod(period, today);
}

function journalTopic(input: unknown) {
  const topic = (input as { topic?: unknown } | null)?.topic;
  if (topic === undefined) return { topic: null, stems: [] };
  const stems = typeof topic === "string" ? topicStems(topic) : [];
  if (!stems.length) throw new PeriodError("Ask about a word or short phrase from your journal.");
  return { topic: (topic as string).trim(), stems };
}

/** What the trader wrote in the period, optionally only the passages mentioning a topic. */
export function journalHistory(
  sessions: Session[],
  owner: string,
  input: unknown,
  now: number,
  timezone: string,
  sync: RecordSync,
): JournalHistory {
  const period = journalPeriod(input, dateInZone(now, timezone));
  const { topic, stems } = journalTopic(input);
  const byDate = sessionsByDate(sessions, owner, timezone);
  const written = period.dates.flatMap((date) =>
    byDate.has(date) ? daySources(byDate.get(date)!, timezone).map((source) => ({ date, source })) : [],
  );
  const found = written.flatMap(({ date, source }): { date: string; source: Source; position: number | null }[] => {
    if (!stems.length) return [{ date, source, position: null }];
    const position = topicPosition(source.text, stems);
    return position < 0 ? [] : [{ date, source, position }];
  });
  const { kept, omitted } = withinLimits(found);
  return {
    label: period.label,
    from: period.from,
    to: period.to,
    timezone,
    sync,
    result: found.length ? "found" : written.length ? "no-match" : "empty",
    topic,
    days: period.dates.filter((date) => kept.has(date)).map((date) => ({ date, weekday: weekdayOf(date), entries: kept.get(date)! })),
    omitted,
  };
}

/** What Done for the Day saved: its two answers, practices added there and that day's writing. */
export function doneHistory(
  sessions: Session[],
  records: ProcessRecord[],
  owner: string,
  input: unknown,
  now: number,
  timezone: string,
  sync: RecordSync,
): DoneHistory {
  const today = dateInZone(now, timezone);
  const period = resolvePeriod(input, today);
  const support = supportHistory(records, input, now, timezone, sync);
  const byDate = sessionsByDate(sessions, owner, timezone);
  const { kept, omitted } = withinLimits(period.dates.flatMap((date) =>
    byDate.has(date)
      ? daySources(byDate.get(date)!, timezone).filter((s) => s.dayReview).map((source) => ({ date, source, position: null }))
      : [],
  ));
  const days = period.dates.flatMap((date, index): DoneDay[] => {
    const closeout = tradingDayFor(records, date, timezone)?.body.closeout;
    const day = {
      date,
      weekday: weekdayOf(date),
      outcome: outcomes[closeout?.outcome ?? ""] ?? null,
      process: processes[closeout?.process ?? ""] ?? null,
      practices: support.days[index].done,
      writing: kept.get(date) ?? [],
      link: date === today ? ({ page: "Done" } as const) : { date },
    };
    return day.outcome || day.process || day.practices.length || day.writing.length ? [day] : [];
  });
  return {
    label: period.label,
    from: period.from,
    to: period.to,
    timezone,
    sync,
    result: days.length ? "found" : "empty",
    days,
    omitted,
    whatChanged: "not-saved",
    completion: "not-recorded",
  };
}
