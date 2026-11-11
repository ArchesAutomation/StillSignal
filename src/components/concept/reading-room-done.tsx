"use client";

import { useRef, useState, type ReactNode } from "react";
import { dateInZone, createRecord, dayOutcomes, dayProcessChoices, type DayCloseout } from "@/lib/process/model";
import { emptyTradingDay, tradingDayFor } from "@/lib/process/trading-day";
import { dayCloseoutChange } from "@/lib/process/day-closeout";
import { readProcess } from "@/lib/process/storage";
import { completedOn } from "@/lib/process/session-review";
import SessionReviewGuide from "../session-review-guide";
import type { ProcessStore } from "../command-center/use-process";
import type { Props } from "./shared";

const outcomes = {
  profit: "Profit", loss: "Loss", breakeven: "Breakeven",
  "no-trade": "No trade", "rather-not-say": "Rather not say",
} satisfies Record<(typeof dayOutcomes)[number], string>;
const processes = {
  followed: "Followed my rules", partial: "Partly followed",
  broken: "Not followed", "not-reviewed": "Not reviewed",
} satisfies Record<(typeof dayProcessChoices)[number], string>;

export default function ReadingRoomDone({ active, store, props, onEnd, onBrowse, onReflect, onTradeQuality, children }: {
  active: boolean;
  store: ProcessStore;
  props: Props;
  onEnd: () => Promise<void>;
  onBrowse: () => void;
  onReflect: () => Promise<void>;
  onTradeQuality: () => void;
  children: ReactNode;
}) {
  const p = props.pulse;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = dateInZone(p.now, timezone);
  const day = tradingDayFor(store.records, date, timezone);
  const [ending, setEnding] = useState(false);
  const [writing, setWriting] = useState(false);
  const writeLock = useRef(false);
  const [reviewDate, setReviewDate] = useState<string>();
  const [sessionError, setSessionError] = useState("");
  const [error, setError] = useState("");
  const [reflectionError, setReflectionError] = useState("");
  const sessions = active
    ? [...new Map([...props.history, props.session]
        .filter((session) => session.owner === p.owner)
        .map((session) => [session.id, session])).values()]
    : [];
  const trades = completedOn(sessions, date, timezone);
  const ended = sessions.some((session) => !session.demo && session.id !== "workspace" &&
    session.endedAt && session.endedAt <= p.now && dateInZone(session.endedAt, timezone) === date);
  const count = day?.body.stillness?.filter((choice) => choice.destination === "Done").length ?? 0;
  const pending = props.capture?.pendingCapture;
  const review = reviewDate === date;
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

  async function openReview() {
    if (review) { setReviewDate(undefined); return; }
    await write(async (records) => {
      if (tradingDayFor(records, date, timezone) ||
        await store.save([createRecord("day", emptyTradingDay(date, timezone))])) setReviewDate(date);
    });
  }

  const chips = <K extends keyof DayCloseout, V extends NonNullable<DayCloseout[K]>>(
    field: K, label: string, values: readonly V[], labels: Record<V, string>,
  ) => (
    <div className="rr-preparation-chips" role="group" aria-label={label}>
      {values.map((value) => <button key={value} aria-pressed={day?.body.closeout?.[field] === value}
        disabled={unavailable} onClick={() => choose(field, value)}>{labels[value]}</button>)}
    </div>
  );

  return (
    <div className={active ? "rr-preparation rr-done" : "rr-done-bridge"}>
      {active && <>
        <header className="rr-preparation-heading">
          <div>
            <p className="rr-preparation-kicker">Done for the day / Let go</p>
            <h1>You can put the day down.</h1>
            <p>The result is part of your day. It isn’t all of it.</p>
          </div>
          <button onClick={onBrowse}>+ Find closing support</button>
        </header>
        <aside className="rr-preparation-rail" aria-label="Today’s path">
          <p className="rr-preparation-kicker">Today’s path</p>
          <ol>
            <li><a href="#done-outcome">Name the day<small>Record the outcome</small></a></li>
            <li><a href="#done-process">Review your process<small>How you followed your plan</small></a></li>
            <li><a href="#done-support">Closing support<small>{count} {count === 1 ? "choice" : "choices"} for today</small></a></li>
            <li><a href="#done-reflection">Reflect, if you want<small>Open your Journal</small></a></li>
          </ol>
          <div className="rr-preparation-setup">A trade, a recording and a completed checklist are all optional.</div>
        </aside>
        <section className="rr-preparation-start rr-done-session" aria-label="Session controls">
          <div>
            <strong role="status"><i aria-hidden="true" />{ending ? "Ending session…" : p.active ? "Session in progress" : ended ? "Session ended" : "No session running"}</strong>
            <p>{pending ? "Confirm or discard your capture draft before ending." : p.active ? "End the session when you’re ready. Everything below is optional." : "You can leave now or take a moment to close the day."}</p>
          </div>
          {(p.active || ending) && <button className="ss-primary" disabled={ending || pending} onClick={() => void end()}>End session</button>}
          {!p.active && !ending && <button onClick={() => props.onPage("Home")}>Back to Home</button>}
          {sessionError && <p role="alert">{sessionError}</p>}
        </section>
        <section className="rr-preparation-card rr-done-outcome" id="done-outcome" aria-labelledby="done-outcome-title">
          <div className="rr-preparation-label"><span className="rr-preparation-kicker">01 / Your outcome</span><span className="rr-preparation-optional">Optional</span></div>
          <h2 id="done-outcome-title">How did today turn out?</h2>
          <p>Choose the result that fits your day.</p>
          {chips("outcome", "Day outcome", dayOutcomes, outcomes)}
        </section>
        <section className="rr-preparation-card rr-done-process" id="done-process" aria-labelledby="done-process-title">
          <div className="rr-preparation-label"><span className="rr-preparation-kicker">02 / Your process</span><span className="rr-preparation-optional">Optional</span></div>
          <h2 id="done-process-title">How did you follow your plan?</h2>
          <p>Think about your choices, including any decision to sit out.</p>
          {chips("process", "How you followed your plan", dayProcessChoices, processes)}
          <div className="rr-done-trades">
            <p>{trades.length ? `${trades.length} fully closed ${trades.length === 1 ? "trade" : "trades"} today. Each trade keeps its own rule checks.` : "No completed trades to review today."}</p>
            {!!trades.length && <button disabled={unavailable} aria-expanded={review} onClick={() => void openReview()}>{review ? "Hide trade review" : "Review trades and rules"}</button>}
            <button onClick={onTradeQuality}>Open Trade Quality ↗</button>
          </div>
          {review && day && <SessionReviewGuide embedded key={day.rootId} store={store} props={props} day={day} />}
          {error && <p role="alert">{error}</p>}
        </section>
        <div className="rr-preparation-support-heading" id="done-support"><h2>03 / Your support for today</h2></div>
      </>}
      {children}
      {active && <section className="rr-preparation-card rr-done-reflection" id="done-reflection" aria-labelledby="done-reflection-title">
        <div className="rr-preparation-label"><span className="rr-preparation-kicker">04 / A little perspective</span><span className="rr-preparation-optional">Optional</span></div>
        <h2 id="done-reflection-title">Anything you want to keep?</h2>
        <p>Open today’s Journal to write or speak a reflection, or leave it here.</p>
        <div className="rr-home-actions">
          <button className="ss-primary" disabled={pending || ending} onClick={() => {
            setReflectionError("");
            void onReflect().catch((cause: Error) => setReflectionError(cause.message));
          }}>Reflect in Daily journal ↗</button>
        </div>
        {reflectionError && <p role="alert">{reflectionError}</p>}
      </section>}
    </div>
  );
}
