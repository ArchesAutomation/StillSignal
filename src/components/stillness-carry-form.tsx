"use client";

import type { CarryChoice, CarryStage } from "@/lib/process/away-days";
import { catalogue } from "@/lib/stillness-catalogue";
import { addDays, choiceKey, formatCarryDate, stageOrder } from "@/lib/stillness-carry";
import { useId, useState } from "react";

export type CarryWhen = "today" | "next" | "date";
export type CarryFormValue = {
  when: CarryWhen;
  /** The calendar date for "today" and "date". */
  date?: string;
  stages: CarryStage[];
  note: string;
  /** True only when the trader chose to change a note already saved for this piece and day. */
  editNote: boolean;
  keep: boolean;
  choice?: CarryChoice;
};

const monthName = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
  .format(new Date(`${month}-15T12:00:00Z`));
const shiftMonth = (month: string, by: number) => {
  const value = new Date(`${month}-15T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + by);
  return value.toISOString().slice(0, 7);
};

/** A compact month for choosing a later day. Days already marked away are labelled. */
export function CarryDatePicker({ value, min, max, isAway, onChange }: {
  value?: string; min: string; max: string; isAway: (date: string) => boolean; onChange: (date: string) => void;
}) {
  const [month, setMonth] = useState((value ?? min).slice(0, 7));
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const days = Array.from({ length }, (_, index) => addDays(first, index));
  return <div className="ss-carry-calendar">
    <div className="ss-carry-calendar-head">
      <button type="button" aria-label="Previous month" disabled={month <= min.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
      <strong aria-live="polite">{monthName(month)}</strong>
      <button type="button" aria-label="Next month" disabled={month >= max.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
    </div>
    <div className="ss-carry-calendar-grid" role="group" aria-label={`Choose a day in ${monthName(month)}`}>
      {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index} aria-hidden="true">{day}</span>)}
      {Array.from({ length: offset }, (_, index) => <span key={`gap-${index}`} />)}
      {days.map(date => {
        const away = isAway(date);
        return <button type="button" key={date} disabled={date < min || date > max} aria-pressed={value === date}
          data-away={away || undefined}
          aria-label={`${formatCarryDate(date)}${away ? ", day away" : ""}`}
          onClick={() => onChange(date)}>{Number(date.slice(8))}</button>;
      })}
    </div>
  </div>;
}

/** Every catalogue choice, keeping whole sequences and single pieces distinct. */
const pieceOptions = catalogue.flatMap(item => [
  { key: choiceKey({ itemId: item.id }), label: `${item.name} · ${item.kind.toLowerCase()}`, choice: { itemId: item.id } as CarryChoice },
  ...(item.steps.length > 1 ? item.steps.map(([name], piece) => ({
    key: choiceKey({ itemId: item.id, piece }), label: `   ${name} (from ${item.name})`, choice: { itemId: item.id, piece } as CarryChoice,
  })) : []),
]);

/**
 * Where support goes. Shared by the Stillness Add dialog and the day-away "carry forward" note,
 * so both save the same way. Saving is done by the parent.
 */
export function CarryForm({
  today, initialWhen = "today", initialDate, initialStages, todayStage = "Preparation", allowToday = true, choice, choosePiece = false,
  bookmark = true, initialNote = "", initialChoice, allowEmpty = false, todayOnly = false, isAway, existingNote, busy, error, onSubmit, onOpenAway, onCancel,
}: {
  today: string;
  initialWhen?: CarryWhen;
  initialDate?: string;
  initialStages?: CarryStage[];
  todayStage?: CarryStage;
  allowToday?: boolean;
  /** The piece being added. Leave out with choosePiece to let the trader pick one, or none. */
  choice?: CarryChoice;
  choosePiece?: boolean;
  bookmark?: boolean;
  initialNote?: string;
  initialChoice?: CarryChoice;
  /** A linked reflection can travel without a piece or new words. */
  allowEmpty?: boolean;
  /** Only today, without notes, while carried support is unavailable. */
  todayOnly?: boolean;
  isAway: (date: string) => boolean;
  /** A note already saved for this piece on that day, which a new save must not silently replace. */
  existingNote: (value: { when: CarryWhen; date?: string; choice?: CarryChoice }) => string | undefined;
  busy: boolean;
  error?: string;
  onSubmit: (value: CarryFormValue) => void;
  onOpenAway?: (date: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [when, setWhen] = useState<CarryWhen>(allowToday ? initialWhen : initialWhen === "today" ? "next" : initialWhen);
  const [date, setDate] = useState<string | undefined>(initialDate);
  const [stages, setStages] = useState<CarryStage[]>(initialStages ?? [initialWhen === "today" ? todayStage : "Preparation"]);
  const [note, setNote] = useState(initialNote);
  const [editNote, setEditNote] = useState(false);
  const [keep, setKeep] = useState(false);
  const [picked, setPicked] = useState(initialChoice ? choiceKey(initialChoice) : "");
  const [missing, setMissing] = useState("");
  const selected = choice ?? pieceOptions.find(option => option.key === picked)?.choice;
  const day = when === "today" ? today : when === "date" ? date : undefined;
  const away = !!day && isAway(day);
  const existing = existingNote({ when, date: day, choice: selected });
  const showNoteEditor = !existing || editNote;

  function choose(next: CarryWhen) {
    setWhen(next);
    setMissing("");
    setEditNote(false);
    // Support for a later trading day starts in Preparation. Today keeps the page's own stage.
    setStages([next === "today" ? todayStage : "Preparation"]);
  }

  function submit() {
    if (when === "date" && !date) { setMissing("Choose a day on the calendar."); return; }
    if (!stages.length) { setMissing("Choose Preparation, Done for the day, or both."); return; }
    if (!allowEmpty && !selected && !note.trim() && !existing) { setMissing("Choose a piece or write a note."); return; }
    setMissing("");
    onSubmit({ when, date: day, stages, note, editNote: editNote || !existing, keep, choice: selected });
  }

  const label = away ? (day === today ? "Add to today, a day away" : "Add to this day away")
    : when === "today" ? "Add for today"
    : when === "next" ? "Save for my next trading day"
    : date ? `Save for ${formatCarryDate(date)}` : "Save for that day";

  return <form className="ss-carry-form" onSubmit={event => { event.preventDefault(); if (!busy) submit(); }}>
    {choosePiece && <label className="ss-carry-field">
      <span>A Stillness piece (optional)</span>
      <select value={picked} onChange={event => setPicked(event.target.value)}>
        <option value="">No piece, just the note</option>
        {pieceOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>}
    {!todayOnly && <fieldset>
      <legend>Which day?</legend>
      {allowToday && <label><input type="radio" name={`${id}-when`} checked={when === "today"} onChange={() => choose("today")} /> Today</label>}
      <label><input type="radio" name={`${id}-when`} checked={when === "next"} onChange={() => choose("next")} /> My next trading day</label>
      <label><input type="radio" name={`${id}-when`} checked={when === "date"} onChange={() => choose("date")} /> Choose a date</label>
      {when === "date" && <div className="ss-carry-reveal">
        <div><CarryDatePicker value={date} min={addDays(today, 1)} max={addDays(today, 366)} isAway={isAway} onChange={value => { setDate(value); setMissing(""); setEditNote(false); }} /></div>
      </div>}
      {when === "next" && <p className="ss-support-count">It waits for the next day you open {stages.length === 2 ? "Preparation or Done for the day" : stages[0] === "Done" ? "Done for the day" : "Preparation"} to trade. A day away, or looking back at another date, leaves it waiting.</p>}
    </fieldset>}
    {away ? <div className="ss-carry-away" role="note">
      <p><strong>{day === today ? "Today is a day away from charts." : `${formatCarryDate(day!)} is marked as a day away.`}</strong> {selected ? "The piece" : "Your note"} will be with that day’s review. The day stays a day away.</p>
      {onOpenAway && day && <button type="button" onClick={() => onOpenAway(day)}>Open that day away</button>}
    </div> : <fieldset>
      <legend>{when === "today" ? "Where would you like it?" : "When in that day?"}</legend>
      {stageOrder.map(stage => <label key={stage}>
        <input type="checkbox" checked={stages.includes(stage)}
          onChange={event => setStages(event.target.checked ? stageOrder.filter(item => item === stage || stages.includes(item)) : stages.filter(item => item !== stage))} />{" "}
        {stage === "Done" ? "Done for the day" : stage}
      </label>)}
    </fieldset>}
    {todayOnly ? null : showNoteEditor ? <label className="ss-carry-field">
      <span>{editNote ? "Edit your note for that day" : "A note for that day (optional)"}</span>
      <textarea rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} />
    </label> : <div className="ss-carry-existing">
      <span>Your note for that day</span>
      <blockquote>{existing}</blockquote>
      <button type="button" onClick={() => { setNote(existing ?? ""); setEditNote(true); }}>Edit this note</button>
    </div>}
    {bookmark && <label><input type="checkbox" checked={keep} onChange={event => setKeep(event.target.checked)} /> Also save to my Stillness library</label>}
    {(missing || error) && <p role="alert">{missing || error}</p>}
    <div className="ss-support-actions">
      <button className="ss-support-primary" type="submit" disabled={busy}>{busy ? "Saving…" : label}</button>
      {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}
