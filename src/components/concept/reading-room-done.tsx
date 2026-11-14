"use client";

import { dayCloseoutChange } from "@/lib/process/day-closeout";
import {
  createRecord,
  dateInZone,
  dayOutcomes,
  type DayCloseout,
} from "@/lib/process/model";
import { readProcess } from "@/lib/process/storage";
import { emptyTradingDay, tradingDayFor } from "@/lib/process/trading-day";
import { useMemo, useRef, useState, type ReactNode } from "react";
import PnlSnapshot from "../pnl-snapshot";
import type { ProcessStore } from "../process/use-process";
import type { Props } from "./shared";

const outcomes = {
  profit: "Profit", loss: "Loss", breakeven: "Breakeven",
  "no-trade": "No trade", "rather-not-say": "Rather not say",
} satisfies Record<(typeof dayOutcomes)[number], string>;
// Three simple answers, saved on this page. Older days may still hold "not-reviewed"; it simply shows no selection.
const processChoices = ["followed", "partial", "broken"] as const;
const processes = {
  followed: "Followed it", partial: "Partly", broken: "Not today",
} satisfies Record<(typeof processChoices)[number], string>;

export default function ReadingRoomDone({ active, store, props, onEnd, onReflect, children }: {
  active: boolean;
  store: ProcessStore;
  props: Props;
  onEnd: () => Promise<void>;
  onReflect: () => Promise<void>;
  children: ReactNode;
}) {
  const p = props.pulse;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = dateInZone(p.now, timezone);
  const day = tradingDayFor(store.records, date, timezone);
  const [ending, setEnding] = useState(false);
  const [writing, setWriting] = useState(false);
  const writeLock = useRef(false);
  const [sessionError, setSessionError] = useState("");
  const [error, setError] = useState("");
  const [reflectionError, setReflectionError] = useState("");
  const sessions = active
    ? [...new Map([...props.history, props.session]
        .filter((session) => session.owner === p.owner)
        .map((session) => [session.id, session])).values()]
    : [];
  const ended = sessions.some((session) => !session.demo && session.id !== "workspace" &&
    session.endedAt && session.endedAt <= p.now && dateInZone(session.endedAt, timezone) === date);
  const pending = props.capture?.pendingCapture;
  // The optional P&L image only needs today's date and timezone; nothing is saved by showing it.
  const snapshotDay = useMemo(() => day ?? createRecord("day", emptyTradingDay(date, timezone)), [day, date, timezone]);
  const unavailable = !store.loaded || store.busy || writing;

  async function end() {
    setEnding(true);
    setSessionError("");
    try { await onEnd(); }
    catch (cause) { setSessionError(cause instanceof Error ? cause.message : "The session could not end. Try again."); }
    finally { setEnding(false); }
  }

  async function write(action: (records: Awaited<ReturnType<typeof readProcess>>) => Promise<void>) {
    if (unavailable || writeLock.current) return;
    writeLock.current = true;
    setWriting(true);
    setError("");
    try { await action(await readProcess(p.owner)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your review. Try again."); }
    finally { writeLock.current = false; setWriting(false); }
  }

  function choose<K extends keyof DayCloseout>(field: K, value: DayCloseout[K]) {
    void write(async (records) => {
      const saved = tradingDayFor(records, date, timezone)?.body.closeout?.[field];
      const change = dayCloseoutChange(records, date, timezone, { [field]: saved === value ? undefined : value });
      if (change) await store.save([change]);
    });
  }

  const chips = <K extends keyof DayCloseout, V extends NonNullable<DayCloseout[K]>>(
    field: K, label: string, values: readonly V[], labels: Record<V, string>,
  ) => (
    <div className="rr-preparation-chips" role="group" aria-label={label}>
      {values.map((value) => <button key={value} aria-pressed={day?.body.closeout?.[field] === value}
        disabled={unavailable} onClick={() => choose(field, value)}>
        {day?.body.closeout?.[field] === value && <span aria-hidden="true">✓ </span>}{labels[value]}
      </button>)}
    </div>
  );

  return (
    <div className={active ? "rr-preparation rr-done" : "rr-done-bridge"}>
      {active && <>
        <header className="rr-preparation-heading">
          <p className="rr-preparation-kicker">Done for the day</p>
          <h1>You can put the day down.</h1>
          <p>Take a moment before anything else. This is one day in a longer trading practice.</p>
        </header>
        <section className="rr-preparation-start rr-done-session" aria-label="Session controls">
          <div>
            <strong role="status"><i aria-hidden="true" />{ending ? "Ending session…" : p.active ? "Session in progress" : ended ? "Session ended" : "No session running"}</strong>
            <p>{pending ? "Confirm or discard your capture draft before ending." : p.active ? "End the session when you’re ready. Nothing below is needed to finish." : "You can leave now. Nothing below is needed to finish."}</p>
          </div>
          {(p.active || ending) && <button className="ss-primary" disabled={ending || pending} onClick={() => void end()}>End session</button>}
          {!p.active && !ending && <button onClick={() => props.onPage("Home")}>Back to Home</button>}
          {sessionError && <p role="alert">{sessionError}</p>}
        </section>
        <p className="rr-done-continue">Continue, if you want</p>
        {day?.body.goal && <section className="rr-preparation-card rr-done-intention" aria-labelledby="done-intention-title">
          <h2 id="done-intention-title">Your intention this session</h2>
          <blockquote>{day.body.goal}</blockquote>
        </section>}
        <section className="rr-preparation-card rr-done-outcome" id="done-outcome" aria-labelledby="done-outcome-title">
          <h2 id="done-outcome-title">How did today turn out?</h2>
          <p>Record the result if you’d like to. How the day felt is yours to say.</p>
          {chips("outcome", "Day outcome", dayOutcomes, outcomes)}
        </section>
        <section className="rr-preparation-card rr-done-reflection" id="done-reflection" aria-labelledby="done-reflection-title">
          <h2 id="done-reflection-title">Anything you want to keep?</h2>
          <p>Open today’s Journal to write or speak a reflection. Your intention and how you arrived are there beside the page.</p>
          <div className="rr-home-actions">
            <button disabled={pending || ending} onClick={() => {
              setReflectionError("");
              void onReflect().catch((cause: Error) => setReflectionError(cause.message));
            }}>Reflect in Daily journal ↗</button>
          </div>
          {reflectionError && <p role="alert">{reflectionError}</p>}
        </section>
        <section className="rr-preparation-card rr-done-process" id="done-process" aria-labelledby="done-process-title">
          <h2 id="done-process-title">How did you follow your plan?</h2>
          <p>Think about your choices, including any decision to sit out.</p>
          {chips("process", "How you followed your plan", processChoices, processes)}
          {error && <p role="alert">{error}</p>}
          <PnlSnapshot store={store} day={snapshotDay} props={props} />
        </section>
      </>}
      {children}
    </div>
  );
}
