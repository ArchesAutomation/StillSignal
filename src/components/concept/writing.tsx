"use client";
import { useEffect, useState } from "react";
import type { JournalEntry, Sample, Session } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import { destination, sessionTrades, validateDestination } from "@/lib/journal-routing";
import CollectedNotes from "./collected-notes";
import { useJournalDraft } from "../use-journal-draft";
import Destination from "./destination";
import { cx, Title, time as displayTime } from "./shared";
const prompts = [
  { section: "before", text: "What did you notice before this setup appeared?" },
  { section: "entry", text: "Why did you take this entry, and did it follow your plan?" },
  { section: "management", text: "While managing this position, what held most of your attention?" },
  { section: "exit", text: "What led to this exit, and did it follow your plan?" },
  { section: "after", text: "What did you notice yourself wanting to do after the exit?" },
] as const;
const dayPrompts = [
  { section: undefined, text: "How are you feeling today, even without taking a trade?" },
  { section: undefined, text: "What do you notice in your body right now?" },
  { section: undefined, text: "What is on your mind, and what would support you today?" },
] as const;
type Draft = { text: string; answer: string; deep: string; prompt: number; section: JournalEntry["section"]; tradeId: string; custom: string; choice: string; timed: boolean };
const empty: Draft = { text: "", answer: "", deep: "", prompt: 0, section: undefined, tradeId: "", custom: "", choice: "", timed: false };
export default function Writing({ time, session, onSave, onReflect, onReview, selection, samples, sampleNoteIds, onEdit }: {
  time: number; session: Session; onSave: (n: JournalEntry) => Promise<void>;
  onReflect: (d: ReflectionDraft) => void; onReview: () => void;
  selection?: { section: JournalEntry["section"]; tradeId: string };
  samples: Sample[]; sampleNoteIds: Set<string>; onEdit: (note: JournalEntry) => void;
}) {
  const [stored, store, ready] = useJournalDraft(`ss-v4-writing:${session.owner}:${session.id}`);
  const hasTrades = sessionTrades(session).length > 0;
  const questions = hasTrades ? prompts : dayPrompts;
  let draft = empty;
  try { draft = { ...empty, ...JSON.parse(stored || "{}") }; } catch {}
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setFocus(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [focus]);
  const change = (patch: Partial<Draft>) => { store(JSON.stringify({ ...draft, ...patch })); setStatus(""); };
  useEffect(() => {
    if (ready && selection) change({ section: selection.section, tradeId: selection.tradeId });
  // Selection changes deliberately choose a journal destination across panes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.section, selection?.tradeId, ready]);
  const target = (section = draft.section) => ({
    section, tradeId: draft.tradeId || undefined,
    customSection: section === "custom" ? draft.custom : undefined,
  });
  async function save(value: string, kind: "text" | "answer" | "deep") {
    if (!value.trim() || busy) return;
    const question = questions[draft.prompt % questions.length];
    const section = kind === "answer" && hasTrades ? question.section : draft.section;
    setBusy(true); setStatus("Saving…");
    try {
      const note: JournalEntry = {
        id: crypto.randomUUID(), t: Date.now(), eventTime: draft.timed ? time : null,
        label: "Unlabelled", text: value, source: "typed", origin: "free-writing", ...target(section),
        ...(kind === "answer" ? { prompt: { id: `${hasTrades ? "phase" : "day"}-${draft.prompt % questions.length}`, question: question.text } } : {}),
        ...(kind === "deep" ? { prompt: { id: "deeper", question: "What happened immediately before the action?", ...(draft.choice && draft.choice !== "Something else" ? { choice: draft.choice } : {}) } } : {}),
      };
      validateDestination(note, session);
      await onSave(note);
      change({ [kind]: "", ...(kind === "answer" ? { prompt: (draft.prompt + 1) % questions.length } : {}) });
      setStatus(`Saved to My Journal · ${destination(note, session)}.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save. Your draft is still here."); }
    finally { setBusy(false); }
  }
  function dictate(value: string) {
    onReflect({ t: time, eventTime: draft.timed ? time : null, ...target(), origin: "free-writing", source: "voice", autoListen: true, initialText: value });
  }
  return <section className={cx("writing-workspace", focus && "writing-focus")} aria-label="Main journal">
    <div className={cx("paper")}>
      <Title title="My journal" description="Your words, organised by trade and phase.">
        <div className={cx("journaltools")}>
          <button className={cx("ghost")} onClick={() => setFocus(v => !v)}>{focus ? "Close focus" : "Expand journal"}</button>
          <button className={cx("ghost")} onClick={onReview}>Review session</button>
        </div>
      </Title>
      <Destination session={session} section={draft.section} tradeId={draft.tradeId} custom={draft.custom}
        onSection={section => change({ section })} onTrade={tradeId => change({ tradeId })} onCustom={custom => change({ custom })} />
      <label className={cx("time-link")}><input type="checkbox" checked={draft.timed} onChange={e => change({ timed: e.target.checked })} />
        Link to selected time {displayTime(time)} and recorded HR
      </label>
      <textarea className={cx("journal-text")} aria-label="Journal reflection" maxLength={2000} disabled={!ready || busy} value={draft.text} onChange={e => change({ text: e.target.value })} placeholder="Write what happened, in your own words…" />
      <div className={cx("writing-actions")}>
        <button className={cx("primary")} disabled={busy || !draft.text.trim()} onClick={() => void save(draft.text, "text")}>Save to journal</button>
        <button className={cx("ghost")} onClick={() => dictate(draft.text)}>● Speak instead</button>
        <button className={cx("ghost")} onClick={() => onReflect({ t: time, eventTime: draft.timed ? time : null, ...target(), origin: "free-writing", initialText: draft.text })}>Add screenshot</button>
        <span role="status">{status || (draft.text || draft.answer || draft.deep ? "Unsaved changes · draft kept on this device" : "Ready to write")}</span>
      </div>
      <CollectedNotes session={session} samples={samples} sampleNoteIds={sampleNoteIds} onEdit={onEdit} />
    </div>
    <section className={cx("promptcarousel")} aria-label="Phase question">
      <div><div className={cx("eyebrow")}>One question · one location</div>
      <h3>{questions[draft.prompt % questions.length].text}</h3>
      <p>{hasTrades ? `Destination: ${destination({ section: questions[draft.prompt % questions.length].section, tradeId: draft.tradeId }, session)}. Choose a trade before saving.` : "Your feelings matter on days without trades too. Save here without a trade or CSV."}</p>
      {hasTrades && <Destination session={session} section={questions[draft.prompt % questions.length].section} tradeId={draft.tradeId} custom=""
        onSection={section => { const index = prompts.findIndex(p => p.section === section); if (index >= 0) change({ prompt: index }); }} onTrade={tradeId => change({ tradeId })} onCustom={() => {}} />}
      <textarea aria-label="Prompt answer" maxLength={2000} disabled={busy} value={draft.answer} onChange={e => change({ answer: e.target.value })} />
      </div><div><div className={cx("promptnav")}><button className={cx("ghost")} aria-label="Previous prompt" disabled={!!draft.answer || busy} onClick={() => change({ prompt: (draft.prompt + questions.length - 1) % questions.length })}>←</button>
      <button className={cx("primary")} disabled={busy || !draft.answer.trim()} onClick={() => void save(draft.answer, "answer")}>Save answer</button>
      <button className={cx("ghost")} disabled={!!draft.answer || busy} onClick={() => change({ prompt: (draft.prompt + 1) % questions.length })}>Next prompt →</button>
      </div><p className={cx("timeline-note")}>The question guides you. It is not copied into the journal.</p></div>
    </section>
    <details className={cx("journalquestions")}><summary>Explore a little deeper</summary>
      <h3>What happened immediately before the action?</h3>
      <div className={cx("choicechips")}>{["Fear of missing the move", "Frustration after the loss", "Urgency after waiting", "Something else"].map(choice =>
        <button key={choice} className={cx(choice === draft.choice && "active")} onClick={() => change({ choice })}>{choice}</button>)}</div>
      <textarea aria-label="Deeper reflection" maxLength={2000} value={draft.deep} onChange={e => change({ deep: e.target.value })} placeholder="Which rule, sensation or thought was present?" />
      <button className={cx("primary")} disabled={busy || !draft.deep.trim()} onClick={() => void save(draft.deep, "deep")}>Save reflection</button>
    </details>
  </section>;
}
