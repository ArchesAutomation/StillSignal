"use client";
import { readingRoomReference } from "@/lib/reading-room";
import { journalDateValue } from "@/lib/journal-day";
import { useProcess } from "../process/use-process";
import { Calendar } from "./calendar";
import JournalDayPicker from "./journal-day-picker";
import type { Props } from "./shared";

export default function ReadingRoomReference({ props, week, onWeek, onOpen, selectedDate, awayDates }: {
  props: Props; week: number; onWeek: (offset: number) => void; onOpen: (date: string) => Promise<void>;
  selectedDate?: number; awayDates?: string[];
}) {
  const { pulse, session, history } = props;
  const store = useProcess(pulse.owner, history);
  const startedAt = selectedDate ?? session.startedAt;
  const away = awayDates?.includes(journalDateValue(startedAt));
  const timezone = selectedDate === undefined ? session.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const reference = readingRoomReference(store.records, selectedDate === undefined ? session : { ...session, startedAt, timezone, blueprint: undefined });
  const blocked = pulse.active || !!props.capture?.pendingCapture;
  return <section className="rr-daily-reference" aria-label="Daily reference">
    <div className="ss-eyebrow">Your daily reference</div>
    <h2>{new Date(startedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: timezone })}</h2>
    <div className="rr-week-controls">
      <button aria-label="Previous reference week" onClick={() => onWeek(week - 1)}>←</button>
      <span>Your week</span>
      <button aria-label="Next reference week" onClick={() => onWeek(week + 1)}>→</button>
    </div>
    <Calendar weekdaysOnly sessions={history} selected={session} selectedDate={selectedDate} awayDates={awayDates} offset={week} disabled={blocked}
      onOpen={async target => { if (awayDates) await onOpen(journalDateValue(target.startedAt)); else if (await pulse.openSession(target)) props.onPage("Journal"); }}
      onEmptyDay={date => void onOpen(date)} />
    <details className="rr-date-picker"><summary>Find another date</summary><JournalDayPicker key={startedAt} date={startedAt} disabled={blocked} onOpen={onOpen} /></details>
    <hr />
    {store.error && <p role="alert">{store.error}</p>}
    {away ? <p>Day away from charts</p> : !store.loaded ? <p role="status">Loading your reference…</p> : <>
      <h3>Your intention</h3><p>{reference.intention}</p>
      <h3>How you arrived</h3><p>{reference.arrival}</p>
    </>}
    {!away && <small>From this day’s saved preparation. No feeling is inferred.</small>}
  </section>;
}
