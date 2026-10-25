"use client";
import { useEffect, useState } from "react";
import type { JournalEntry, Sample, Session, Settings } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import { validateDestination } from "@/lib/journal-routing";
import { journalPhaseLink } from "@/lib/journal-phases";
import { labelsFor, stages } from "@/lib/journal-reference";
import { useJournalDraft } from "../use-journal-draft";
import Destination from "./destination";
import { cx, time as displayTime } from "./shared";
const questions = [
  "What did you notice before this setup appeared?",
  "Why did you take this entry, and did it follow your plan?",
  "While managing this position, what held most of your attention?",
  "What led to this exit, and did it follow your plan?",
  "What did you notice yourself wanting to do after the exit?",
];
type Draft = {
  text: string;
  section: JournalEntry["section"];
  tradeId: string;
  custom: string;
  label: string;
  manualTime: string;
  timed: boolean;
};
export default function Writing({
  time,
  session,
  onSave,
  onReflect,
  selection,
  samples,
  labels,
}: {
  time: number;
  session: Session;
  onSave: (n: JournalEntry) => Promise<void>;
  onReflect: (d: ReflectionDraft) => void;
  selection?: { section: JournalEntry["section"]; tradeId: string };
  samples: Sample[];
  labels?: Settings["phaseLabels"];
  onReview?: () => void;
  sampleNoteIds?: Set<string>;
  onEdit?: (note: JournalEntry) => void;
}) {
  const [stored, store, ready] = useJournalDraft(
      `ss-v4-writing:${session.owner}:${session.id}`,
    ),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  let draft: Draft = {
    text: "",
    section: undefined,
    tradeId: "",
    custom: "",
    label: "",
    manualTime: "",
    timed: true,
  };
  try {
    const previous = JSON.parse(stored || "{}");
    draft = {
      ...draft,
      ...previous,
      text: [previous.text, previous.answer, previous.deep]
        .filter(Boolean)
        .join("\n\n"),
    };
  } catch {}
  function change(patch: Partial<Draft>) {
    store(JSON.stringify({ ...draft, ...patch }));
    setStatus("");
  }
  useEffect(() => {
    if (ready && selection) change({ ...selection, manualTime: "" });
  }, [selection?.section, selection?.tradeId, ready]);
  const index = stages.indexOf(draft.section as (typeof stages)[number]);
  const question =
    index < 0
      ? "How are you feeling today, even without taking a trade?"
      : questions[index];
  const phase = journalPhaseLink(
    session,
    draft.tradeId,
    draft.section,
    samples,
  );
  const linkedTime = draft.manualTime
    ? new Date(draft.manualTime).getTime()
    : (phase?.t ?? null);
  const noteTime =
    draft.timed && Number.isFinite(linkedTime) ? linkedTime : null;
  const target = {
    section: draft.section,
    tradeId: draft.tradeId || undefined,
    customSection: draft.section === "custom" ? draft.custom : undefined,
  };
  const options = [
    ...new Set(
      ["", ...labelsFor(draft.section, labels), draft.label].filter(
        (v, i) => i === 0 || !!v,
      ),
    ),
  ];
  const save = async () => {
    if (busy || !draft.text.trim()) return;
    setBusy(true);
    try {
      const note: JournalEntry = {
        id: crypto.randomUUID(),
        t: Date.now(),
        eventTime: noteTime,
        label: draft.label || "Unlabelled",
        text: draft.text,
        ...target,
        source: "typed",
        origin: "free-writing",
        prompt: { id: `question-${draft.section || "day"}`, question },
      };
      validateDestination(note, session);
      await onSave(note);
      change({ text: "" });
      setStatus("Saved to My Journal · your day.");
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Could not save. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={cx("reference-composer")} aria-label="Main journal">
      <div className={cx("reference-composer-head")}>
        <div>
          <div className={cx("eyebrow")}>One question · one location</div>
          <h2>{question}</h2>
        </div>
        <button
          disabled={!!draft.text || busy}
          onClick={() =>
            change({ section: stages[(index + 1) % 5], manualTime: "" })
          }
        >
          Next prompt →
        </button>
      </div>
      <Destination
        session={session}
        section={draft.section}
        tradeId={draft.tradeId}
        custom={draft.custom}
        onSection={(section) => change({ section, manualTime: "", label: "" })}
        onTrade={(tradeId) => change({ tradeId, manualTime: "" })}
        onCustom={(custom) => change({ custom })}
      />
      <div className={cx("reference-fields")}>
        <label>
          Your label
          <select
            aria-label="Writing label"
            value={draft.label}
            onChange={(e) => change({ label: e.target.value })}
          >
            {options.map((label) => (
              <option key={label} value={label}>
                {label || "No label"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Linked time
          <input
            type="datetime-local"
            step="1"
            value={draft.manualTime}
            onChange={(e) => change({ manualTime: e.target.value })}
          />
        </label>
      </div>
      <label className={cx("time-link")}>
        <input
          type="checkbox"
          checked={draft.timed && linkedTime !== null}
          disabled={linkedTime === null}
          onChange={(e) => change({ timed: e.target.checked })}
        />
        {linkedTime === null
          ? "No linked time yet · neutral day reflection"
          : `Link to ${displayTime(linkedTime)} · ${phase?.sampleCount ? `${phase.sampleCount} HR samples` : "No measured HR"}`}
      </label>
      <textarea
        className={cx("journal-text")}
        aria-label="Journal reflection"
        maxLength={2000}
        disabled={!ready || busy}
        value={draft.text}
        onChange={(e) => change({ text: e.target.value })}
        placeholder="Write what you noticed…"
      />
      <div className={cx("writing-actions")}>
        <button
          className={cx("primary")}
          disabled={busy || !draft.text.trim()}
          onClick={() => void save()}
        >
          Save to journal
        </button>
        <button
          onClick={() =>
            onReflect({
              t: linkedTime ?? time,
              eventTime: noteTime,
              ...target,
              initialText: draft.text,
              initialLabel: draft.label,
              source: "voice",
              origin: "free-writing",
              autoListen: true,
            })
          }
        >
          Speak instead
        </button>
        <button
          onClick={() =>
            onReflect({
              t: linkedTime ?? time,
              eventTime: noteTime,
              ...target,
              initialText: draft.text,
              initialLabel: draft.label,
              origin: "free-writing",
            })
          }
        >
          Add screenshot
        </button>
        <span role="status">
          {status ||
            (draft.text ? "Draft kept on this device" : "Ready to write")}
        </span>
      </div>
    </section>
  );
}
