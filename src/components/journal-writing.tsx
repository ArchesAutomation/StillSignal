"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Mic } from "lucide-react";
import type { JournalEntry } from "@/lib/model";
import type { ReflectionDraft } from "./reflection-editor";
const prompts = [
  "What were you feeling before the setup appeared?",
  "What did you notice in your body when you made the decision?",
  "Did an expectation change how you acted?",
  "What remained after the position closed?",
  "What would you like to carry into your next session?",
];
export default function JournalWriting({
  time,
  question,
  onSave,
  onOpen,
}: {
  time: number;
  question: string;
  onSave: (note: JournalEntry) => Promise<void>;
  onOpen: (draft: ReflectionDraft) => void;
}) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("Other");
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const questions = [question, ...prompts];
  return (
    <section className="journal-writing" aria-label="Write in your journal">
      <div className="journal-paper">
        <div className="section-heading">
          <div>
            <h2>My journal</h2>
            <p>Write freely. Your words are the context.</p>
          </div>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() =>
              onOpen({ t: time, initialText: text, initialLabel: label })
            }
          >
            <ImagePlus size={14} /> Add screenshot
          </button>
        </div>
        <label className="sr-only" htmlFor="journal-reflection">
          Journal reflection
        </label>
        <textarea
          ref={input}
          id="journal-reflection"
          aria-label="Journal reflection"
          value={text}
          disabled={busy}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            setStatus("");
          }}
          placeholder="What was happening? What did you notice in yourself? There is no right way to begin…"
        />
        <div className="writing-actions">
          <label>
            Your label
            <select value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)}>
              {[
                "Other",
                "Focused",
                "Calm",
                "Confident",
                "Impatient",
                "FOMO",
                "Hesitant",
                "Frustrated",
              ].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <div className="inline-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                onOpen({
                  t: time,
                  initialText: text,
                  initialLabel: label,
                  source: "voice",
                  autoListen: true,
                })
              }
            >
              <Mic size={14} /> Dictate
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || !text.trim()}
              onClick={async () => {
                setBusy(true);
                setStatus("");
                setError("");
                try {
                  await onSave({
                    id: crypto.randomUUID(),
                    t: time,
                    label,
                    text: text.trim(),
                    source: "typed",
                  });
                  setText("");
                  setStatus("Reflection saved to your journal.");
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not save. Your draft is still here.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save to journal"}
            </button>
          </div>
        </div>
        {status && (
          <p role="status" className="writing-status">
            <Check size={13} /> {status}
          </p>
        )}
        {error && (
          <p role="alert" className="banner error">
            {error}
          </p>
        )}
      </div>
      <aside className="journal-question">
        <div className="eyebrow">ONE QUESTION AT A TIME</div>
        <h3 aria-live="polite">{questions[index]}</h3>
        <p>Pause with the question. Answer only what feels useful.</p>
        <div className="question-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous reflection question"
            onClick={() =>
              setIndex((i) => (i + questions.length - 1) % questions.length)
            }
          >
            <ArrowLeft size={15} />
          </button>
          <span>
            {index + 1} / {questions.length}
          </span>
          <button
            type="button"
            className="button"
            onClick={() => input.current?.focus()}
          >
            Answer this
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next reflection question"
            onClick={() => setIndex((i) => (i + 1) % questions.length)}
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </aside>
    </section>
  );
}
