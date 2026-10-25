import type { JournalEntry, Session } from "./model";
import { reconstructTrades } from "./smart-journal";
import { isActualExecution } from "./trade-context";

export const sections = ["before", "entry", "management", "exit", "after", "day-review", "post-session", "custom"] as const;
export const sectionName = (section?: JournalEntry["section"], custom?: string) =>
  !section ? "Unsorted" : section === "custom" ? custom || "Custom" : ({
    before: "Before", entry: "Entry", management: "Management", exit: "Exit",
    after: "After", "day-review": "Day review", "post-session": "Post-session support", stillness: "Private Stillness",
  }[section]);
export const isTradeSection = (section?: JournalEntry["section"]) =>
  !!section && ["before", "entry", "management", "exit", "after"].includes(section);
export const noteTime = (note: JournalEntry): number | null =>
  note.eventTime === undefined ? note.t : note.eventTime;
export const sessionTrades = (session: Session) =>
  [...new Map(reconstructTrades(session.events.filter(isActualExecution))
    .map(t => [t.entryEventId!, { ...t, id: t.entryEventId! }])).values()]
    .sort((a, b) => a.entry - b.entry || a.id.localeCompare(b.id));
export function destination(note: Pick<JournalEntry, "section" | "customSection" | "tradeId">, session: Session) {
  const index = sessionTrades(session).findIndex(t => t.id === note.tradeId);
  return (index >= 0 ? `Trade ${index + 1} · ` : isTradeSection(note.section) ? "Trade unassigned · " : "") + (!note.section || note.section === "stillness" ? "Unsorted" : sectionName(note.section, note.customSection));
}
export function validateDestination(note: JournalEntry, session: Session) {
  if (note.deletedAt) return;
  // Unknown ownership is a valid Unsorted record; never lose someone's words
  // or infer a trade from the nearest execution.
  if (note.tradeId && !sessionTrades(session).some(t => t.id === note.tradeId))
    throw new Error("Choose a trade from this journal day.");
  if (note.section === "custom" && !note.customSection?.trim())
    throw new Error("Name your journal section.");
}
export function supportResponse(outcome: "loss" | "profit" | "breakeven", adherence: "followed" | "broken" | "partly") {
  if (adherence === "broken")
    return outcome === "profit"
      ? "Profit does not make a rule break disciplined. Name the rule and one controllable correction."
      : "Describe the rule you broke without judging yourself. What is the next controllable correction?";
  if (adherence === "partly")
    return "Recognise what followed the plan, then name what needs correction. The result does not erase either.";
  return outcome === "loss"
    ? "You followed your rules. One valid loss does not judge your process or define you."
    : outcome === "profit"
      ? "Recognise the discipline you described. One win does not prove every decision was correct."
      : "You followed your rules. A breakeven result can still reflect disciplined execution.";
}
