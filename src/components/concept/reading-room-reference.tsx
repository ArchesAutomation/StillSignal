"use client";
import { useProcess } from "../command-center/use-process";
import { readingRoomReference } from "@/lib/reading-room";
import { Calendar } from "./calendar";
import JournalDayPicker from "./journal-day-picker";
import type { Props } from "./shared";

export default function ReadingRoomReference({ props, week, onWeek, onOpen }: {
  props: Props; week: number; onWeek: (offset: number) => void; onOpen: (date: string) => Promise<void>;
}) {
  const { pulse, session, history } = props;
  const store = useProcess(pulse.owner, history);
  const reference = readingRoomReference(store.records, session);
  const blocked = pulse.active || !!props.capture?.pendingCapture;
  return <section className="rr-daily-reference" aria-label="Daily reference">
    <div className="ss-eyebrow">Your daily reference</div>
    <h2>{new Date(session.startedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: session.timezone })}</h2>
    <div className="rr-week-controls">
      <button aria-label="Previous reference week" onClick={() => onWeek(week - 1)}>←</button>
      <span>Your week</span>
      <button aria-label="Next reference week" onClick={() => onWeek(week + 1)}>→</button>
    </div>
    <Calendar weekdaysOnly sessions={history} selected={session} offset={week} disabled={blocked}
      onOpen={async target => { if (await pulse.openSession(target)) props.onPage("Journal"); }}
      onEmptyDay={date => void onOpen(date)} />
    <details className="rr-date-picker"><summary>Find another date</summary><JournalDayPicker date={session.startedAt} disabled={blocked} onOpen={onOpen} /></details>
    <hr />
    {store.error && <p role="alert">{store.error}</p>}
    {!store.loaded ? <p role="status">Loading your reference…</p> : <>
      <h3>Your intention</h3><p>{reference.intention}</p>
      <h3>How you arrived</h3><p>{reference.arrival}</p>
    </>}
    <small>From this day’s saved preparation. No feeling is inferred.</small>
  </section>;
}
