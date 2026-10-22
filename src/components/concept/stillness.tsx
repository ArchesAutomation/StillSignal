"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry, Session } from "@/lib/model";
import { destination, isTradeSection, validateDestination } from "@/lib/journal-routing";
import { useJournalDraft } from "../use-journal-draft";
import Destination from "./destination";
import PostSession from "./post-session";
import type { ReflectionDraft } from "../reflection-editor";
import { cx } from "./shared";
const steps = [
  "Let the breath become slow and comfortable. Do not force it.",
  "Notice one physical sensation without calling it good or bad.",
  "Name the thought currently asking for your attention.",
  "What action would remain aligned with your plan?",
];
const topics = {
  Thought:
    "A thought can be present without becoming an instruction. Notice it before deciding whether it deserves action.",
  Ego: "A result may touch the ego without defining the trader. Separate what happened from who you are.",
  Acceptance:
    "Acceptance ends the argument with what has already happened. From there, correction becomes clearer.",
  Identity:
    "Identity is rehearsed through the next small action—not declared by the last result.",
  Stillness:
    "Not entering is not an empty period. Waiting can be an active expression of your process.",
};
export const reflections = [
  "The urge to act is something you can notice before it becomes something you follow.",
  "A loss has already happened. The argument with it is what continues.",
  "Your plan does not need certainty; it needs your presence.",
  "A thought about the market is not the market—and it is not you.",
  "Stillness is not hesitation when it is chosen deliberately.",
  "Describe the behaviour precisely. Leave your identity out of the verdict.",
];
export default function Stillness({
  time,
  onSave,
  onReflect,
  startSignal,
  session,
}: {
  time: number;
  onSave: (n: JournalEntry) => Promise<void>;
  onReflect: (d: ReflectionDraft) => void;
  startSignal: number;
  session: Session;
}) {
  const [text, setText] = useJournalDraft(`ss-stillness:${session.owner}:${session.id}`);
  const [topic, setTopic] = useState<keyof typeof topics>("Thought"),
    [index, setIndex] = useState(0),
    [running, setRunning] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [begun, setBegun] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [link, setLink] = useState(false), [timed, setTimed] = useState(false);
  const [section, setSection] = useState<JournalEntry["section"]>("day-review"), [tradeId, setTradeId] = useState(""), [custom, setCustom] = useState("");
  const route = { section: link ? section : "stillness" as const, tradeId: link && isTradeSection(section) ? tradeId || undefined : undefined, customSection: custom || undefined };
  const elapsedRef = useRef(0);
  function begin() {
    if (elapsedRef.current >= 60) {
      elapsedRef.current = 0;
      setElapsed(0);
    }
    setBegun(true);
    setRunning(true);
  }
  useEffect(() => {
    if (startSignal) begin();
  }, [startSignal]);
  useEffect(() => {
    if (!running) return;
    const start = Date.now() - elapsedRef.current * 1000;
    const timer = setInterval(() => {
      const n = Math.min(60, Math.floor((Date.now() - start) / 1000));
      elapsedRef.current = n;
      setElapsed(n);
      if (n === 60) setRunning(false);
    }, 250);
    return () => clearInterval(timer);
  }, [running]);
  return (
    <div className={cx("stillcanvas")}>
      <div className={cx("stillhead")}>
        <div className={cx("eyebrow")}>
          You do not need to solve this moment
        </div>
        <h1>What is here, right now?</h1>
        <p>Take one breath. Notice first. Words can come afterwards.</p>
      </div>
      <div className={cx("presencegrid")}>
        <section className={cx("noticecard")}>
          <div className={cx("eyebrow")}>A private mindfulness note</div>
          <h2>What are you noticing?</h2>
          <p>
            Private in Stillness until you choose to link it.
          </p>
          <textarea
            aria-label="Mindfulness note"
            value={text}
            maxLength={2000}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            placeholder="A thought, feeling, sensation or urge—without needing to make it sound clever..."
          />
          <label className={cx("time-link")}><input type="checkbox" checked={link} onChange={e => setLink(e.target.checked)} /> Add to main journal</label>
          {link && <Destination session={session} section={section} tradeId={tradeId} custom={custom} onSection={setSection} onTrade={setTradeId} onCustom={setCustom} />}
          <label className={cx("time-link")}><input type="checkbox" checked={timed} onChange={e => setTimed(e.target.checked)} /> Link to current HR window</label>
          <div className={cx("noticeactions")}>
            <button
              className={cx("primary")}
              disabled={busy || !text.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const note: JournalEntry = {
                    id: crypto.randomUUID(),
                    t: Date.now(),
                    eventTime: timed ? time : null,
                    ...route,
                    label: "Unlabelled",
                    text,
                    source: "typed",
                  };
                  validateDestination(note, session);
                  await onSave(note);
                  setText("");
                  setStatus(link ? `Saved to ${destination(note, session)} and today's journal.` : "Saved privately in Stillness.");
                } catch (e) {
                  setStatus(
                    e instanceof Error
                      ? e.message
                      : "Could not save. Your note is still here.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save this moment"}
            </button>
            <button
              className={cx("ghost")}
              onClick={() =>
                onReflect({
                  t: time,
                  eventTime: timed ? time : null,
                  ...route,
                  source: "voice",
                  autoListen: true,
                  initialText: text,
                })
              }
            >
              ● Speak instead
            </button>
            <button
              className={cx("ghost")}
              onClick={() => { setTimed(true); setStatus("HR window selected. Save this moment to confirm the link."); }}
            >
              Link to current HR
            </button>
          </div>
          {status && <p role="status">{status}</p>}
          <div className={cx("private-notes")}>
            {session.journal.filter(n => !n.deletedAt && n.section === "stillness").map(note =>
              <article key={note.id}><p>{note.text}</p><button className={cx("textlink")} onClick={() => {
                setText(note.text); setLink(true); setStatus("Choose a destination, then save a copy to your journal.");
              }}>Link a copy to journal</button></article>)}
          </div>
        </section>
        <section className={cx("returncard", begun && "active")}>
          <div className={cx("eyebrow")}>60 seconds</div>
          <h2>Return to choice</h2>
          <p className={cx("returnIntro")}>A short awareness practice.</p>
          <div className={cx("returnsteps")}>
            <div className={cx("returnstep", "active")} aria-live="polite">
              {elapsed === 60
                ? "Take this space with you. Choose your next action with awareness."
                : steps[Math.min(3, Math.floor(elapsed / 15))]}
            </div>
          </div>
          <div
            className={cx("returnprogress")}
            role="progressbar"
            aria-label="Awareness practice progress"
            aria-valuenow={elapsed}
            aria-valuemin={0}
            aria-valuemax={60}
          >
            <i style={{ width: (elapsed / 60) * 100 + "%" }} />
          </div>
          <div className={cx("returncontrols")}>
            <span className={cx("empty-note")} role="timer">
              {begun ? `${elapsed} / 60 seconds` : "Ready when you are"}
            </span>
            <div>
              {begun && (
                <button
                  className={cx("ghost")}
                  onClick={() => {
                    setRunning(false);
                    setElapsed(0);
                    elapsedRef.current = 0;
                    setBegun(false);
                  }}
                >
                  Reset
                </button>
              )}{" "}
              <button
                className={cx("primary")}
                onClick={() => (running ? setRunning(false) : begin())}
              >
                {running
                  ? "Pause"
                  : elapsed === 60
                    ? "Again"
                    : begun
                      ? "Resume"
                      : "Begin"}
              </button>
            </div>
          </div>
        </section>
      </div>
      <div className={cx("topicorbit")}>
        {Object.keys(topics).map((t) => (
          <button
            className={cx("topicorb", topic === t && "active")}
            key={t}
            onClick={() => setTopic(t as keyof typeof topics)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={cx("topicresponse")}>{topics[topic]}</div>
      <div className={cx("quietrow")}>
        <div className={cx("signalbubble")}>
          <span>{reflections[index]}</span>
          <small>
            One reflection at a time · original Still Signal wording
          </small>
        </div>
        <div className={cx("quietcontrols")}>
          <button
            className={cx("ghost")}
            aria-label="Previous reflection"
            onClick={() => setIndex((n) => (n + 5) % 6)}
          >
            ←
          </button>
          <button
            className={cx("ghost")}
            onClick={() => setIndex((n) => (n + 1) % 6)}
          >
            Another →
          </button>
        </div>
      </div>
      <PostSession session={session} onSave={onSave} />
    </div>
  );
}
