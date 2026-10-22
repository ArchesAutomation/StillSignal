"use client";
import { useState } from "react";
import type { JournalEntry, Sample, Session } from "@/lib/model";
import { nearest } from "@/lib/analytics";
import { collectedNotes, journalPlacement, journalSources } from "@/lib/journal-collection";
import { destination, noteTime, sectionName, sessionTrades } from "@/lib/journal-routing";
import { Screenshot } from "../reflection-editor";
import { cx, time } from "./shared";

export default function CollectedNotes({ session, samples, sampleNoteIds, onEdit }: {
  session: Session; samples: Sample[]; sampleNoteIds: Set<string>;
  onEdit: (note: JournalEntry) => void;
}) {
  const [tradeId, setTradeId] = useState(""), [stage, setStage] = useState(""), [limit, setLimit] = useState(6);
  const notes = collectedNotes(session, tradeId, stage);
  const trades = sessionTrades(session);
  const placements = new Map(notes.map(note => [note.id, journalPlacement(note, session, trades)]));
  const sorted = notes.filter(n => !placements.get(n.id)!.unsorted);
  const unsorted = notes.filter(n => placements.get(n.id)!.unsorted);
  const visible = sorted.slice(0, limit);
  function record(note: JournalEntry) {
    const occurredAt = noteTime(note);
    const bpm = note.context?.bpm ?? (occurredAt !== null && sampleNoteIds.has(note.id) ? nearest(samples, occurredAt)?.bpm : undefined);
    return <article key={note.id} className={cx("journal-record")} data-phase={note.section}>
      <div className={cx("record-heading")}><strong>{destination(note, session)}</strong>
        <button className={cx("textlink")} onClick={() => onEdit(note)}>{placements.get(note.id)!.unsorted ? "Assign / edit" : "Edit note"}</button></div>
      <small>{journalSources(note).join(" · ")} · {occurredAt === null ? `Saved ${time(note.t)} · No event time linked` : time(occurredAt)}
        {bpm !== undefined ? ` · ${Math.round(bpm)} BPM` : " · No linked HR"}
        {note.context?.baseline !== undefined ? ` · Baseline ${Math.round(note.context.baseline)} BPM` : ""}
        {note.captureScope?.windowSeconds && occurredAt !== null ? ` · HR window ±${note.captureScope.windowSeconds}s` : ""}
      </small>
      {note.prompt && <details className={cx("record-prompt")}><summary>Prompt</summary><p>{note.prompt.question}</p></details>}
      {note.text && <p>{note.text}</p>}
      {note.screenshot && <Screenshot {...note.screenshot} />}
    </article>;
  }
  return <section className={cx("collected-notes")} aria-label="Collected journal notes">
    <div className={cx("collection-heading")}><div><h3>Collected notes</h3><p>Everything you saved to this day’s journal.</p></div><span>{notes.length} note{notes.length === 1 ? "" : "s"}</span></div>
    <div className={cx("collection-filters")}>
      <label>Trade<select aria-label="Filter journal trade" value={tradeId} onChange={e => { setTradeId(e.target.value); setLimit(6); }}>
        <option value="">All trades</option>{trades.map((trade, i) => <option value={trade.id} key={trade.id}>Trade {i + 1} · {trade.symbol}</option>)}
      </select></label>
      <label>Stage<select aria-label="Filter journal stage" value={stage} onChange={e => { setStage(e.target.value); setLimit(6); }}>
        <option value="">All notes</option>{(["before", "entry", "management", "exit", "after", "day-review", "post-session"] as const).map(s => <option key={s} value={s}>{sectionName(s)}</option>)}
        <option value="unsorted">Unsorted</option>
      </select></label>
    </div>
    {visible.map(record)}
    {sorted.length > limit && <button className={cx("textlink")} onClick={() => setLimit(v => v + 6)}>Show more notes ({sorted.length - limit})</button>}
    {!!unsorted.length && <details className={cx("unsorted-notes")} open={stage === "unsorted" || undefined}>
      <summary>Unsorted · {unsorted.length}</summary><p>Choose a trade or stage when you know where these belong.</p>
      {unsorted.slice(0, limit).map(record)}
      {unsorted.length > limit && <button className={cx("textlink")} onClick={() => setLimit(v => v + 6)}>Show more unsorted notes</button>}
    </details>}
    {!notes.length && <p className={cx("empty-note")}>{session.journal.some(n => !n.deletedAt) ? "No notes match these filters." : "Your saved writing, reflections and captures will appear here."}</p>}
  </section>;
}
