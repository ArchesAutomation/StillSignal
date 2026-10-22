"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry, Session } from "@/lib/model";
import { liveNotes } from "@/lib/smart-journal";
import { cx, Title, time } from "./shared";
import PostSession from "./post-session";
const headings = ["Before the trade", "During the trade", "Exit and after"];
const prompts = [
  "What did you notice before taking the entry?",
  "Did the response alter a decision?",
  "What would help you reset?",
];
const prefix = "Session review\n\n";
function valuesOf(text = "") {
  return headings.map((h, i) => {
    const start = text.indexOf(h + "\n");
    if (start < 0) return "";
    const end =
      i < 2 ? text.indexOf("\n\n" + headings[i + 1], start) : text.length;
    return text.slice(start + h.length + 1, end < 0 ? undefined : end);
  });
}
export default function Review({
  session,
  time: timestamp,
  onSave,
  onReflect,
}: {
  session: Session;
  time: number;
  onSave: (n: JournalEntry) => Promise<void>;
  onReflect: (t: number) => void;
}) {
  const previous = liveNotes(session.journal)
      .filter((n) => n.text.startsWith(prefix))
      .at(-1),
    dirty = useRef(false);
  const [values, setValues] = useState(() => valuesOf(previous?.text)),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => {
    if (!dirty.current) setValues(valuesOf(previous?.text));
  }, [previous?.id, previous?.text]);
  const entries = session.events.filter((e) => !e.voided && e.kind === "entry"),
    exits = session.events.filter((e) => !e.voided && e.kind === "exit");
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      await onSave({
        ...previous,
        id: previous?.id || crypto.randomUUID(),
        t: previous?.t ?? timestamp,
        eventTime: null,
        section: "day-review",
        label: previous?.label || "Unlabelled",
        source: "typed",
        text:
          prefix +
          headings.map((h, i) => h + "\n" + values[i].trim()).join("\n\n"),
      });
      dirty.current = false;
      setStatus("Review saved");
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Could not save. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Session reflection review">
      <Title
        title="Mindful trade review"
        description="Completed after the session. Still Signal organises the evidence; you confirm what it meant."
      >
        <button
          className={cx("primary")}
          disabled={busy || !values.some((v) => v.trim())}
          onClick={() => void save()}
        >
          {busy
            ? "Saving…"
            : status === "Review saved"
              ? status
              : "Save review"}
        </button>
      </Title>
      <div className={cx("reviewmeta")}>
        ✦ YOUR REFLECTION · EDITABLE · BASED ON TODAY’S TIMELINE AND YOUR WORDS
      </div>
      <div className={cx("reviewgrid")}>
        {headings.map((h, i) => (
          <div className={cx("reviewcol")} key={h}>
            <h3>{h}</h3>
            <p>
              <strong>Observed:</strong>{" "}
              {i === 0
                ? entries.length
                  ? `${entries.length} entries recorded. First entry at ${time(entries[0].t)}.`
                  : "No entry events recorded."
                : i === 1
                  ? `${entries.length + exits.length} entry and exit events in this session.`
                  : exits.length
                    ? `${exits.length} exits recorded. Last exit at ${time(exits.at(-1)!.t)}.`
                    : "No exit events recorded."}
            </p>
            <label className={cx("reviewprompt")} htmlFor={`ss-review-${i}`}>
              {prompts[i]}
            </label>
            <textarea
              id={`ss-review-${i}`}
              aria-label={h}
              value={values[i]}
              maxLength={600}
              disabled={busy}
              placeholder="What did you notice?"
              onChange={(e) => {
                dirty.current = true;
                setStatus("");
                setValues((v) =>
                  v.map((s, j) => (j === i ? e.target.value : s)),
                );
              }}
            />
          </div>
        ))}
      </div>
      <div className={cx("phasebuttons")}>
        {[
          "+ Add before-trade detail",
          "+ Add decision",
          "+ Add after-trade reflection",
        ].map((label, i) => (
          <button
            className={cx("ghost")}
            key={label}
            onClick={() =>
              onReflect(
                i === 0
                  ? entries[0]?.t || session.startedAt
                  : i === 1
                    ? entries[0]?.t || timestamp
                    : timestamp,
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
      {status && (
        <p className={cx("save-status")} role="status">
          {status}
        </p>
      )}
      <PostSession session={session} onSave={onSave} />
    </section>
  );
}
