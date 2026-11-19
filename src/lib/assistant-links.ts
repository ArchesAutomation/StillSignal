// How an answer card opens the entry it quotes. The panel sits outside the workspace, so the
// two only share this browser event. It navigates and never changes a record.
export type JournalLink = { sessionId: string; noteId?: string; at?: number; book?: boolean };
export type AssistantLink =
  | JournalLink
  | { page: "Preparation" | "Done" | "Sessions" }
  | { stillness: string }
  | { date: string };

export const JOURNAL_LINK_EVENT = "still-signal:open-journal-entry";

export function openAssistantLink(link: AssistantLink) {
  window.dispatchEvent(new CustomEvent<AssistantLink>(JOURNAL_LINK_EVENT, { detail: link }));
}

/** Brings a Day in Action note into view once the opened day has rendered it. */
export function revealJournalNote(noteId: string, tries = 40) {
  const note = document.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(noteId)}"]`);
  if (!note) {
    if (tries > 0) setTimeout(() => revealJournalNote(noteId, tries - 1), 100);
    return;
  }
  document.querySelector("[data-assistant-focus]")?.removeAttribute("data-assistant-focus");
  note.setAttribute("data-assistant-focus", "");
  note.scrollIntoView({ block: "center" });
}
