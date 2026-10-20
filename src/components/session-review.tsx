"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ArrowUpRight } from "lucide-react";
import { clock, type JournalEntry, type Session } from "@/lib/model";
import { liveNotes } from "@/lib/smart-journal";
import { isActualExecution } from "@/lib/trade-context";
const headings = ["Before the trade", "During the trade", "Exit and after"];
const prompts = [
  "What were you anticipating? What was your plan?",
  "What changed in your attention, thoughts, or decisions?",
  "What stayed with you? What would help you reset?",
];
const prefix = "Session review\n\n";
function reviewValues(text = "") {
  return headings.map((heading, i) => {
    const start = text.indexOf(heading + "\n");
    if (start < 0) return "";
    const end =
      i < 2 ? text.indexOf("\n\n" + headings[i + 1], start) : text.length;
    return text.slice(start + heading.length + 1, end < 0 ? undefined : end);
  });
}
export default function SessionReview({
  session,
  time,
  onSave,
  onJournal,
}: {
  session: Session;
  time: number;
  onSave: (entry: JournalEntry) => Promise<void>;
  onJournal: () => void;
}) {
  const previous = liveNotes(session.journal)
    .filter((n) => n.text.startsWith(prefix))
    .at(-1);
  const [values, setValues] = useState(() => reviewValues(previous?.text));
  const dirty = useRef(false);
  useEffect(() => {
    // Accept edits made in the reflection editor, while preserving an unsaved review draft.
    if (!dirty.current) setValues(reviewValues(previous?.text));
  }, [previous?.id, previous?.text]);
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  const executions = session.events.filter(isActualExecution),
    entries = executions.filter((e) => e.kind === "entry"),
    exits = executions.filter((e) => e.kind === "exit");
  return (
    <section className="session-review" aria-label="Session reflection review">
      <div className="section-heading">
        <div>
          <div className="eyebrow">OBSERVE · INTERPRET · CHOOSE</div>
          <h2>A mindful trade review.</h2>
          <p>Your recorded evidence. Your interpretation.</p>
        </div>
        <button className="text-button" onClick={onJournal}>
          Back to timeline <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="review-grid">
        {headings.map((heading, i) => (
          <div className="review-column" key={heading}>
            <span className="eyebrow">0{i + 1}</span>
            <h3>{heading}</h3>
            <p>
              {i === 0
                ? entries.length
                  ? `${entries.length} entry events. First at ${clock(entries[0].t)}.`
                  : "No entry events recorded."
                : i === 1
                  ? `${executions.length} execution events in this session.`
                  : exits.length
                    ? `${exits.length} exit events. Last at ${clock(exits.at(-1)!.t)}.`
                    : "No exit events recorded."}
            </p>
            <label htmlFor={`review-${i}`}>{prompts[i]}</label>
            <textarea
              id={`review-${i}`}
              value={values[i]}
              disabled={busy}
              maxLength={600}
              placeholder="Make room for your own words…"
              onChange={(e) => {
                dirty.current = true;
                setSaved(false);
                setValues((v) =>
                  v.map((s, index) => (index === i ? e.target.value : s)),
                );
              }}
            />
          </div>
        ))}
      </div>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      <div className="review-save">
        <p>Saved as an editable reflection in this session’s journal.</p>
        <button
          className="button primary"
          disabled={busy || !values.some((v) => v.trim())}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onSave({
                ...previous,
                id: previous?.id || crypto.randomUUID(),
                t: previous?.t ?? time,
                label: previous?.label || "Other",
                text:
                  prefix +
                  headings
                    .map((h, i) => `${h}\n${values[i].trim()}`)
                    .join("\n\n"),
                source: "typed",
              });
              dirty.current = false;
              setSaved(true);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not save your review. Your draft is still here.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {saved ? <Check size={15} /> : null}
          {busy ? "Saving…" : saved ? "Review saved" : "Save review"}
        </button>
      </div>
    </section>
  );
}
