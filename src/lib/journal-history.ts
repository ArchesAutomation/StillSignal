import type { Session, JournalEntry } from "./model";
import type { SessionBlueprint } from "./blueprint-schema";

export type JournalChange = { sessionId: string; day: string } & (
  | { kind: "note"; id: string; before?: JournalEntry; after: JournalEntry }
  | { kind: "blueprint"; keys: (keyof SessionBlueprint)[]; before?: SessionBlueprint; after: SessionBlueprint }
);
const canonical = (value: unknown) => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item,
);
const fingerprint = (note?: JournalEntry) => {
  if (!note || note.deletedAt) return "deleted";
  const { updatedAt: _, ...content } = note;
  return canonical(content);
};

/** Restore only the edited entry/fields, preserving newer recordings and other data. */
export function applyJournalChange(session: Session, change: JournalChange, redo = false, now = Date.now()): Session {
  if (session.id !== change.sessionId) throw new Error("Open the original journal to undo this change.");
  const expected = redo ? change.before : change.after;
  const target = redo ? change.after : change.before;
  if (change.kind === "note") {
    const old = session.journal.find(n => n.id === change.id);
    if (fingerprint(old) !== fingerprint(expected as JournalEntry | undefined)) throw new Error("This moment changed elsewhere. Undo would overwrite newer edits.");
    const revision = Math.max(now, (old?.updatedAt ?? old?.t ?? 0) + 1, (old?.deletedAt ?? 0) + 1);
    const note = target as JournalEntry | undefined;
    const restored = note ? { ...note, updatedAt: revision, deletedAt: note.deletedAt ? revision : undefined } : { ...change.after, updatedAt: revision, deletedAt: revision };
    return { ...session, journal: session.journal.map(n => n.id === change.id ? restored : n) };
  }
  const blueprint: SessionBlueprint = { ...session.blueprint, updatedAt: Math.max(now, (session.blueprint?.updatedAt ?? 0) + 1) };
  for (const key of change.keys) {
    if (canonical(blueprint[key]) !== canonical((expected as SessionBlueprint | undefined)?.[key])) throw new Error("These journal details changed elsewhere. Undo would overwrite newer edits.");
    const value = (target as SessionBlueprint | undefined)?.[key];
    if (value === undefined) delete blueprint[key];
    else Object.assign(blueprint, { [key]: value });
  }
  blueprint.updatedAt = Math.max(now, (session.blueprint?.updatedAt ?? 0) + 1);
  return { ...session, blueprint };
}
