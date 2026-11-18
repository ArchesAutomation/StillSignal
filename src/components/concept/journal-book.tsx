"use client";
import {
  BOOK_PAGE,
  BOOK_SILVER_LINING,
  bookPassages,
  bookText,
  syncPassages,
  type BookPart,
} from "@/lib/journal-book";
import type { JournalEntry, Session } from "@/lib/model";
import { readingRoomReference } from "@/lib/reading-room";
import { useEffect, useMemo, useRef, useState } from "react";
import { journalDateValue } from "@/lib/journal-day";
import { useProcess } from "../process/use-process";
import type { Props } from "./shared";

/** What the left-hand page is showing while the book is open. */
type Leaf = "settle" | "write" | "after" | "rest";
type Order = "write-first" | "settle-first";

const SAVE_DELAY = 1200;
/** Matches the cover's turn in journal-book.css. */
const OPEN_MS = 1100;

/** Prompts follow the natural shape of a trader's own entries. They are
 * offered, never required, and only ever add a line to the page. */
const shapePrompts = [
  "What did price do today?",
  "What did you feel? Name it, without needing to fix it.",
  "What did the analyst know?",
  "Did anything new become clear?",
];

const settleSteps = [
  "Feel your feet on the floor and your weight in the chair.",
  "Take three slow breaths, a little longer out than in.",
  "Notice what is here. Name it if you can: “annoyed”, “restless”, “settled”. You don’t need to fix it.",
];

/** Ask the book to open on its page, e.g. when Done for the Day hands off.
 * `n` changes on every request; `prompt` is shown as a read-only starting point. */
export type BookRequest = { n: number; prompt?: string };

