import type { JournalEntry, Session } from "./model";

/**
 * The Journal ("the book") is a free-writing page for a day. It is stored as
 * ordinary journal entries so no schema or database change is needed:
 * each entry holds at most 2,000 characters, so a long page is kept as
 * consecutive passages that read back as one page.
 *
 * Book passages are marked by their prompt id and kept out of Day in Action,
 * which remains the live record of the session.
 */
export const BOOK_PAGE = "journal-page";
export const BOOK_SILVER_LINING = "journal-page:silver-lining";
export const PASSAGE_LIMIT = 2000;

export type BookPart = typeof BOOK_PAGE | typeof BOOK_SILVER_LINING;

export function isBookEntry(note: Pick<JournalEntry, "prompt">) {
  const id = note.prompt?.id;
  return id === BOOK_PAGE || id === BOOK_SILVER_LINING;
}

/** Live passages of one part of the book, in reading order. */
export function bookPassages(session: Session, part: BookPart) {
  return session.journal
    .filter((n) => !n.deletedAt && n.prompt?.id === part)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.t - b.t);
}

/** A timed first passage marks when the page was written during a session. */
export function isJournalMarker(note: JournalEntry) {
  return note.prompt?.id === BOOK_PAGE && (note.order ?? 0) === 0 && typeof note.eventTime === "number";
}

export function bookText(session: Session, part: BookPart) {
  return bookPassages(session, part)
    .map((n) => n.text)
    .join("");
}

/**
 * Split text into passages of at most `limit` characters. Prefers to break
 * after a paragraph, then after a sentence, then after a space, so joining the
 * passages always gives back the original text exactly.
 */
export function splitPassages(text: string, limit = PASSAGE_LIMIT) {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const floor = Math.floor(limit / 2);
    let cut = window.lastIndexOf("\n\n") + 2;
    if (cut < floor) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n")) + 1;
    if (cut < floor) cut = window.lastIndexOf(" ") + 1;
    if (cut < floor) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length || !parts.length) parts.push(rest);
  return parts;
}

/**
 * Work out which entries to write so the stored passages match `text`.
 * Existing entries are reused in order; extra ones are soft-deleted.
 */
export function syncPassages({
  existing,
  text,
  part,
  now,
  makeId,
  liveAt = null,
}: {
  existing: JournalEntry[];
  text: string;
  part: BookPart;
  now: number;
  makeId: () => string;
  /** Set while a session is running: the page's first passage is then timed,
   * so Day in Action can show a "Wrote in journal" marker (never the words). */
  liveAt?: number | null;
}) {
  const chunks = text.trim() ? splitPassages(text) : [];
  const writes: JournalEntry[] = [];
  chunks.forEach((chunk, order) => {
    const old = existing[order];
    if (old) {
      if (old.text !== chunk || old.order !== order)
        writes.push({ ...old, text: chunk, order, updatedAt: now });
      return;
    }
    writes.push({
      id: makeId(),
      t: now + order,
      eventTime: part === BOOK_PAGE && order === 0 ? liveAt : null,
      section: "day-review",
      reflectionScope: "day",
      order,
      label: part === BOOK_PAGE ? "Journal" : "Silver lining",
      text: chunk,
      source: "typed",
      inputMethod: "text",
      origin: "free-writing",
      captureMode: "post-session",
      capturedAt: now,
      transcriptStatus: "unavailable",
      prompt: {
        id: part,
        question: part === BOOK_PAGE ? "Journal page" : "Silver lining",
      },
    });
  });
  for (const old of existing.slice(chunks.length))
    writes.push({ ...old, text: "", deletedAt: now, updatedAt: now });
  return writes;
}
