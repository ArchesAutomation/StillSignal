"use client";
import { useState } from "react";
import { money, type Session } from "@/lib/model";
import { pnlByCurrency } from "@/lib/trade-context";
import { liveNotes } from "@/lib/smart-journal";
import { cx, dateKey } from "./shared";
import { journalDateValue } from "@/lib/journal-day";
import type { ReferenceDayLabel } from "@/lib/reading-room";
export const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export function weekStart(t: number, offset = 0) {
  const d = new Date(t);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
export function Calendar({
  sessions,
  selected,
  offset = 0,
  month = false,
  weekdaysOnly = false,
  onOpen,
  onEmptyDay,
  selectedDate,
  awayDates,
  dayLabels,
  disabled,
}: {
  sessions: Session[];
  selected: Session;
  offset?: number;
  month?: boolean;
  weekdaysOnly?: boolean;
  onOpen: (s: Session) => void;
  onEmptyDay?: (date: string) => void;
  selectedDate?: number;
  awayDates?: string[];
  dayLabels?: Record<string, ReferenceDayLabel>;
  disabled: boolean;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const selectedAt = selectedDate ?? selected.startedAt;
  const anchor = new Date(selectedAt);
  anchor.setDate(1);
  anchor.setMonth(anchor.getMonth() + monthOffset);
  const start = month
    ? weekStart(anchor.getTime())
    : weekStart(selectedAt, offset);
  const count = month
    ? Math.ceil(
        (((anchor.getDay() + 6) % 7) +
          new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) /
          7,
      ) * 7
    : weekdaysOnly
      ? 5
      : 7;
  return (
    <>
      {month && (
        <div className={cx("monthhead")}>
          <div>
            <div className={cx("eyebrow")}>
              {anchor.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}{" "}
              · physiology beside performance
            </div>
            <h2>See the month before reading the story.</h2>
          </div>
          <div className={cx("datecontrols")}>
            <button
              className={cx("iconbtn")}
              aria-label="Previous month"
              onClick={() => setMonthOffset((n) => n - 1)}
            >
              ‹
            </button>
            <button
              className={cx("iconbtn")}
              aria-label="Next month"
              onClick={() => setMonthOffset((n) => n + 1)}
            >
              ›
            </button>
          </div>
        </div>
      )}
      <div
        className={cx(month ? "monthgrid" : "week")}
        aria-label={month ? "Session calendar" : "Journal week"}
      >
        {month &&
          weekdays.map((d) => (
            <div className={cx("monthlabel")} key={d}>
              {d}
            </div>
          ))}
        {Array.from({ length: count }, (_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const rows = sessions.filter(
            (s) => dateKey(s.startedAt) === dateKey(d.getTime()),
          );
          const date = journalDateValue(d.getTime());
          const away = awayDates?.includes(date);
          const label = dayLabels?.[date];
          const active = dateKey(selectedAt) === dateKey(d.getTime());
          const target =
            rows.find((s) => s.id === selected.id) ||
            rows.sort((a, b) => b.startedAt - a.startedAt)[0];
          const totals = pnlByCurrency(rows.flatMap((s) => s.events));
          return (
            <button
              type="button"
              key={i}
              className={cx(
                month ? "monthday" : "day",
                active && (month ? "active" : "selected"),
                month && d.getMonth() !== anchor.getMonth() && "empty",
              )}
              disabled={
                disabled ||
                (!target &&
                  (!onEmptyDay ||
                    new Date(
                      d.getFullYear(),
                      d.getMonth(),
                      d.getDate(),
                    ).getTime() > Date.now()))
              }
              aria-label={
                d.toLocaleDateString("en-US", { dateStyle: "full" }) +
                (dayLabels ? (label ? ` · ${label.detail}` : "") : away ? " · Day away from charts" : rows.length
                  ? ` · ${rows.length} sessions`
                  : onEmptyDay
                    ? " · Start a journal"
                    : " · No session")
              }
              aria-current={dayLabels && active ? "date" : undefined}
              onClick={() =>
                away && onEmptyDay ? onEmptyDay(date) : target
                  ? onOpen(target)
                  : onEmptyDay?.(date)
              }
            >
              {month ? (
                <>
                  <b>{d.getDate()}</b>
                  {totals.length ? (
                    totals.map(([c, v]) => (
                      <span
                        key={c}
                        className={cx("daypnl")}
                        style={{
                          color: v >= 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {v > 0 ? "+" : ""}
                        {money(v, c)}
                      </span>
                    ))
                  ) : (
                    <span className={cx("daypnl")}>—</span>
                  )}
                  <small>
                    {away ? "Away" : rows.length
                      ? `${rows.length} session${rows.length === 1 ? "" : "s"}`
                      : "No session"}
                  </small>
                </>
              ) : (
                <>
                  {weekdays[i]}
                  <strong>
                    {d.getDate()}{" "}
                    {!label && rows.some((s) => liveNotes(s.journal).length > 0) && (
                      <i className={cx("dotevent")} />
                    )}
                  </strong>
                  {label ? <small className="rr-reference-week-label" data-status={label.short}>{label.short}</small> :
                    !dayLabels && away && <small className="rr-away-week-marker">Away</small>}
                </>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
