"use client";
import InlineMoment from "./inline-moment";
import { useState } from "react";
import type { JournalEntry, Session } from "@/lib/model";
import { captureMode } from "@/lib/session-timeline";
import { noteTime, sectionName } from "@/lib/journal-routing";
import { AudioPlayback } from "../reflection-audio";
import { Screenshot } from "../reflection-editor";
import PrivateImage from "../private-image";
import { momentPnl } from "@/lib/journal-reference";
import { money } from "@/lib/model";
import { cx, time } from "./shared";
export default function ReflectionStream({
  session,
  onEdit,
  onSave,
  onRevisit,
}: {
  session: Session;
  onEdit: (n: JournalEntry) => void;
  onSave: (n: JournalEntry) => Promise<void>;
  onRevisit?: (n: JournalEntry) => void;
}) {
  const [filter, setFilter] = useState("all");
  const allNotes = session.journal
    .filter((n) => !n.deletedAt || Date.now() - n.deletedAt < 600000)
    .sort(
      (a, b) =>
        (noteTime(a) ?? a.capturedAt ?? a.t) -
        (noteTime(b) ?? b.capturedAt ?? b.t),
    );
  const notes = allNotes.filter((n) => {
    if (filter === "all") return true;
    if (filter === "neutral")
      return (
        !n.tradeId &&
        (!n.section || n.section === "stillness" || n.section === "day-review")
      );
    return n.captureMode === filter;
  });
  return (
    <section
      className={cx("reflection-stream")}
      aria-label="Chronological journal"
    >
      <div className={cx("sectiontitle")}>
        <div>
          <h2>Your day, in your words</h2>
          <p>Live and later reflections keep their own place in the record.</p>
        </div>
        <label>
          Show reflections
          <select
            aria-label="Filter chronological reflections"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All entries</option>
            <option value="live">Live session</option>
            <option value="post-session">Post-session</option>
            <option value="neutral">Neutral reflections</option>
          </select>
        </label>
      </div>
      {notes.map((n) => (
        <InlineMoment
          idPrefix="stream-moment"
          key={n.id}
          note={n}
          session={session}
          onSave={onSave}
          onEdit={onEdit}
          onRevisit={onRevisit}
        />
      ))}
      {!notes.length && (
        <p className={cx("empty-note")}>
          A neutral day reflection can stand on its own. No trade tag is
          required.
        </p>
      )}
    </section>
  );
}
export function DayLabelSummary({
  session,
  sources = [session],
}: {
  session: Session;
  sources?: Session[];
}) {
  const notes = session.journal.filter((n) => !n.deletedAt);
  return (
    <section className={cx("reference-card")} aria-label="Day emotion summary">
      <h2>How you described the day</h2>
      <div className={cx("emotion-summary")}>
        {[...new Set(notes.map((n) => n.label))].map((label) => {
          const rows = notes.filter((n) => n.label === label),
            matched = rows.filter((n) => {
              const s = sources.find((s) =>
                s.journal.some((item) => item.id === n.id),
              );
              return (
                s?.blueprint?.combine?.hr &&
                s.blueprint.combine.transcript &&
                (n.context?.hrWindowMean !== undefined ||
                  n.context?.bpm !== undefined)
              );
            });
          const value = matched.length
            ? matched.reduce(
                (sum, n) => sum + (n.context!.hrWindowMean ?? n.context!.bpm!),
                0,
              ) / matched.length
            : null;
          return (
            <span key={label}>
              {label === "Unlabelled" ? "No label" : label}{" "}
              <b>{rows.length} notes</b>
              <small>
                {value === null
                  ? "No matched HR"
                  : `${value.toFixed(1)} BPM · ${matched.length} matched moments`}
              </small>
            </span>
          );
        })}
      </div>
      <p className={cx("quiet-copy")}>
        Your own labels. Available HR window means stay descriptive; older
        entries may use the nearest recorded sample. Combining sources follows
        your saved data choices.
      </p>
    </section>
  );
}
