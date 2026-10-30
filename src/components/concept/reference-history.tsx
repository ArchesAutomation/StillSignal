"use client";
import { useState } from "react";
import type { JournalEntry, Session } from "@/lib/model";
import { journalDateValue } from "@/lib/journal-day";
import { noteTime } from "@/lib/journal-routing";
import { cx } from "./shared";
export default function ReferenceHistory({
  session,
  sessions,
  disabled,
  onDay,
  onNote,
  onWeek,
}: {
  session: Session;
  sessions: Session[];
  disabled: boolean;
  onDay: (date: string) => void;
  onNote: (s: Session, n: JournalEntry) => void;
  onWeek: () => void;
}) {
  const [offset, setOffset] = useState(0),
    [query, setQuery] = useState("");
  const anchor = new Date(session.startedAt);
  anchor.setDate(1);
  anchor.setMonth(anchor.getMonth() + offset);
  const first = (anchor.getDay() + 6) % 7,
    count = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const selected = journalDateValue(session.startedAt);
  const days = new Set(
    sessions
      .filter((s) => s.owner === session.owner)
      .map((s) => journalDateValue(s.startedAt)),
  );
  const results = query.trim()
    ? sessions
        .filter((s) => s.owner === session.owner)
        .flatMap((s) =>
          s.journal
            .filter(
              (n) =>
                !n.deletedAt &&
                `${n.text} ${n.label}`
                  .toLowerCase()
                  .includes(query.toLowerCase().trim()),
            )
            .map((n) => ({ s, n })),
        )
        .sort((a, b) => (noteTime(b.n) ?? b.n.t) - (noteTime(a.n) ?? a.n.t))
        .slice(0, 15)
    : [];
  return (
    <aside className={cx("reference-history")}>
      <section className={cx("reference-card")}>
        <div className={cx("month-controls")}>
          <button
            aria-label="Previous month"
            onClick={() => setOffset((n) => n - 1)}
          >
            ‹
          </button>
          <strong>
            {anchor.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </strong>
          <button
            aria-label="Next month"
            onClick={() => setOffset((n) => n + 1)}
          >
            ›
          </button>
        </div>
        <div className={cx("mini-month")} aria-label="Month calendar">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <small key={i}>{d}</small>
          ))}
          {Array.from({ length: first }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const d = new Date(anchor.getFullYear(), anchor.getMonth(), i + 1),
              day = journalDateValue(d.getTime());
            return (
              <button
                key={day}
                aria-label={d.toLocaleDateString("en-US", {
                  dateStyle: "full",
                })}
                aria-current={day === selected ? "date" : undefined}
                disabled={disabled || d.getTime() > Date.now()}
                onClick={() => onDay(day)}
              >
                {i + 1}
                {days.has(day) && <i />}
              </button>
            );
          })}
        </div>
        <label>
          Find a date
          <input
            type="date"
            aria-label="Find a journal date"
            value={selected}
            max={journalDateValue(Date.now())}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) onDay(e.target.value);
            }}
          />
        </label>
        <input
          type="search"
          aria-label="Search journal words and labels"
          placeholder="Search your words…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={cx("mobile-week-open")} onClick={onWeek}>
          Weekly review →
        </button>
        {query && (
          <div className={cx("search-results")} aria-live="polite">
            {results.length ? (
              results.map(({ s, n }) => (
                <button
                  key={s.id + n.id}
                  disabled={disabled}
                  onClick={() => onNote(s, n)}
                >
                  <small>
                    {new Date(s.startedAt).toLocaleDateString()} · {n.label}
                  </small>
                  {n.text.slice(0, 100)}
                </button>
              ))
            ) : (
              <p>No matching reflections.</p>
            )}
          </div>
        )}
      </section>
      <section className={cx("reference-card")}>
        <div className={cx("eyebrow")}>The week as a whole</div>
        <button onClick={onWeek}>Sunday intentions & weekly review →</button>
        <p>
          A quiet place to look ahead, then return to what you actually did.
        </p>
      </section>
      <section className={cx("reference-card")}>
        <div className={cx("eyebrow")}>Your saved record</div>
        <p>
          {sessions.length} recordings. Each moment keeps its own time, words
          and available evidence.
        </p>
      </section>
    </aside>
  );
}
