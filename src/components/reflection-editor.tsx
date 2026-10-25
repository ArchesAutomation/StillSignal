"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, ImagePlus, ClipboardPaste, X } from "lucide-react";
import { readClipboardScreenshot, validateScreenshotFile } from "@/lib/clipboard-screenshot";
import type { JournalEntry, Session } from "@/lib/model";
import { noteTime, validateDestination } from "@/lib/journal-routing";
import Destination from "./concept/destination";
import { clock } from "@/lib/model";
import AudioCapture, { AudioPlayback } from "./reflection-audio";
import { removePrivateFile } from "@/lib/private-files";
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
  eventTime?: number | null;
  section?: JournalEntry["section"];
  customSection?: string;
  tradeId?: string;
  initialText?: string;
  initialLabel?: string;
  entry?: JournalEntry;
  source?: JournalEntry["source"];
  origin?: JournalEntry["origin"];
  hrEventId?: string;
  autoListen?: boolean;
  screenshotFile?: File;
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
  onCancel,
  compact = false,
  session,
}: {
  draft: ReflectionDraft;
  owner: string;
  question: string;
  prepareScreenshot: (t: number) => Promise<string>;
  onSave: (note: JournalEntry) => Promise<void>;
  onDone: () => void;
  onCancel?: () => void;
  compact?: boolean;
  session?: Session;
}) {
  const [text, setText] = useState(draft.entry?.text || draft.initialText || ""),
    [label, setLabel] = useState(draft.entry?.label || draft.initialLabel || "Unlabelled"),
    [time, setTime] = useState(localTime(draft.entry ? noteTime(draft.entry) ?? draft.t : draft.eventTime ?? draft.t)),
    [file, setFile] = useState<File | null>(draft.screenshotFile || null),
    [attachment, setAttachment] = useState(draft.entry?.screenshot),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false),
    [interim, setInterim] = useState(""),
    [usedVoice, setUsedVoice] = useState(false),
    [supported, setSupported] = useState(false);
  const [section, setSection] = useState<JournalEntry["section"]>(draft.entry?.section === "stillness" ? undefined : draft.entry?.section || draft.section);
  const [tradeId, setTradeId] = useState(draft.entry?.tradeId || draft.tradeId || "");
  const [custom, setCustom] = useState(draft.entry?.customSection || draft.customSection || "");
  const [timed, setTimed] = useState((draft.entry ? noteTime(draft.entry) : draft.eventTime) !== null);
  const [preview, setPreview] = useState("");
  const [audio, setAudio] = useState(draft.entry?.audio);
  const [audioRecording, setAudioRecording] = useState(false);
  const currentAudio=useRef(audio),committedAudio=useRef(draft.entry?.audio?.path);
  currentAudio.current=audio;
  useEffect(()=>()=>{const original=currentAudio.current;if(original&&original.path!==committedAudio.current)void removePrivateFile(original.path,owner).catch(()=>{});},[owner]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const form = useRef<HTMLFormElement>(null),
    recognition = useRef<Recognition | null>(null),
    textRef = useRef(text),
    originalTranscript = useRef(draft.entry?.originalTranscript),
    mounted = useRef(true);
  textRef.current = text;
  const start = useCallback(() => {
    const speechWindow = (form.current?.ownerDocument.defaultView || window) as SpeechWindow;
    const Ctor =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Ctor) {
      setError(
        "Speech dictation is unavailable in this browser. You can type below or use your device's dictation.",
      );
      return;
    }
    if (recognition.current) return;
    speechWindow.speechSynthesis?.cancel();
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
      originalTranscript.current = [base, ...finals].filter(Boolean).join(" ").slice(0,2000);
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
  function attachFile(next: File) {
    try {
      setFile(validateScreenshotFile(next));
      setError("");
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <form
      ref={form}
      className={compact ? "floating-entry-form" : undefined}
      onPaste={(event) => {
        const image = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
        if (!image) return;
        event.preventDefault();
        event.stopPropagation();
        if (!busy) attachFile(image);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        let uploaded: JournalEntry["screenshot"];
        try {
          const originalTime = draft.entry ? noteTime(draft.entry) ?? draft.t : draft.eventTime ?? draft.t;
          const t = time === localTime(originalTime) ? originalTime : new Date(time).getTime();
          if (!Number.isFinite(t)) throw new Error("Choose a valid time.");
          if (file)
            uploaded = await uploadScreenshot(
              file,
              owner,
              await prepareScreenshot(t),
            );
          const note: JournalEntry = {
            ...draft.entry,
            id: draft.entry?.id || crypto.randomUUID(),
            t: draft.entry?.t ?? (timed ? t : Date.now()),
            eventTime: timed ? t : null,
            section,
            tradeId: tradeId || undefined,
            origin: draft.entry?.origin || (draft.entry?.section === "stillness" ? "stillness" : draft.origin || "capture"),
            customSection: section === "custom" ? custom : undefined,
            label,
            text,
            source:
              draft.source ||
              (usedVoice || audio ? "voice" : draft.entry?.source || "typed"),
            capturedAt: draft.entry?.capturedAt ?? (draft.entry ? draft.entry.t : Date.now()),
            audio,
            originalTranscript: draft.entry?.originalTranscript ?? originalTranscript.current,
            context: draft.entry?.context && noteTime(draft.entry) === (timed ? t : null)
              ? draft.entry.context : draft.hrEventId ? { hrEventId: draft.hrEventId } : undefined,
            ...(uploaded || attachment
              ? { screenshot: uploaded || attachment }
              : {}),
          };
          if (session) validateDestination(note, session);
          await onSave(note);
          committedAudio.current=note.audio?.path;
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
        {timed ? clock(draft.t) : "Untimed"} · {question}
      </p>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      {session && <Destination session={session} section={section} tradeId={tradeId} custom={custom}
        onSection={setSection} onTrade={setTradeId} onCustom={setCustom} />}
      <label><input type="checkbox" checked={timed} onChange={e => setTimed(e.target.checked)} /> Link to a known time and HR window</label>
      <label hidden={compact || !timed}>
        Moment time · your local timezone
        <input
          type="datetime-local"
          step="1"
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={listening || busy}
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
            "Unlabelled",
            "Other",
            "Focused",
            "Calm",
            "Confident",
            "Following plan / model",
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
          {listening ? "Stop dictation" : compact ? "Microphone" : "Start dictation"}
        </button>
        <span role="status">
          {listening
            ? "Listening…"
            : supported
              ? "Review before saving"
              : "Type or use device dictation"}
        </span>
      </div>
      {!draft.entry?.audio && <AudioCapture owner={owner} sessionId={session?.id} onAudio={setAudio} onRecording={setAudioRecording} />}
      {audio && <AudioPlayback audio={audio} owner={owner} onDelete={async()=>setAudio(undefined)} />}
      <label>
        Reflection
        <textarea
          aria-label="Reflection"
          rows={compact ? 3 : 5}
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
      <button type="button" className="button full" disabled={busy} onClick={async (event) => {
        const clipboard = event.currentTarget.ownerDocument.defaultView?.navigator.clipboard;
        try { attachFile(await readClipboardScreenshot(clipboard)); }
        catch (err) { setError((err as Error).message); }
      }}><ClipboardPaste size={15} /> Paste screenshot</button>
      <label className="screenshot-picker">
        <ImagePlus size={15} /> Chart screenshot · optional
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.[0]) attachFile(e.target.files[0]);
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
      {file && preview && <img className="journal-screenshot" src={preview} alt="Screenshot attached to this entry" />}
      <p className="form-intro" hidden={compact}>
        Your confirmed labels and history shape your personal insights.
        Dictation uses your browser's speech service, which may process audio
        remotely. Original audio is saved only if you separately record it above.
      </p>
      <button
        className="button primary full"
        disabled={busy || listening || audioRecording || (!text.trim() && !file && !attachment && !audio)}
      >
        {" "}
        {busy ? "Saving…" : compact ? "Save journal entry" : "Save reflection"}
      </button>
      {onCancel && <button type="button" className="text-button" disabled={busy} onClick={onCancel}>Cancel entry</button>}
    </form>
  );
}
