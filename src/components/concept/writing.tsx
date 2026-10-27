"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry, Sample, Session, Settings } from "@/lib/model";
import type { ReflectionDraft, Recognition } from "../reflection-editor";
import AudioCapture, { AudioPlayback } from "../reflection-audio";
import { keepPrivateFile } from "@/lib/private-files";
import { validateScreenshotFile } from "@/lib/clipboard-screenshot";
import { validateDestination } from "@/lib/journal-routing";
import { journalPhaseLink } from "@/lib/journal-phases";
import { labelsFor, stages, localInstant } from "@/lib/journal-reference";
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
  manualZone?: string;
};
export default function Writing({
  time,
  session,
  onSave,
  onReflect,
  selection,
  samples,
  labels,
  timezone,
}: {
  time: number;
  session: Session;
  onSave: (n: JournalEntry) => Promise<void>;
  onReflect: (d: ReflectionDraft) => void;
  selection?: { section: JournalEntry["section"]; tradeId: string };
  samples: Sample[];
  labels?: Settings["phaseLabels"];
  timezone?: string;
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
  const zone =
    timezone ||
    session.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [audio, setAudio] = useState<JournalEntry["audio"]>(),
    [voice, setVoice] = useState(false),
    [recording, setRecording] = useState(false),
    [listening, setListening] = useState(false),
    [image, setImage] = useState<File>();
  const recognition = useRef<Recognition | null>(null),
    transcript = useRef("");
  const [promptStep, setPromptStep] = useState<number | null>(null);
  const textRef = useRef("");
  useEffect(() => () => recognition.current?.abort(), []);
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
  textRef.current = draft.text;
  function change(patch: Partial<Draft>) {
    store(JSON.stringify({ ...draft, ...patch }));
    setStatus("");
  }
  useEffect(() => {
    if (ready && selection) change({ ...selection, manualTime: "" });
  }, [selection?.section, selection?.tradeId, ready]);
  const index = stages.indexOf(draft.section as (typeof stages)[number]);
  const question =
    index < 0 && promptStep === null
      ? "How are you feeling today, even without taking a trade?"
      : questions[promptStep ?? index];
  const phase = journalPhaseLink(
    session,
    draft.tradeId,
    draft.section,
    samples,
  );
  let linkedTime = phase?.t ?? null,
    timeError = "";
  try {
    if (draft.manualTime)
      linkedTime = localInstant(draft.manualTime, draft.manualZone || zone);
  } catch {
    timeError =
      "This local time is missing or ambiguous during a daylight-saving change. Choose another time.";
    linkedTime = null;
  }
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
    if (
      busy ||
      recording ||
      listening ||
      timeError ||
      (!draft.text.trim() && !audio && !image)
    )
      return;
    setBusy(true);
    try {
      const note: JournalEntry = {
        id: crypto.randomUUID(),
        t: Date.now(),
        eventTime: noteTime,
        label: draft.label || "Unlabelled",
        text: draft.text,
        ...target,
        source: audio || transcript.current ? "voice" : "typed",
        audio,
        capturedAt: Date.now(),
        captureMode: "post-session",
        originalTranscript: transcript.current || undefined,
        transcriptStatus: transcript.current ? "available" : "unavailable",
        origin: "free-writing",
        prompt: { id: `question-${draft.section || "day"}`, question },
      };
      if (image) {
        await validateScreenshotFile(image);
        const asset = await keepPrivateFile(
          session.owner,
          note.id,
          "image",
          image,
          session.id,
        );
        note.capture = {
          pressedAt: Date.now(),
          confirmedAt: Date.now(),
          imageCapturedAt: Date.now(),
          imagePath: asset.path,
        };
      }
      validateDestination(note, session);
      await onSave(note);
      store("");
      setAudio(undefined);
      setImage(undefined);
      setVoice(false);
      transcript.current = "";
      setStatus("Added later · saved to your journal.");
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
            setPromptStep(((promptStep ?? index) + 1) % questions.length)
          }
        >
          Next prompt →
        </button>
      </div>
      <Destination
        timezone={zone}
        session={session}
        section={draft.section}
        tradeId={draft.tradeId}
        custom={draft.custom}
        onSection={(section) => {
          setPromptStep(null);
          change({ section, manualTime: "", label: "" });
        }}
        onTrade={(tradeId) => change({ tradeId, manualTime: "" })}
        onCustom={(custom) => change({ custom })}
      />
      <div className={cx("reference-fields")}>
        <label>
          Your label
          <input
            list="guided-feelings"
            aria-label="Writing label"
            value={draft.label}
            onChange={(e) => change({ label: e.target.value })}
            placeholder="Custom feeling or thought…"
          />
          <datalist id="guided-feelings">
            {options.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </label>
        <label>
          Linked time · {draft.manualZone || zone}
          <input
            type="datetime-local"
            step="1"
            value={draft.manualTime}
            onChange={(e) =>
              change({ manualTime: e.target.value, manualZone: zone })
            }
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
          : `Link to ${displayTime(linkedTime, true, zone)} · ${phase?.sampleCount && !draft.manualTime ? `${phase.sampleCount} HR samples` : "HR matched at linked time when saved"}`}
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
      {timeError && <p role="alert">{timeError}</p>}
      {voice && (
        <div className={cx("inline-voice")}>
          <AudioCapture
            owner={session.owner}
            sessionId={session.id}
            onAudio={setAudio}
            onRecording={setRecording}
          />
          <button
            aria-pressed={listening}
            onClick={() => {
              if (listening) {
                recognition.current?.stop();
                return;
              }
              const Speech = window as Window & {
                SpeechRecognition?: new () => Recognition;
                webkitSpeechRecognition?: new () => Recognition;
              };
              const Ctor =
                Speech.SpeechRecognition || Speech.webkitSpeechRecognition;
              if (!Ctor) {
                setStatus(
                  "Transcription unavailable in this browser. Original audio can still be recorded.",
                );
                return;
              }
              const rec = new Ctor(),
                base = textRef.current;
              recognition.current = rec;
              rec.continuous = true;
              rec.interimResults = false;
              rec.lang = navigator.language;
              rec.onresult = (e) => {
                const words = [];
                for (let i = 0; i < e.results.length; i++)
                  if (e.results[i].isFinal)
                    words.push(e.results[i][0].transcript);
                transcript.current = words.join(" ").slice(0, 2000);
                store(
                  JSON.stringify({
                    ...draft,
                    text: [base, transcript.current]
                      .filter(Boolean)
                      .join(" ")
                      .slice(0, 2000),
                  }),
                );
              };
              rec.onerror = () => {
                setStatus(
                  "Transcription stopped. Original audio is separate and remains available.",
                );
                setListening(false);
              };
              rec.onend = () => setListening(false);
              try {
                rec.start();
                setListening(true);
              } catch {
                setStatus(
                  "Could not start transcription. You can type or record original audio.",
                );
              }
            }}
          >
            {listening ? "Stop transcription" : "Start transcription"}
          </button>
          {audio && (
            <AudioPlayback
              owner={session.owner}
              audio={audio}
              onDelete={async () => setAudio(undefined)}
            />
          )}
        </div>
      )}
      {image && (
        <p>
          {image.name}{" "}
          <button onClick={() => setImage(undefined)}>Remove image</button>
        </p>
      )}
      <div className={cx("writing-actions")}>
        <button
          className={cx("primary")}
          disabled={
            busy ||
            recording ||
            listening ||
            !!timeError ||
            (!draft.text.trim() && !audio && !image)
          }
          onClick={() => void save()}
        >
          Save to journal
        </button>
        <button
          onClick={() => setVoice(!voice)}
          disabled={recording || listening}
          aria-expanded={voice}
        >
          Speak instead
        </button>
        <label>
          ＋ Add image
          <input
            aria-label="Guided reflection image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setImage(e.target.files?.[0])}
          />
        </label>
        <span role="status">
          {status ||
            (draft.text ? "Draft kept on this device" : "Ready to write")}
        </span>
      </div>
    </section>
  );
}
