"use client";
import { useEffect, useMemo, useState } from "react";
import { cloudConfigured, pullSession } from "@/lib/cloud";
import { money, type Sample, type Session } from "@/lib/model";
import { getSamples } from "@/lib/storage";
import { buildTradeJourneys, type TradeJourney } from "@/lib/trade-journeys";
import { cx, time } from "./shared";

function JourneyCard({ journey, index, session, onOpen }: {
  journey: TradeJourney;
  index: number;
  session: Session;
  onOpen: (session: Session, timestamp?: number) => void;
}) {
  return (
    <article className={cx("journey-card")}>
      <div className={cx("journey-card-head")}>
        <div>
          <span className={cx("eyebrow")}>{journey.standalone ? `${journey.eventKind || "fill"} execution` : `Trade ${String(index + 1).padStart(2, "0")}`}</span>
          <h3>{journey.symbol} <small>{journey.side}</small></h3>
        </div>
        <span className={cx("journey-date")}>{time(journey.entry, false)}</span>
      </div>
      <div className={cx("journey-order")}>
        <div><span>{journey.standalone ? "Execution" : "Entry"}</span><strong>{journey.quantity} @ {journey.entryPrice}</strong></div>
        <div><span>{journey.exit === undefined ? "Status" : "Exit"}</span><strong>{journey.exit === undefined ? journey.standalone ? "Execution only" : "Open position" : `${time(journey.exit, false)} @ ${journey.exitPrice}`}</strong></div>
      </div>
      {journey.pnl !== undefined && <div className={cx("journey-pnl")}><span>Recorded P&L</span><strong>{money(journey.pnl, journey.currency)}</strong></div>}
      {journey.approximate && <p className={cx("journey-caveat")}>Execution time comes from an order update.</p>}
      {journey.dayOnly && <p className={cx("journey-caveat")}>Only the trade date was recorded, so heart rate cannot be aligned to this execution.</p>}
      <div className={cx("journey-stages")}>
        {journey.stages.map((stage) => (
          <section key={stage.key} className={cx("journey-stage")} data-phase={stage.key}>
            <div className={cx("journey-stage-head")}>
              <span>{stage.title}</span>
              <strong>{stage.bpm === null ? "—" : stage.bpm} <small>{stage.bpm === null ? "no HR" : "BPM"}</small></strong>
            </div>
            {stage.sampleCount > 1 && <small className={cx("journey-sample-note")}>Average of {stage.sampleCount.toLocaleString()} recorded samples</small>}
            {stage.notes.length ? (
              <div className={cx("journey-notes")}>
                {stage.notes.map((note) => (
                  <button key={note.id} onClick={() => onOpen(session, note.t)}>
                    <span><b>Nearby · {note.label || "Reflection"}</b><time>{time(note.t, false)}</time></span>
                    <span>{note.text || "Open reflection"}</span>
                  </button>
                ))}
              </div>
            ) : <p className={cx("journey-no-note")}>No journal entry here</p>}
          </section>
        ))}
      </div>
      <button className={cx("journey-open", "ghost")} onClick={() => onOpen(session, journey.entry)}>Open in full journal →</button>
    </article>
  );
}

function SessionJourneys({ session, selected, selectedSamples, owner, open, onToggle, onOpen }: {
  session: Session;
  selected: Session;
  selectedSamples: Sample[];
  owner: string;
  open: boolean;
  onToggle: () => void;
  onOpen: (session: Session, timestamp?: number) => void;
}) {
  const [loaded, setLoaded] = useState<{ samples: Sample[]; loading: boolean; error: boolean }>({ samples: [], loading: false, error: false });
  const samples = selected.id === session.id && selectedSamples.length >= loaded.samples.length ? selectedSamples : loaded.samples;
  const journeys = useMemo(() => open ? buildTradeJourneys(session, samples) : [], [open, session, samples]);
  const count = useMemo(() => buildTradeJourneys(session, []).length, [session]);
  useEffect(() => {
    if (!open || !session.sampleCount || samples.length >= session.sampleCount) return;
    let alive = true;
    setLoaded((previous) => ({ ...previous, loading: true, error: false }));
    void (async () => {
      let local: Sample[] = [];
      try { local = await getSamples(session.id, owner); } catch { /* Cloud may have the recording. */ }
      let points = local;
      if (points.length < session.sampleCount && cloudConfigured && navigator.onLine) {
        try {
          const remote = await pullSession(session.id);
          if (remote.session.id !== session.id || remote.session.owner !== owner) throw new Error("Workspace identity mismatch.");
          points = [...new Map([...local, ...remote.samples].map((point) => [point.t, point])).values()].sort((a, b) => a.t - b.t);
        } catch { /* Keep local measurements if cloud is unavailable. */ }
      }
      if (alive) setLoaded({ samples: points, loading: false, error: !points.length });
    })();
    return () => { alive = false; };
  }, [open, session.id, session.sampleCount, owner, samples.length]);
  return (
    <section className={cx("journey-session", open && "expanded")}>
      <button className={cx("journey-session-toggle")} aria-expanded={open} aria-controls={`journeys-${session.id}`} onClick={onToggle}>
        <span><strong>{session.name}</strong><small>{new Date(session.startedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {time(session.startedAt, false)} · {session.source}</small></span>
        <span className={cx("journey-session-count")}>{count} {count === 1 ? "trade" : "trades"} · {session.sampleCount.toLocaleString()} HR samples</span>
        <span className={cx("module-chevron")} aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className={cx("journey-session-body")} id={`journeys-${session.id}`}>
          {loaded.loading && <p className={cx("journey-loading")}>Loading heart-rate detail…</p>}
          {loaded.error && <p className={cx("journey-loading")}>Heart-rate detail is unavailable here. Trade and journal entries are still shown.</p>}
          {!loaded.loading && samples.length > 0 && samples.length < session.sampleCount && (
            <p className={cx("journey-loading")}>Showing {samples.length.toLocaleString()} of {session.sampleCount.toLocaleString()} recorded heart-rate samples.</p>
          )}
          {journeys.length ? <div className={cx("journey-grid")}>
            {journeys.map((journey, index) => <JourneyCard key={journey.id} journey={journey} index={index} session={session} onOpen={onOpen} />)}
          </div> : <p className={cx("empty-note")}>No executed trades in this recording.</p>}
        </div>
      )}
    </section>
  );
}

export default function TradeJourneys({ sessions, selected, selectedSamples, owner, onOpen }: {
  sessions: Session[];
  selected: Session;
  selectedSamples: Sample[];
  owner: string;
  onOpen: (session: Session, timestamp?: number) => void;
}) {
  const [openSession, setOpenSession] = useState<string | null>(null);
  const effective = openSession === null ? selected.id : openSession;
  return <div className={cx("journey-session-list")}>
    {sessions.map((session) => <SessionJourneys key={session.id} session={session} selected={selected} selectedSamples={selectedSamples} owner={owner} open={effective === session.id} onToggle={() => setOpenSession(effective === session.id ? "" : session.id)} onOpen={onOpen} />)}
    {!sessions.length && <p className={cx("empty-note")}>Record a session or import your executions to see trade journeys.</p>}
  </div>;
}
