"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, ImagePlus, X } from "lucide-react";
import type { JournalEntry } from "@/lib/model";
import { clock } from "@/lib/model";
import {
  uploadScreenshot,
  removeScreenshot,
  screenshotUrl,
} from "@/lib/screenshots";

type RecognitionEvent = {
  results: {
    length: number;
    [i: number]: { isFinal: boolean; [i: number]: { transcript: string } };
  };
};
export type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export type ReflectionDraft = {
  t: number;
  entry?: JournalEntry;
  source?: JournalEntry["source"];
  hrEventId?: string;
  autoListen?: boolean;
};
const localTime = (t: number) =>
  new Date(t - new Date(t).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);

export function Screenshot({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () =>
      screenshotUrl(path)
        .then((u) => {
          if (alive) {
            setUrl(u);
            setError("");
          }
        })
        .catch(() => {
          if (alive)
            setError(
              "Screenshot unavailable. Reconnect and reopen this journal.",
            );
        });
    void load();
    const timer = setInterval(() => void load(), 240000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path]);
  if (error) return <p role="status">{error}</p>;
  if (!url) return <p>Loading screenshot…</p>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open screenshot ${name}`}
    >
      <img className="journal-screenshot" src={url} alt={name} loading="lazy" />
    </a>
  );
}

export default function ReflectionEditor({
  draft,
  owner,
  question,
  prepareScreenshot,
  onSave,
  onDone,
}: {
  draft: ReflectionDraft;
  owner: string;
  question: string;
  prepareScreenshot: (t: number) => Promise<string>;
  onSave: (note: JournalEntry) => Promise<void>;
  onDone: () => void;
}) {
  const [text, setText] = useState(draft.entry?.text || ""),
    [label, setLabel] = useState(draft.entry?.label || "Other"),
    [time, setTime] = useState(localTime(draft.t)),
    [file, setFile] = useState<File | null>(null),
    [attachment, setAttachment] = useState(draft.entry?.screenshot),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false),
    [interim, setInterim] = useState(""),
    [usedVoice, setUsedVoice] = useState(false),
    [supported, setSupported] = useState(false);
  const recognition = useRef<Recognition | null>(null),
    textRef = useRef(text),
    mounted = useRef(true);
  textRef.current = text;
  const start = useCallback(() => {
    const Ctor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Ctor) {
      setError(
        "Speech dictation is unavailable in this browser. You can type below or use your device's dictation.",
      );
      return;
    }
    if (recognition.current) return;
    window.speechSynthesis?.cancel();
    const rec = new Ctor(),
      base = textRef.current.trim();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      if (!mounted.current) return;
      const finals: string[] = [],
        pending: string[] = [];
      for (let i = 0; i < e.results.length; i++)
        (e.results[i].isFinal ? finals : pending).push(
          e.results[i][0].transcript,
        );
      setText([base, ...finals].filter(Boolean).join(" ").slice(0, 2000));
      setInterim(pending.join(" "));
      setUsedVoice(true);
    };
    rec.onerror = (e) => {
      if (mounted.current)
        setError(
          e.error === "not-allowed"
            ? "Microphone access was denied. Allow it in your browser, or type your reflection."
            : "Dictation stopped. Your transcript is still here; you can edit it or try again.",
        );
    };
    rec.onend = () => {
      recognition.current = null;
      if (mounted.current) {
        setListening(false);
        setInterim("");
      }
    };
    try {
      recognition.current = rec;
      rec.start();
      setListening(true);
      setError("");
    } catch {
      recognition.current = null;
      setError("Could not start dictation. Type below or try again.");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    setSupported(
      !!(
        (window as SpeechWindow).SpeechRecognition ||
        (window as SpeechWindow).webkitSpeechRecognition
      ),
    );
    if (draft.autoListen) start();
    return () => {
      mounted.current = false;
      recognition.current?.abort();
      recognition.current = null;
    };
  }, [draft.autoListen, start]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        let uploaded: JournalEntry["screenshot"];
        try {
          const t =
            time === localTime(draft.t) ? draft.t : new Date(time).getTime();
          if (!Number.isFinite(t)) throw new Error("Choose a valid time.");
          if (file)
            uploaded = await uploadScreenshot(
              file,
              owner,
              await prepareScreenshot(t),
            );
          const note: JournalEntry = {
            id: draft.entry?.id || crypto.randomUUID(),
            t,
            label,
            text: text.trim(),
            source:
              draft.source ||
              (usedVoice ? "voice" : draft.entry?.source || "typed"),
            ...(draft.entry?.context
              ? { context: draft.entry.context }
              : draft.hrEventId
                ? { context: { hrEventId: draft.hrEventId } }
                : {}),
            ...(uploaded || attachment
              ? { screenshot: uploaded || attachment }
              : {}),
          };
          await onSave(note);
          if (
            draft.entry?.screenshot &&
            draft.entry.screenshot.path !== note.screenshot?.path
          )
            await removeScreenshot(draft.entry.screenshot.path).catch(() => {});
          onDone();
        } catch (err) {
          if (uploaded) await removeScreenshot(uploaded.path).catch(() => {});
          setError(
            err instanceof Error
              ? err.message
              : "Could not save this reflection.",
          );
        } finally {
          if (mounted.current) setBusy(false);
        }
      }}
    >
      <p className="form-intro">
        {clock(draft.t)} · {question}
      </p>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <label>
        Moment time · your local timezone
        <input
          type="datetime-local"
          step="1"
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!!draft.entry || listening || busy}
        />
      </label>
      <label>
        Your label
        <select
          aria-label="Your label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        >
          {[
            "Other",
            "Focused",
            "Calm",
            "Confident",
            "Impatient",
            "FOMO",
            "Hesitant",
            "Frustrated",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <div className="voice-toolbar">
        <button
          type="button"
          className={"button " + (listening ? "stop" : "")}
          disabled={busy || !supported}
          onClick={() => (listening ? recognition.current?.stop() : start())}
        >
          {listening ? <Square size={14} /> : <Mic size={16} />}
          {listening ? "Stop dictation" : "Start dictation"}
        </button>
        <span role="status">
          {listening
            ? "Listening…"
            : supported
              ? "Review before saving"
              : "Type or use device dictation"}
        </span>
      </div>
      <label>
        Reflection
        <textarea
          aria-label="Reflection"
          rows={5}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={listening || busy}
          placeholder="What is happening? What are you feeling?"
        />
      </label>
      {interim && (
        <p className="form-intro" aria-live="polite">
          {interim}
        </p>
      )}
      <label className="screenshot-picker">
        <ImagePlus size={15} /> Chart screenshot · optional
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />
      </label>
      {(file || attachment) && (
        <div className="voice-toolbar">
          <span>{file?.name || attachment?.name}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setFile(null);
              setAttachment(undefined);
            }}
            disabled={busy}
          >
            <X size={14} /> Remove screenshot
          </button>
        </div>
      )}
      {attachment && !file && <Screenshot {...attachment} />}
      <p className="form-intro">
        Your confirmed labels and history shape your personal insights.
        Dictation uses your browser's speech service, which may process audio
        remotely. Trade Pulse saves the reviewed text, not an audio recording.
      </p>
      <button
        className="button primary full"
        disabled={busy || listening || (!text.trim() && !file && !attachment)}
      >
        {" "}
        {busy ? "Saving…" : "Save reflection"}
      </button>
    </form>
  );
}
