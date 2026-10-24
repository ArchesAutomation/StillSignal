"use client";
import { useMemo } from "react";
import type { JournalEntry, Sample, Session, TradeEvent } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import { Screenshot } from "../reflection-editor";
import { journalPhaseLink, journalTradeGroups, type TradePhase } from "@/lib/journal-phases";
import { destination, noteTime, sectionName } from "@/lib/journal-routing";
import { journalSources } from "@/lib/journal-collection";
import { cx, time } from "./shared";

export default function JournalTrades({ session, samples, onReflect, onEdit, onSelect, onInspect, account = "", instrument = "" }: {
  session: Session; samples: Sample[]; onReflect: (draft: ReflectionDraft) => void;
  onEdit: (note: JournalEntry) => void;
  onSelect: (tradeId: string, phase: TradePhase, t: number | null) => void;
  onInspect: (event: TradeEvent) => void;
  account?: string; instrument?: string;
}) {
  const groups = useMemo(() => journalTradeGroups(session), [session]);
  const covered = new Set(groups.trades.flatMap(g => g.phases.flatMap(p => p.executions.map(e => e.id))));
  const matches = (e: TradeEvent) => (!account || (e.broker?.accountId || e.account || "manual") === account) && (!instrument || (e.instrument?.id || e.symbol) === instrument);
  const unmatched = session.events.filter(e => !e.voided && !covered.has(e.id) && matches(e));
  return <div className={cx("journal-trades")} aria-label="Trade journal sequence">
    {groups.trades.map(({ trade, phases }, index) => phases.some(p => p.executions.some(matches)) ? <details key={trade.id} open={index === 0} className={cx("journey-card", "journal-trade")}>
      <summary className={cx("journey-card-head")}>
        <div><span className={cx("eyebrow")}>Trade {index + 1}</span><h3>{trade.symbol} <small>{trade.side}</small></h3></div>
        <span className={cx("journey-date")}>Entry {session.events.find(e => e.id === trade.entryEventId)?.timePrecision === "day" ? "Date only" : time(trade.entry)}<br />
          Exit {trade.exit === undefined ? "Open position" : session.events.find(e => e.id === trade.exitEventId)?.timePrecision === "day" ? "Date only" : time(trade.exit)} · ⌄</span>
      </summary>
      <div className={cx("journey-stages")}>
        {phases.map(({ phase, notes, executions }) => {
          const link = journalPhaseLink(session, trade.id, phase, samples, Date.now(), trade);
          return <section key={phase} className={cx("journey-stage")} data-phase={phase} aria-label={`Trade ${index + 1} ${sectionName(phase)}`}>
            <div className={cx("journey-stage-head")}><span>{sectionName(phase)}</span><strong>{link?.bpm ?? "—"} <small>{link?.bpm == null ? "no HR" : link.sampleCount > 1 ? "avg BPM" : "BPM"}</small></strong></div>
            <p className={cx("journey-sample-note")}>{!link ? "No linked time yet" : link.start === link.end ? time(link.t) : `${time(link.start)}–${time(link.end)} · ${link.sampleCount} recorded HR samples`}</p>
            {executions.map(event => <div key={event.id} className={cx("journal-execution")}>
              <span>{event.source === "csv" ? "Imported execution" : "Recorded execution"} · {event.quantity} @ {event.price}</span>
              <button className={cx("textlink")} onClick={() => onInspect(event)}>Inspect</button>
            </div>)}
            <div className={cx("journey-notes")}>
              {notes.map(note => <article key={note.id} className={cx("journal-phase-note")}>
                <div><b>{note.label}</b><small>{noteTime(note) === null ? "Untimed" : time(noteTime(note)!)} · {journalSources(note).join(" · ")}</small></div>
                <p>{note.text}</p>
                {note.prompt && <details><summary>Prompt</summary><p>{note.prompt.question}</p></details>}
                {note.screenshot && <Screenshot {...note.screenshot} />}
                <button className={cx("textlink")} onClick={() => onEdit(note)}>Edit note / screenshot</button>
              </article>)}
            </div>
            <div className={cx("journal-phase-actions")}>
              <button className={cx("ghost")} onClick={() => onSelect(trade.id, phase, link?.t ?? null)}>Select phase</button>
              <button className={cx("ghost")} onClick={() => onReflect({ t: link?.t ?? session.startedAt, eventTime: link?.t ?? null, section: phase, tradeId: trade.id, origin: "timeline" })}>Write / add screenshot</button>
              <button className={cx("ghost")} onClick={() => onReflect({ t: link?.t ?? session.startedAt, eventTime: link?.t ?? null, section: phase, tradeId: trade.id, origin: "timeline", source: "voice", autoListen: true })}>Speak</button>
            </div>
          </section>;
        })}
      </div>
    </details> : null)}
    {!!groups.ungrouped.length && <section className={cx("journal-day-notes")} aria-label="Day-level and Unsorted notes">
      <h3>Day-level / Unsorted</h3><p>These notes stay in My journal. Assign a trade or phase when you know where they belong.</p>
      {groups.ungrouped.map(note => <article key={note.id} className={cx("journal-phase-note")}><b>{!note.tradeId ? "Day-level · " : ""}{destination(note, session)}</b><p>{note.text}</p>
        {note.screenshot && <Screenshot {...note.screenshot} />}<button className={cx("textlink")} onClick={() => onEdit(note)}>Assign / edit</button></article>)}
    </section>}
    {!!unmatched.length && <details className={cx("journal-day-notes")}><summary>Other session executions · {unmatched.length}</summary>
      {unmatched.map(event => <p key={event.id}>{event.symbol} · {event.timePrecision === "day" ? "Date only" : time(event.t)} · {event.kind} · {event.quantity} @ {event.price} <button className={cx("textlink")} onClick={() => onInspect(event)}>Inspect execution</button></p>)}
    </details>}
    {!groups.trades.length && <p className={cx("empty-note")}>No trades in this day. Your day-level writing is available in My journal.</p>}
  </div>;
}
