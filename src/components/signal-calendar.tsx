"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { money, type Session } from "@/lib/model";
import { isActualExecution, pnlByCurrency } from "@/lib/trade-context";
import { liveNotes } from "@/lib/smart-journal";

export function dayKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function shift(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default function SignalCalendar({
  sessions,
  selected,
  recording,
  month = false,
  onOpen,
}: {
  sessions: Session[];
  selected: Session;
  recording: boolean;
  month?: boolean;
  onOpen: (session: Session) => void;
}) {
  const [offset, setOffset] = useState(0);
  const anchor = new Date(selected.startedAt);
  anchor.setHours(12, 0, 0, 0);
  const groups = useMemo(() => {
    const groups = new Map<string, Session[]>();
    for (const s of sessions.filter((s) => s.id !== "workspace")) {
      const key = dayKey(s.startedAt);
      groups.set(key, [...(groups.get(key) || []), s]);
    }
    return groups;
  }, [sessions]);
  let start: Date, count: number;
  if (month) {
    anchor.setDate(1);
    anchor.setMonth(anchor.getMonth() + offset);
    const padding = (anchor.getDay() + 6) % 7;
    start = shift(anchor, -padding);
    count =
      Math.ceil(
        (padding +
          new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) /
          7,
      ) * 7;
  } else {
    start = shift(anchor, (-(anchor.getDay() + 6) % 7) + offset * 7);
    count = 7;
  }
  const end = shift(start, count - 1);
  return (
    <section
      className={
        month
          ? "signal-calendar month-calendar"
          : "signal-calendar week-calendar"
      }
      aria-label={month ? "Session calendar" : "Journal week"}
    >
      <div className="calendar-heading">
        <div>
          {month && (
            <>
              <div className="eyebrow">YOUR RECORDED HISTORY</div>
              <h2>The days behind the story.</h2>
            </>
          )}
        </div>
        <div className="calendar-controls">
          <button
            className="icon-button"
            aria-label={month ? "Previous month" : "Previous week"}
            onClick={() => setOffset((v) => v - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {month
              ? anchor.toLocaleDateString([], {
                  month: "long",
                  year: "numeric",
                })
              : `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`}
          </span>
          <button
            className="icon-button"
            aria-label={month ? "Next month" : "Next week"}
            onClick={() => setOffset((v) => v + 1)}
          >
            <ChevronRight size={16} />
          </button>
          {offset !== 0 && (
            <button className="text-button" onClick={() => setOffset(0)}>
              Selected day
            </button>
          )}
        </div>
      </div>
      <div className="calendar-grid">
        {month &&
          weekdays.map((d) => (
            <span className="calendar-weekday" key={d}>
              {d}
            </span>
          ))}
        {Array.from({ length: count }, (_, i) => {
          const date = shift(start, i),
            rows = groups.get(dayKey(+date)) || [];
          const active = dayKey(+date) === dayKey(selected.startedAt);
          const events = rows
            .flatMap((s) => s.events)
            .filter(isActualExecution);
          const totals = pnlByCurrency(events);
          const notes = rows.reduce(
            (n, s) => n + liveNotes(s.journal).length,
            0,
          );
          return (
            <button
              key={+date}
              type="button"
              className={`calendar-day${active ? " selected" : ""}${month && date.getMonth() !== anchor.getMonth() ? " outside" : ""}`}
              aria-pressed={active}
              aria-label={`${date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${rows.length} sessions`}
              disabled={!rows.length || recording}
              title={
                recording
                  ? "End your session before opening another day"
                  : rows.length
                    ? `${rows.length} sessions · ${notes} reflections. Open the latest session; use the session selector for other recordings.`
                    : "No recorded session"
              }
              onClick={() =>
                onOpen(rows.find((s) => s.id === selected.id) || rows[0])
              }
            >
              {!month && <span>{weekdays[i]}</span>}
              <strong>
                {date.getDate()} {rows.length > 0 && <i />}
              </strong>
              {month && (
                <>
                  <span
                    className={
                      totals.length === 1
                        ? totals[0][1] >= 0
                          ? "mint"
                          : "rose"
                        : ""
                    }
                  >
                    {totals.length === 1
                      ? money(totals[0][1], totals[0][0])
                      : totals.length > 1
                        ? `${totals.length} currencies`
                        : "—"}
                  </span>
                  <small>
                    {rows.length
                      ? `${rows.length} sessions · ${notes} notes`
                      : "No session"}
                  </small>
                </>
              )}
            </button>
          );
        })}
      </div>
      {month && (
        <p className="calendar-footnote">
          Recorded P&L by session start date. Open a day to review its latest
          session.
        </p>
      )}
    </section>
  );
}
