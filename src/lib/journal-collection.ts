import type { JournalEntry, Session } from "./model";
import { mergeNotes } from "./smart-journal";
import { mergeEvents } from "./trade-context";
import { isTradeSection, sessionTrades } from "./journal-routing";

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function journalDaySessions(current: Session, history: Session[]) {
  return [current, ...history.filter(s => s.id !== current.id)]
    .filter(s => s.owner === current.owner && dayKey(s.startedAt) === dayKey(current.startedAt));
}

/** Routing and numbering are shared by all recordings on the selected day. */
export function dailyJournalSession(current: Session, history: Session[]): Session {
  const sessions = journalDaySessions(current, history);
  return { ...current, events: mergeEvents(...sessions.map(s => s.events)),
    journal: mergeNotes(...sessions.map(s => s.journal)) };
}

export function journalPlacement(note: JournalEntry, session: Session, trades = sessionTrades(session)) {
  const trade = trades.find(t => t.id === note.tradeId || !!note.tradeId && t.entryIds.includes(note.tradeId));
  // Only explicit destinations are authoritative. A nearby fill is HR context,
  // and does not establish which trade or stage the trader was writing about.
  const section = note.section === "stillness" ? undefined : note.section;
  const unsorted = !section || (isTradeSection(section) && !trade) || (!!note.tradeId && !trade);
  return { trade, section, unsorted };
}

export function collectedNotes(session: Session, tradeId = "", section = "") {
  const trades = sessionTrades(session);
  return mergeNotes(session.journal).filter(n => !n.deletedAt)
    .filter(n => !tradeId || n.tradeId === tradeId)
    .filter(n => !section || (section === "unsorted" ? journalPlacement(n, session, trades).unsorted : journalPlacement(n, session, trades).section === section))
    .sort((a, b) => b.t - a.t || a.id.localeCompare(b.id));
}

export function journalSources(note: JournalEntry) {
  const labels: string[] = [];
  if (note.origin === "stillness" || note.section === "stillness") labels.push("Stillness");
  if (note.origin === "timeline") labels.push("Timeline reflection");
  if (note.support || note.section === "post-session") labels.push("Post-session support");
  if (note.prompt) labels.push("Prompt answer");
  if (note.source === "voice") labels.push("Voice reflection");
  if (note.source === "hr-checkin") labels.push("HR check-in");
  if (note.screenshot) labels.push("Screenshot");
  if (!labels.length) labels.push(note.origin === "free-writing" ? "Free writing" : note.source === "typed" ? "Written reflection" : "Reflection");
  return labels;
}
