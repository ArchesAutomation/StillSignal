import type { JournalEntry } from "./model";
import type { AwayEvent, AwayImage } from "./process/away-days";
import { mergeNotes } from "./smart-journal";

export type AwayNote = {
  id: string;
  text: string;
  images: AwayImage[];
  followups: { date: string; text: string }[];
  reminder?: { text: string; preparation?: string };
};
export type AwayDay = {
  away: boolean;
  reason?: { text: string; recordedAt: number };
  notes: AwayNote[];
  bookNotes?: JournalEntry[];
  started?: boolean;
};
export type AwayDays = Record<string, AwayDay | undefined>;
export type AwayEntry = { date: string; note: AwayNote };

export const emptyAwayDay = (): AwayDay => ({ away: false, notes: [] });

/** Replays changes in time order, so every device derives the same days from the same events. */
export function foldAwayEvents(events: AwayEvent[]): AwayDays {
  const ordered = [...events].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const days: AwayDays = {};
  const dayFor = (date: string) => (days[date] ??= emptyAwayDay());
  // Notes first: clock differences between devices can date a follow-up before its reflection.
  for (const { body } of ordered) {
    if (body.type === "note") dayFor(body.date).notes.push({ id: body.noteId, text: body.text, images: body.images, followups: [] });
  }
  for (const { body, createdAt } of ordered) {
    if (body.type === "note") continue;
    const day = dayFor(body.date);
    if (body.type === "day") day.away = body.away;
    if (body.type === "started") { day.away = false; day.started = true; }
    if (body.type === "reason") day.reason = { text: body.text, recordedAt: createdAt };
    if (body.type === "book") day.bookNotes = mergeNotes(day.bookNotes ?? [], [body.entry as JournalEntry]);
    if (body.type === "followup" || body.type === "reminder" || body.type === "reminder-surfaced") {
      const note = day.notes.find(item => item.id === body.noteId);
      if (!note) continue;
      if (body.type === "followup") note.followups.push({ date: body.followupDate, text: body.text });
      if (body.type === "reminder") note.reminder = body.text === null ? undefined : { text: body.text };
      if (body.type === "reminder-surfaced" && note.reminder) note.reminder = { ...note.reminder, preparation: body.preparation };
    }
  }
  return days;
}

export const awayEntries = (days: AwayDays): AwayEntry[] =>
  Object.entries(days).flatMap(([date, day]) => day?.notes.map(note => ({ date, note })) ?? []);
