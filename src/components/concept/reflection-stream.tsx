"use client";
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
    .filter((n) => !n.deletedAt)
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
        <details id={"moment-" + n.id} key={n.id} className={cx("stream-note")}>
          <summary>
            <time>
              {noteTime(n) === null ? "Day note" : time(noteTime(n)!)}
            </time>
            <span
              className={cx("provenance-badge")}
              data-origin={n.captureMode}
            >
              {captureMode(n)}
            </span>
            <span aria-label={n.inputMethod || n.source || "text"}>
              {n.source === "voice" || n.inputMethod === "voice"
                ? "● Voice"
                : n.prompt
                  ? "◇ Prompt"
                  : "✎ Text"}
            </span>
            <b>{n.label}</b>
            <span>
              {n.text.slice(0, 130)}
              {n.text.length > 130 ? "…" : ""}
            </span>
          </summary>
          <div className={cx("stream-detail")}>
            <small>
              Captured {new Date(n.capturedAt ?? n.t).toLocaleString()} ·{" "}
              {noteTime(n) === null
                ? "Neutral day reflection"
                : `Session time ${time(noteTime(n)!)}`}{" "}
              · {n.tradeId ? sectionName(n.section) : "Day scope"}
            </small>
            {n.prompt && (
              <blockquote>
                {n.prompt.question}
                {n.prompt.choice && <small>{n.prompt.choice}</small>}
              </blockquote>
            )}
            <p>{n.text}</p>
            <div className={cx("moment-recorded-context")}>
              <small>
                {n.context?.hrWindowMean === undefined
                  ? `Recorded HR at linked time: ${n.context?.bpm === undefined ? "unavailable" : `${n.context.bpm.toFixed(1)} BPM`}`
                  : `HR ±${n.context.hrWindowHalfSeconds || 30}s: ${n.context.hrWindowMean.toFixed(1)} BPM · ${n.context.hrWindowCount} samples${n.context.hrWindowComplete === false ? " · provisional window" : ""}`}
                {n.context?.baseline === undefined
                  ? ""
                  : ` · baseline ${n.context.baseline.toFixed(1)} BPM`}
              </small>
              {(() => {
                const value = momentPnl(session, n);
                return (
                  <small>
                    Review P&L context:{" "}
                    {value ? (
                      <>
                        open{" "}
                        {value.unrealised === undefined
                          ? "unavailable"
                          : money(value.unrealised, value.currency)}{" "}
                        · realised {money(value.realised, value.currency)} ·
                        position {value.position ?? "unknown"} · {value.account}{" "}
                        · {value.source} at{" "}
                        {new Date(value.t).toLocaleTimeString()}
                      </>
                    ) : (
                      "No matching timestamped position/P&L snapshot."
                    )}
                  </small>
                );
              })()}
            </div>
            {n.capture && (
              <details className={cx("moment-evidence")}>
                <summary>View original moment & evidence</summary>
                <p>
                  Record pressed{" "}
                  {new Date(n.capture.pressedAt).toLocaleString()} · confirmed{" "}
                  {new Date(n.capture.confirmedAt).toLocaleString()}
                </p>
                {n.capture.imagePath ? (
                  <PrivateImage
                    owner={session.owner}
                    path={n.capture.imagePath}
                  />
                ) : (
                  <p>{n.capture.imageMissing || "No original chart image."}</p>
                )}
                {n.capture.quote ? (
                  <p>
                    {n.capture.quote.symbol} · {n.capture.quote.price}{" "}
                    {n.capture.quote.currency} · {n.capture.quote.source} ·
                    quote observed{" "}
                    {new Date(n.capture.quote.observedAt).toLocaleString()}
                  </p>
                ) : (
                  <p>{n.capture.quoteMissing}</p>
                )}
                {n.capture.environment && (
                  <p>
                    Environment known at record press:{" "}
                    {Object.values(n.capture.environment)
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </details>
            )}
            {n.originalTranscript && n.originalTranscript !== n.text && (
              <details>
                <summary>Original transcript</summary>
                <p>{n.originalTranscript}</p>
              </details>
            )}
            {n.audio && (
              <AudioPlayback
                audio={n.audio}
                owner={session.owner}
                onDelete={() => onSave({ ...n, audio: undefined })}
              />
            )}
            {n.screenshot && <Screenshot {...n.screenshot} />}
            <button className={cx("textlink")} onClick={() => onEdit(n)}>
              Edit reflection
            </button>
            {onRevisit && (
              <button className={cx("textlink")} onClick={() => onRevisit(n)}>
                Reflect on this moment later
              </button>
            )}
          </div>
        </details>
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
