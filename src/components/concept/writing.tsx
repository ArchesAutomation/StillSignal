"use client";
import { useState } from "react";
import type { JournalEntry } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import { cx, Title } from "./shared";
const prompts = [
  "What were you feeling before the setup appeared?",
  "When did the physical response begin—before or after the thought?",
  "While managing the position, what held most of your attention?",
  "Did your behaviour still match the plan?",
  "What remained in your body after the exit?",
];
export default function Writing({
  time,
  onSave,
  onReflect,
  onReview,
}: {
  time: number;
  onSave: (n: JournalEntry) => Promise<void>;
  onReflect: (d: ReflectionDraft) => void;
  onReview: () => void;
}) {
  const [text, setText] = useState(""),
    [prompt, setPrompt] = useState(0),
    [answering, setAnswering] = useState(false),
    [answer, setAnswer] = useState(""),
    [choice, setChoice] = useState(""),
    [deep, setDeep] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(false);
  async function save(value: string, clear: () => void) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setStatus("");
    try {
      await onSave({
        id: crypto.randomUUID(),
        t: time,
        label: "Other",
        text: value.trim().slice(0, 2000),
        source: "typed",
      });
      clear();
      setError(false);
      setStatus("Reflection saved to your journal.");
    } catch (e) {
      setError(true);
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
    <>
      <div className={cx("reflection")}>
        <div className={cx("paper")}>
          <Title
            title="My journal"
            description="Write freely first. Keep your own words at the centre of the trade."
          >
            <div className={cx("journaltools")}>
              <button
                className={cx("ghost")}
                onClick={() => onReflect({ t: time, initialText: text })}
              >
                Add screenshot
              </button>
              <button className={cx("ghost", "aiassist")} onClick={onReview}>
                ✦ Organise your review
              </button>
            </div>
          </Title>
          <textarea
            aria-label="Journal reflection"
            value={text}
            maxLength={2000}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            placeholder="What was happening before you entered? What changed while you were in the trade?"
          />
          <div className={cx("writing-actions")}>
            <button
              className={cx("primary")}
              disabled={busy || !text.trim()}
              onClick={() => void save(text, () => setText(""))}
            >
              Save to journal
            </button>
            <button
              className={cx("ghost")}
              onClick={() =>
                onReflect({
                  t: time,
                  source: "voice",
                  autoListen: true,
                  initialText: text,
                })
              }
            >
              ● Speak instead
            </button>
          </div>
        </div>
        <div className={cx("prompts")}>
          <div className={cx("promptcarousel")}>
            <div>
              <h3>One question at a time</h3>
              <div className={cx("promptquestion")}>{prompts[prompt]}</div>
              {answering && (
                <textarea
                  autoFocus
                  className={cx("promptanswer", "show")}
                  aria-label="Prompt answer"
                  value={answer}
                  maxLength={1700}
                  disabled={busy}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Answer here, or add this question to your journal..."
                />
              )}
            </div>
            <div>
              <div className={cx("promptnav")}>
                <button
                  className={cx("ghost")}
                  aria-label="Previous prompt"
                  onClick={() => setPrompt((n) => (n + 4) % 5)}
                >
                  ←
                </button>
                <div className={cx("promptdots")}>
                  {prompts.map((_, i) => (
                    <i key={i} className={cx(i === prompt && "active")} />
                  ))}
                </div>
                <button
                  className={cx("primary")}
                  disabled={busy}
                  onClick={() =>
                    answering
                      ? void save(prompts[prompt] + "\n\n" + answer, () => {
                          setAnswer("");
                          setAnswering(false);
                        })
                      : setAnswering(true)
                  }
                >
                  {answering ? "Save answer" : "Answer this"}
                </button>
                <button
                  className={cx("ghost")}
                  aria-label="Next prompt"
                  onClick={() => setPrompt((n) => (n + 1) % 5)}
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={cx("coachdrill")}>
        <div className={cx("eyebrow")}>Reflection guide · one layer deeper</div>
        <h3>What specifically came before the action?</h3>
        <p>
          Choose the closest starting point. Then describe what you actually
          noticed.
        </p>
        <div className={cx("choicechips")}>
          {[
            "Fear of missing the move",
            "Frustration after the loss",
            "Urgency after waiting",
            "Something else",
          ].map((c) => (
            <button
              key={c}
              className={cx(c === choice && "active")}
              onClick={() => setChoice(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div
          className={cx("followup")}
          style={{ display: choice ? "block" : "none" }}
        >
          <strong>Where did you first notice it?</strong>
          <br />
          <span className={cx("empty-note")}>
            Body sensation, thought, attention or behaviour.
          </span>
          <textarea
            aria-label="Deeper reflection"
            value={deep}
            disabled={busy}
            maxLength={1800}
            onChange={(e) => setDeep(e.target.value)}
            placeholder="For example: I started watching unrealised P&L, my chest tightened, and I stopped waiting for candle confirmation..."
          />
          <div className={cx("followupactions")}>
            <button
              className={cx("primary")}
              disabled={busy || !deep.trim()}
              onClick={() =>
                void save((choice ? choice + "\n\n" : "") + deep, () =>
                  setDeep(""),
                )
              }
            >
              Save to this HR window
            </button>
            <button
              className={cx("ghost")}
              onClick={() =>
                onReflect({
                  t: time,
                  source: "voice",
                  autoListen: true,
                  initialText: deep,
                })
              }
            >
              ● Speak answer
            </button>
          </div>
        </div>
      </div>
      {status && (
        <p className={cx("save-status")} role={error ? "alert" : "status"}>
          {status}
        </p>
      )}
    </>
  );
}