export default function JournalBook({
  props,
  session,
  request,
  saveDatedNotes,
}: {
  props: Props;
  session: Session;
  request?: BookRequest;
  saveDatedNotes?: (notes: JournalEntry[]) => void;
}) {
  const p = props.pulse;
  const store = useProcess(p.owner, props.history);
  const reference = readingRoomReference(store.records, session);
  const hasIntention =
    store.loaded && !reference.intention.startsWith("No intention");

  const [page, setPage] = useState(() => bookText(session, BOOK_PAGE));
  const [lining, setLining] = useState(() => bookText(session, BOOK_SILVER_LINING));
  const [open, setOpen] = useState(false);
  const [leaf, setLeaf] = useState<Leaf>("write");
  const [order, setOrder] = useState<Order>("write-first");
  const [status, setStatus] = useState("");
  const [turning, setTurning] = useState<"earlier" | "later">();
  const paper = useRef<HTMLTextAreaElement>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Pages to turn to: other days that already have Journal writing.
  const { earlier, later } = useMemo(() => {
    const day = (s: Session) =>
      new Date(s.startedAt).toLocaleDateString("en-CA", { timeZone: s.timezone });
    const today = day(session);
    const written = new Map<string, Session>();
    for (const s of [props.session, ...props.history]) {
      if (!s.journal.some((n) => !n.deletedAt && n.prompt?.id === BOOK_PAGE && n.text.trim())) continue;
      const key = day(s);
      if (key !== today && !written.has(key)) written.set(key, s);
    }
    const keys = [...written.keys()].sort();
    const before = keys.filter((k) => k < today).at(-1);
    const after = keys.find((k) => k > today);
    return {
      earlier: before ? written.get(before) : undefined,
      later: after ? written.get(after) : undefined,
    };
  }, [session, props.session, props.history]);
  const turnBlocked = p.active || !!props.capture?.pendingCapture;
  const focusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // What is stored right now, per part. Kept locally so quick successive
  // saves never create duplicate passages before the session refreshes.
  const known = useRef<Record<BookPart, JournalEntry[]>>({
    [BOOK_PAGE]: bookPassages(session, BOOK_PAGE),
    [BOOK_SILVER_LINING]: bookPassages(session, BOOK_SILVER_LINING),
  });
  const pending = useRef<Partial<Record<BookPart, string>>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    known.current = {
      [BOOK_PAGE]: bookPassages(session, BOOK_PAGE),
      [BOOK_SILVER_LINING]: bookPassages(session, BOOK_SILVER_LINING),
    };
    setPage(bookText(session, BOOK_PAGE));
    setLining(bookText(session, BOOK_SILVER_LINING));
    // Turning to another day keeps the book open on that day's page.
    setLeaf("write");
    setStatus("");
    // Only reset when a different day is opened, never while typing.
  }, [session.id]);

  function flush() {
    clearTimeout(timer.current);
    const jobs = pending.current;
    pending.current = {};
    const parts = Object.keys(jobs) as BookPart[];
    if (!parts.length) return chain.current;
    setStatus("Saving…");
    chain.current = chain.current.then(async () => {
      try {
        for (const part of parts) {
          const existing = known.current[part];
          const writes = syncPassages({
            existing,
            text: jobs[part] ?? "",
            part,
            now: Date.now(),
            makeId: () => crypto.randomUUID(),
            liveAt: p.active ? Date.now() : null,
          });
          if (saveDatedNotes) saveDatedNotes(writes);
          else for (const note of writes) {
            if (existing.some((n) => n.id === note.id)) await p.saveJournalNote(note);
            else await p.addNote(note);
          }
          const byId = new Map(existing.map((n) => [n.id, n]));
          for (const note of writes) byId.set(note.id, note);
          known.current[part] = [...byId.values()]
            .filter((n) => !n.deletedAt)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        }
        setStatus(Object.keys(pending.current).length ? "Saving…" : "Saved");
      } catch (e) {
        setStatus(
          e instanceof Error
            ? `Not saved yet: ${e.message}`
            : "Not saved yet. Your words are still here; keep writing and it will retry.",
        );
        // Keep the words queued so the next change or blur retries them.
        for (const part of parts)
          if (pending.current[part] === undefined) pending.current[part] = jobs[part];
      }
    });
    return chain.current;
  }

  function queue(part: BookPart, text: string) {
    pending.current[part] = text;
    setStatus("Writing…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  }

  useEffect(() => {
    const away = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", away);
    return () => {
      document.removeEventListener("visibilitychange", away);
      clearTimeout(focusTimer.current);
      clearTimeout(turnTimer.current);
      void flush();
    };
  }, []);

  function focusPage(delay = 0) {
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const el = paper.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }, delay);
  }

  function openBook(choice: Order) {
    setOrder(choice);
    const next: Leaf = choice === "settle-first" ? "settle" : "write";
    setLeaf(next);
    setOpen(true);
    if (next === "write") focusPage(OPEN_MS);
  }

  useEffect(() => {
    if (!request) return;
    // Let the closed cover show for a moment so the opening is felt.
    const t = setTimeout(() => openBook("write-first"), 350);
    return () => clearTimeout(t);
  }, [request?.n]);

  function closeBook() {
    void flush();
    setOpen(false);
  }

  async function turnTo(target: Session | undefined, direction: "earlier" | "later") {
    if (!target || turning || turnBlocked) return;
    await flush(); // never lose words when the page turns
    setTurning(direction);
    clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => setTurning(undefined), 900);
    try {
      if (props.dayAwayReview && props.onOpenJournalDay) await props.onOpenJournalDay(journalDateValue(target.startedAt));
      else if (!(await p.openSession(target))) setTurning(undefined);
    } catch (e) {
      setTurning(undefined);
      setStatus(e instanceof Error ? e.message : "That page could not open.");
    }
  }

  const shortDate = (s?: Session) =>
    s &&
    new Date(s.startedAt).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: s.timezone,
    });
  const turnHint = turnBlocked ? "Finish your live session to turn pages" : undefined;

  const date = new Date(session.startedAt).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: session.timezone,
  });
  const started = !!page.trim();

  const settle = (onDone: () => void, label: string) => (
    <>
      <h3>Before you go on</h3>
      <ol className="ss-book-steps">
        {settleSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="ss-book-actions">
        <button className="ss-book-primary" onClick={onDone}>
          {label}
        </button>
        <button className="ss-book-quiet" onClick={() => props.onPage("Stillness")}>
          More in Stillness
        </button>
      </div>
    </>
  );

  // The left page changes with each step. Its key makes each step turn in.
  const leftPage = {
    settle: settle(() => {
      setLeaf("write");
      focusPage(250);
    }, "Open the page"),
    write: (
      <>
        <h3>Today’s page</h3>
        {hasIntention && (
          <p className="ss-book-intention">
            This morning’s intention
            <em>{reference.intention}</em>
          </p>
        )}
        <p className="ss-book-note">
          Write whatever is here. Say it as it is; you don’t have to believe it.
        </p>
        <p className="ss-book-label">If you’d like a starting point</p>
        {/* Read-only: starting points never write into the page. */}
        <ul className="ss-book-prompts" aria-label="Starting points">
          {[
            ...(request?.prompt ? [request.prompt] : []),
            ...(hasIntention
              ? [`How did today sit with your intention?`]
              : []),
            ...shapePrompts,
          ].map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
        <div className="ss-book-actions">
          <button
            className="ss-book-primary"
            onClick={() => {
              void flush();
              setLeaf(order === "write-first" ? "after" : "rest");
            }}
          >
            I’ve finished writing
          </button>
        </div>
      </>
    ),
    after: settle(() => setLeaf("rest"), "Continue"),
    rest: (
      <div className="ss-book-lining">
        <label htmlFor="ss-book-lining">
          What went well, or what can you take from today?
        </label>
        <small>Only if you find one. Thoughts about today aren’t who you are.</small>
        <textarea
          id="ss-book-lining"
          value={lining}
          placeholder="Optional"
          onChange={(e) => {
            setLining(e.target.value);
            queue(BOOK_SILVER_LINING, e.target.value);
          }}
          onBlur={() => void flush()}
        />
        <div className="ss-book-actions">
          <button className="ss-book-primary" onClick={closeBook}>
            Close the book
          </button>
          <button
            className="ss-book-quiet"
            onClick={() => {
              setLeaf("write");
              focusPage(250);
            }}
          >
            Back to the page
          </button>
        </div>
      </div>
    ),
  }[leaf];

  return (
    <section className="ss-book" aria-label="Journal">
      <div
        className={`ss-book-volume${open ? " is-open" : ""}${turning ? " is-turning" : ""}`}
      >
        {turning && (
          <div className={`ss-book-flip is-${turning}`} key={session.id} aria-hidden />
        )}
        {/* Right-hand page: always the writing page, under the cover. */}
        <div className="ss-book-sheet ss-book-right" inert={!open}>
          <header className="ss-book-head">
            <span className="ss-book-date">{date}</span>
            <span className="ss-book-status" role="status" aria-live="polite">
              {status}
            </span>
          </header>
          <textarea
            ref={paper}
            className="ss-book-page"
            aria-label="Journal page"
            placeholder="Begin anywhere…"
            value={page}
            onChange={(e) => {
              setPage(e.target.value);
              queue(BOOK_PAGE, e.target.value);
            }}
            onBlur={() => void flush()}
          />
          <footer className="ss-book-foot">
            <button className="ss-book-quiet" onClick={closeBook}>
              Close the book
            </button>
            <button
              className="ss-book-corner is-later"
              disabled={!later || turnBlocked}
              title={turnHint}
              aria-label={later ? `Turn to ${shortDate(later)}` : "No later pages"}
              onClick={() => void turnTo(later, "later")}
            >
              Later ›<small>{later ? shortDate(later) : "No later pages"}</small>
            </button>
          </footer>
        </div>

        {/* The cover turns on its spine; its inside becomes the left page. */}
        <div className="ss-book-leaf">
          <div className="ss-book-cover" inert={open}>
            <span className="ss-book-ribbon" aria-hidden />
            <div className="ss-book-cover-frame">
              <span className="ss-book-cover-mark" aria-hidden>still signal</span>
              <h2>Journal</h2>
              <span className="ss-book-cover-date">{date}</span>
              <p>A quiet page for today. Nothing here is required.</p>
              <div className="ss-book-actions">
                {started ? (
                  <button className="ss-book-cover-button" onClick={() => openBook("write-first")}>
                    Open where you left off
                  </button>
                ) : (
                  <>
                    <button className="ss-book-cover-button" onClick={() => openBook("write-first")}>
                      Write first
                    </button>
                    <button
                      className="ss-book-cover-button is-quiet"
                      onClick={() => openBook("settle-first")}
                    >
                      Settle first
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="ss-book-sheet ss-book-left" inert={!open}>
            <div className="ss-book-left-body">
              <div className="ss-book-turn" key={`${leaf}-${open}`}>
                {leftPage}
              </div>
            </div>
            <footer className="ss-book-foot">
              <button
                className="ss-book-corner is-earlier"
                disabled={!earlier || turnBlocked}
                title={turnHint}
                aria-label={earlier ? `Turn back to ${shortDate(earlier)}` : "No earlier pages"}
                onClick={() => void turnTo(earlier, "earlier")}
              >
                ‹ Earlier<small>{earlier ? shortDate(earlier) : "No earlier pages yet"}</small>
              </button>
            </footer>
          </div>
        </div>
      </div>
    </section>
  );
}
