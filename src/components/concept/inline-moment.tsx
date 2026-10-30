"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry, Session } from "@/lib/model";
import { noteTime } from "@/lib/journal-routing";
import { labelsFor } from "@/lib/journal-reference";
import { phaseColors } from "@/lib/phase-colors";
import { AudioPlayback } from "../reflection-audio";
import { Screenshot } from "../reflection-editor";
import PrivateImage from "../private-image";
import Destination from "./destination";
import { cx, time } from "./shared";

/** The same canonical note is edited in the day and trade-stage views. */
export default function InlineMoment({
  note,
  session,
  onSave,
  onEdit,
  onRevisit,
  onSelect,
  selected,
  highlightColor,
  bpm,
  timezone,
}: {
  note: JournalEntry;
  session: Session;
  onSave: (note: JournalEntry) => Promise<void>;
  onEdit?: (note: JournalEntry) => void;
  onRevisit?: (note: JournalEntry) => void;
  onSelect?: (note: JournalEntry) => void;
  selected?: boolean;
  highlightColor?: string;
  bpm?: number | null;
  timezone?: string;
}) {
  const [label, setLabel] = useState(
    note.label === "Unlabelled" ? "" : note.label,
  );
  const [text, setText] = useState(note.text),
    [open, setOpen] = useState(false);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [removed, setRemoved] = useState(!!note.deletedAt);
  const latest = useRef(note),
    pending = useRef(Promise.resolve()),
    dirty = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (onSelect && textarea.current) {
      textarea.current.style.height = "auto";
      textarea.current.style.height = `${textarea.current.scrollHeight}px`;
    }
  }, [text, onSelect]);
  useEffect(() => {
    latest.current = note;
    if (!dirty.current) {
      setText(note.text);
      setLabel(note.label === "Unlabelled" ? "" : note.label);
    }
  }, [note]);
  async function write(patch: Partial<JournalEntry>, message = "Saved") {
    setBusy(true);
    setStatus("Saving…");
    const task = pending.current.then(async () => {
      const value = { ...latest.current, ...patch };
      await onSave(value);
      latest.current = value;
      dirty.current = false;
      setStatus(message);
    });
    pending.current = task.catch(() => {});
    try {
      await task;
      return true;
    } catch (e) {
      setStatus(
        `Could not save. ${e instanceof Error ? e.message : "Your edit is still here."}`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function saveFields() {
    const next = label.trim() || "Unlabelled";
    if (next === latest.current.label && text === latest.current.text) return;
    void write({
      label: next,
      text,
      ...(next !== latest.current.label
        ? { labelAddedAt: latest.current.labelAddedAt ?? Date.now() }
        : {}),
    });
  }
  if (removed)
    return (
      <div className={cx("moment-undo")} role="status">
        Moment removed.{" "}
        <button
          disabled={busy}
          onClick={async () => {
            if (await write({ deletedAt: undefined }, "Restored"))
              setRemoved(false);
          }}
        >
          Undo removal
        </button>
        <span>
          {status.startsWith("Could not")
            ? status
            : "Original evidence retained."}
        </span>
      </div>
    );
  return (
    <article
      id={`moment-${note.id}`}
      className={cx(
        "inline-moment",
        "stream-note",
        onSelect && "space-moment",
        selected && "space-selected",
      )}
      data-note-id={note.id}
      style={selected ? {boxShadow:`inset 3px 0 ${highlightColor || phaseColors[note.section || "reflection"] || phaseColors.reflection}`,backgroundColor:`${highlightColor || phaseColors[note.section || "reflection"] || phaseColors.reflection}0c`} : undefined}
    >
      <div className={cx("inline-moment-head")}>
        <time>
          {noteTime(note) === null
            ? "Session note"
            : time(noteTime(note)!, true, timezone)}
        </time>
        <input
          aria-label="Feeling or thought"
          maxLength={40}
          list={`labels-${note.id}`}
          placeholder="Add feeling / thought…"
          value={label}
          onChange={(e) => {
            dirty.current = true;
            setLabel(e.target.value);
          }}
          onBlur={saveFields}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <datalist id={`labels-${note.id}`}>
          {labelsFor(note.section).map((l) => (
            <option key={l}>{l}</option>
          ))}
        </datalist>
        <small>
          <span
            className={cx(
              "capture-badge",
              note.captureMode === "post-session" && "later-badge",
            )}
          >
            {note.captureMode === "live"
              ? "Live"
              : note.captureMode === "post-session"
                ? "Added later"
                : "Origin unknown"}
          </span>
          {note.labelAddedAt && note.labelAddedAt > (note.capturedAt ?? note.t)
            ? " · labelled later"
            : ""}
          {note.section ? <>{" · "}<span className={cx("moment-stage")} data-stage={note.section} style={{color:phaseColors[note.section] || phaseColors.reflection,borderColor:`${phaseColors[note.section] || phaseColors.reflection}40`,backgroundColor:`${phaseColors[note.section] || phaseColors.reflection}12`}}>{note.section[0].toUpperCase()+note.section.slice(1)}</span></> : " · No stage"}
          {bpm === undefined
            ? note.context?.bpm === undefined
              ? ""
              : ` · ${Math.round(note.context.bpm)} BPM`
            : bpm === null
              ? " · HR unavailable"
              : ` · ${Math.round(bpm)} BPM`}
        </small>
        <button
          aria-label={
            onSelect ? "Open moment evidence" : "Expand moment evidence"
          }
          aria-expanded={open}
          onClick={() =>
            onSelect ? onSelect(latest.current) : setOpen((v) => !v)
          }
        >
          {onSelect
            ? note.capture?.imagePath || note.screenshot
              ? "↗"
              : "+"
            : open
              ? "−"
              : "+"}
        </button>
        <button
          aria-label="Remove moment"
          disabled={busy}
          onClick={async () => {
            if (await write({ deletedAt: Date.now() }, "Removed"))
              setRemoved(true);
          }}
        >
          ×
        </button>
      </div>
      <textarea
        ref={textarea}
        aria-label="Moment writing"
        rows={Math.max(
          1,
          Math.min(
            12,
            Math.max(text.split("\n").length, Math.ceil(text.length / 110)),
          ),
        )}
        maxLength={2000}
        placeholder="Write what you noticed…"
        value={text}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
        onBlur={saveFields}
      />
      {onSelect && (note.capture?.imagePath || note.screenshot) && (
        <button
          className={cx("space-thumb")}
          aria-label="Open chart capture"
          onClick={() => onSelect(latest.current)}
        >
          {note.capture?.imagePath ? (
            <PrivateImage path={note.capture.imagePath} owner={session.owner} thumbnail />
          ) : note.screenshot ? (
            <Screenshot {...note.screenshot} thumbnail />
          ) : null}
        </button>
      )}
      <div className={cx("inline-save")} role="status">
        {status}
        {status.startsWith("Could not") && (
          <button onClick={saveFields}>Retry save</button>
        )}
      </div>
      {open && (
        <div className={cx("inline-evidence")}>
          <small>
            Captured {new Date(note.capturedAt ?? note.t).toLocaleString()}
            {note.labelAddedAt
              ? ` · label added ${new Date(note.labelAddedAt).toLocaleString()}`
              : ""}
          </small>
          {note.prompt && <p>{note.prompt.question}</p>}
          {note.audio && (
            <AudioPlayback
              owner={session.owner}
              audio={note.audio}
              onDelete={() => write({ audio: undefined }).then(() => {})}
            />
          )}
          <details>
            <summary>
              Original transcript ·{" "}
              {note.transcriptStatus ||
                (note.originalTranscript ? "available" : "not recorded")}
            </summary>
            <p>
              {note.originalTranscript ||
                "No transcript available. Original audio is kept separately."}
            </p>
          </details>
          {note.capture?.imagePath && (
            <PrivateImage owner={session.owner} path={note.capture.imagePath} />
          )}
          {note.screenshot && <Screenshot {...note.screenshot} />}
          {note.capture && !note.capture.imagePath && (
            <small>{note.capture.imageMissing}</small>
          )}
          <Destination
            session={session}
            section={note.section}
            tradeId={note.tradeId || ""}
            custom={note.customSection || ""}
            onSection={(section) => void write({ section })}
            onTrade={(tradeId) => void write({ tradeId: tradeId || undefined })}
            onCustom={(customSection) => void write({ customSection })}
          />
          {onEdit && (
            <button onClick={() => onEdit(latest.current)}>
              Change attachment or linked time
            </button>
          )}
          {onRevisit && (
            <button onClick={() => onRevisit(latest.current)}>
              Reflect on this moment later
            </button>
          )}
        </div>
      )}
    </article>
  );
}
