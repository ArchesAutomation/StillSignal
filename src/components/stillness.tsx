"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Circle, Mic, Pause, Play, RotateCcw } from "lucide-react";
import type { ReflectionDraft } from "./reflection-editor";

const steps = [
  "Let your breath find a comfortable rhythm. There is no need to force it.",
  "Notice one physical sensation. Allow it to be here without judging it.",
  "Name the thought asking for your attention. You do not need to follow it.",
  "What action would remain aligned with your plan?",
];
const topics = {
  Thought:
    "A thought can be present without becoming an instruction. Notice it before deciding whether it deserves action.",
  Ego: "You can care about a decision without needing the outcome to prove something about you.",
  Acceptance:
    "Name what is already here. Acceptance leaves room to choose what happens next.",
  Identity:
    "A single decision is something you did. It does not define everything you are.",
  Stillness: "You do not need to fill every pause. Let this moment be enough.",
};
export default function Stillness({
  onReflect,
  time,
}: {
  onReflect: (draft: ReflectionDraft) => void;
  time: number;
}) {
  const [topic, setTopic] = useState<keyof typeof topics>("Thought");
  const [elapsed, setElapsed] = useState(0),
    [running, setRunning] = useState(false);
  const started = useRef(0);
  useEffect(() => {
    if (!running) return;
    started.current = Date.now() - elapsed * 1000;
    const timer = setInterval(() => {
      const next = Math.min(
        60,
        Math.floor((Date.now() - started.current) / 1000),
      );
      setElapsed(next);
      if (next === 60) setRunning(false);
    }, 250);
    return () => clearInterval(timer);
  }, [running]); // elapsed is read only when starting or resuming the practice.
  const step = Math.min(3, Math.floor(elapsed / 15));
  return (
    <div className="stillness-canvas">
      <div
        className={`breathing-orb${running ? " breathing" : ""}`}
        aria-hidden="true"
      >
        <i />
        <i />
        <Circle size={50} strokeWidth={0.6} />
      </div>
      <div className="stillness-heading">
        <div className="eyebrow">YOU DO NOT NEED TO SOLVE THIS MOMENT</div>
        <h2>What is here, right now?</h2>
        <p>Take a breath. Notice first. Words can come afterwards.</p>
      </div>
      <div className="presence-grid">
        <section className="notice-card">
          <div className="eyebrow">A MOMENT OF AWARENESS</div>
          <h3>What are you noticing?</h3>
          <p>
            A thought, a feeling, a sensation, or an urge. Capture it in your
            own words and save it to your selected journal.
          </p>
          <div className="notice-prompt">
            “What am I carrying into the next decision?”
          </div>
          <div className="inline-actions">
            <button
              className="button primary"
              onClick={() => onReflect({ t: time })}
            >
              Write a reflection <ArrowRight size={14} />
            </button>
            <button
              className="button"
              onClick={() =>
                onReflect({ t: time, source: "voice", autoListen: true })
              }
            >
              <Mic size={15} /> Speak instead
            </button>
          </div>
        </section>
        <section className="return-card">
          <div className="eyebrow">60 SECONDS · AT YOUR PACE</div>
          <h3>Return to choice.</h3>
          <p className="practice-step" aria-live="polite">
            {elapsed === 60
              ? "A little more space. Take that awareness into your next choice."
              : steps[step]}
          </p>
          <div className="practice-steps" aria-hidden="true">
            {steps.map((_, i) => (
              <i key={i} className={i <= step ? "active" : ""} />
            ))}
          </div>
          <progress
            max={60}
            value={elapsed}
            aria-label="Awareness practice progress"
          />
          <div className="return-controls">
            <span role="timer">
              {elapsed === 60
                ? "Practice complete"
                : `${60 - elapsed}s remaining`}
            </span>
            <div className="inline-actions">
              <button
                className="icon-button"
                aria-label="Reset practice"
                onClick={() => {
                  setRunning(false);
                  setElapsed(0);
                }}
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="button"
                onClick={() => {
                  if (elapsed === 60) setElapsed(0);
                  setRunning((v) => !v);
                }}
              >
                {running ? <Pause size={14} /> : <Play size={14} />}
                {running
                  ? "Pause"
                  : elapsed === 60
                    ? "Again"
                    : elapsed
                      ? "Continue"
                      : "Begin"}
              </button>
            </div>
          </div>
        </section>
      </div>
      <div className="topic-orbit" aria-label="Reflection themes">
        {(Object.keys(topics) as (keyof typeof topics)[]).map((t) => (
          <button
            key={t}
            className={t === topic ? "active" : ""}
            aria-pressed={t === topic}
            onClick={() => setTopic(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="topic-response" aria-live="polite">
        {topics[topic]}
      </p>
      <div className="stillness-footnote">
        The feeling can be present without becoming the decision.
      </div>
    </div>
  );
}
