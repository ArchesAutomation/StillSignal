"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry, Session } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import {
  environmentAt,
  captureSymbol,
  validQuote,
  type Quote,
} from "@/lib/journal-reference";
import { journalDateValue } from "@/lib/journal-day";
import { keepPrivateFile } from "@/lib/private-files";
import { extensionOwnsShortcut } from "@/lib/extension-bridge";
import type { Recognition } from "./reflection-editor";
export type CaptureOptions = {
  seconds: number;
  cadence: number;
  frameLimit: number;
  confirm: boolean;
  transcribe: boolean;
};
const defaults: CaptureOptions = {
  seconds: 120,
  cadence: 30,
  frameLimit: 120,
  confirm: false,
  transcribe: true,
};
type Pending = {
  note: JournalEntry;
  image?: Blob;
  audio?: Blob;
  duration?: number;
  retained?: boolean;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useMomentCapture({
  session,
  active,
  shortcut = "j",
  onSave,
  onSaveBlueprint,
}: {
  session: Session | null;
  active: boolean;
  shortcut?: string;
  onSave: (n: JournalEntry) => Promise<void>;
  onSaveBlueprint: (p: Partial<SessionBlueprint>) => Promise<void>;
}) {
  const [phase, setPhase] = useState<
    "idle" | "starting" | "recording" | "saving" | "review" | "failed"
  >("idle");
  const [status, setStatus] = useState(""),
    [sharing, setSharing] = useState(false),
    [history, setHistory] = useState(false);
  const [menu, setMenu] = useState(false),
    [options, setOptions] = useState(defaults),
    [pending, setPending] = useState<Pending>();
  const [lastSaved, setLastSaved] = useState<JournalEntry>(),
    [transcription, setTranscription] = useState("Checking browser…");
  const video = useRef<HTMLVideoElement | null>(null),
    share = useRef<MediaStream | null>(null),
    mic = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    recognition = useRef<Recognition | null>(null),
    draft = useRef<Pending | undefined>(undefined),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false),
    recording = useRef(false),
    alive = useRef(true),
    frameBusy = useRef(false),
    stopping = useRef(false);
  const sessionRef = useRef(session),
    callback = useRef(onSave),
    blueprintCallback = useRef(onSaveBlueprint),
    optionsRef = useRef(options),
    activeRef = useRef(active);
  sessionRef.current = session;
  callback.current = onSave;
  blueprintCallback.current = onSaveBlueprint;
  optionsRef.current = options;
  activeRef.current = active;
  const speechDone = useRef<Promise<void> | undefined>(undefined);
  const owner = session?.owner;
  useEffect(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(`ss-capture-options:${owner}`) || "null",
      );
      if (value) setOptions({ ...defaults, ...value });
    } catch {}
    const speech = window as SpeechWindow;
    setTranscription(
      speech.SpeechRecognition || speech.webkitSpeechRecognition
        ? "Browser transcription ready"
        : "Transcription unavailable · audio retained",
    );
  }, [owner]);
  function configure(patch: Partial<CaptureOptions>) {
    const value = { ...optionsRef.current, ...patch };
    value.seconds = Math.max(5, Math.min(600, value.seconds));
    value.cadence = Math.max(10, Math.min(300, value.cadence));
    value.frameLimit = Math.max(1, Math.min(600, value.frameLimit));
    optionsRef.current = value;
    setOptions(value);
    try {
      localStorage.setItem(
        `ss-capture-options:${owner}`,
        JSON.stringify(value),
      );
    } catch {
      setStatus("Capture settings could not be saved on this browser.");
    }
  }
  // Drawing is synchronous at the record press. Encoding never delays microphone start.
  function freeze() {
    const player = video.current;
    if (
      !player?.videoWidth ||
      !player.videoHeight ||
      !share.current?.getVideoTracks().some((t) => t.readyState === "live")
    )
      return null;
    const canvas = document.createElement("canvas");
    canvas.width = player.videoWidth;
    canvas.height = player.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Chart frame could not be read.");
    context.drawImage(player, 0, 0);
    const t = Date.now();
    return {
      t,
      width: canvas.width,
      height: canvas.height,
      blob: new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      ),
    };
  }
  async function chooseChart() {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw Error(
          "Chart sharing unavailable. Attach a screenshot in the journal later.",
        );
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const player = document.createElement("video");
      player.srcObject = stream;
      player.muted = true;
      await player.play();
      share.current?.getTracks().forEach((t) => t.stop());
      share.current = stream;
      video.current = player;
      setSharing(true);
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (alive.current) {
          setSharing(false);
          setHistory(false);
          setStatus(
            "Chart sharing ended. Saved recordings and frames remain available.",
          );
        }
      });
      setStatus("Chart ready. Only the shared surface is captured.");
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Chart sharing unavailable. Audio capture is still available.",
      );
    }
  }
  async function retain(value: Pending) {
    if (value.retained) return;
    const s = sessionRef.current;
    if (!s || s.id !== value.note.captureSessionId)
      throw Error("Reopen the original session to recover this capture.");
    // Each asset is retained independently. A failed image must not discard useful audio.
    const failures: string[] = [];
    if (value.audio) {
      try {
        const asset = await keepPrivateFile(
          s.owner,
          value.note.id,
          "audio",
          value.audio,
          s.id,
        );
        value.note.audio = {
          path: asset.path,
          expiresAt: asset.expiresAt!,
          durationSeconds: Math.min(600, value.duration || 0),
          mimeType: value.audio.type,
        };
      } catch {
        failures.push(
          "Audio storage failed; download the recovery audio before leaving.",
        );
      }
    }
    if (value.image) {
      try {
        const asset = await keepPrivateFile(
          s.owner,
          value.note.id,
          "image",
          value.image,
          s.id,
        );
        value.note.capture!.imagePath = asset.path;
      } catch {
        value.note.capture!.imageMissing =
          "Chart image could not be retained; recording remains available.";
      }
    }
    if (failures.length) throw Error(failures.join(" "));
    value.retained = true;
  }
  async function save(value = draft.current) {
    if (!value || busy.current || recording.current) return;
    busy.current = true;
    setPhase("saving");
    setStatus("Saving moment…");
    try {
      await retain(value);
      value.note.capture!.confirmedAt = Date.now();
      await callback.current(value.note);
      if (!alive.current) return;
      setLastSaved(value.note);
      draft.current = undefined;
      setPending(undefined);
      setPhase("idle");
      setStatus("Saved to journal · add feelings or thoughts later.");
    } catch (e) {
      if (alive.current) {
        setPending({ ...value });
        setPhase("failed");
        setStatus(
          e instanceof Error
            ? e.message
            : "Save failed. Your capture is here; retry.",
        );
      }
    } finally {
      busy.current = false;
    }
  }
  async function finish(value: Pending, imageTask: Promise<void>) {
    if (stopping.current) return;
    stopping.current = true;
    recording.current = false;
    clearTimeout(timer.current);
    recognition.current?.stop();
    mic.current?.getTracks().forEach((t) => t.stop());
    await imageTask;
    // Speech services may finish their last result shortly after audio ends.
    if (speechDone.current)
      await Promise.race([
        speechDone.current,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    if (!alive.current) return;
    if (value.note.transcriptStatus === "pending")
      value.note.transcriptStatus = value.note.originalTranscript
        ? "available"
        : "unavailable";
    value.note.text = value.note.originalTranscript || "";
    setPending({ ...value });
    setPhase("review");
    try {
      await retain(value);
    } catch (e) {
      setStatus((e as Error).message);
      setPhase("failed");
      stopping.current = false;
      return;
    }
    stopping.current = false;
    if (optionsRef.current.confirm)
      setStatus("Recording retained. Save this moment when ready.");
    else await save(value);
  }
  async function readOptionalQuote(note: JournalEntry, session: Session) {
    const adapter = (
      window as Window & {
        StillSignalQuoteAdapter?: {
          readQuote: (options: {
            capturedAt: number;
            symbol: string;
          }) => Promise<Quote | null>;
        };
      }
    ).StillSignalQuoteAdapter;
    if (!adapter) return;
    const symbol = captureSymbol(session);
    if (!symbol) {
      note.capture!.quoteMissing =
        "Multiple instruments are available; no quote was guessed.";
      return;
    }
    try {
      const result = await Promise.race([
        adapter.readQuote({ capturedAt: note.capture!.pressedAt, symbol }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      note.capture!.quote =
        validQuote(result, note.capture!.pressedAt, symbol) || undefined;
      note.capture!.quoteMissing = note.capture!.quote
        ? undefined
        : "Quote unavailable, stale, future-dated or for another instrument.";
    } catch {
      note.capture!.quoteMissing =
        "Quote source unavailable. Audio remains available.";
    }
  }
  async function begin() {
    if (busy.current || draft.current || recording.current) return;
    const s = sessionRef.current;
    if (!s || s.id === "workspace") {
      setStatus("Start a session or choose a journal day first.");
      setMenu(true);
      return;
    }
    recognition.current?.abort();
    recognition.current = null;
    speechDone.current = undefined;
    const pressedAt = Date.now(),
      env = environmentAt(s, pressedAt, pressedAt);
    const value: Pending = {
      note: {
        id: crypto.randomUUID(),
        t: pressedAt,
        eventTime:
          activeRef.current &&
          journalDateValue(s.startedAt) === journalDateValue(pressedAt)
            ? pressedAt
            : null,
        capturedAt: pressedAt,
        captureMode: activeRef.current ? "live" : "post-session",
        captureSessionId: s.id,
        label: "Unlabelled",
        text: "",
        origin: "capture",
        source: "voice",
        inputMethod: "voice",
        reflectionScope: "day",
        transcriptStatus: "pending",
        capture: {
          pressedAt,
          confirmedAt: pressedAt,
          imageMissing: "No chart surface shared at record press.",
          quoteMissing: "No timestamped quote source connected.",
          environment: env
            ? {
                location: env.location,
                country: env.country,
                social: env.social,
                setup: env.setup,
                interruptions: env.interruptions,
              }
            : undefined,
        },
      },
    };
    draft.current = value;
    stopping.current = false;
    setPending(value);
    setPhase("starting");
    setStatus("Starting microphone…");
    let imageTask = Promise.resolve();
    try {
      const frame = freeze();
      if (frame) {
        Object.assign(value.note.capture!, {
          imageCapturedAt: frame.t,
          width: frame.width,
          height: frame.height,
        });
        imageTask = frame.blob
          .then((blob) => {
            if (blob) {
              value.image = blob;
              value.note.capture!.imageMissing = undefined;
            }
          })
          .catch(() => {
            value.note.capture!.imageMissing =
              "Frame encoding failed. Audio is retained.";
          });
      }
    } catch {
      value.note.capture!.imageMissing =
        "Chart frame unavailable. Audio is preserved independently.";
    }
    const quoteTask = readOptionalQuote(value.note, s);
    imageTask = Promise.all([imageTask, quoteTask]).then(() => {});
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error("Audio recording unavailable in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mic.current = stream;
      const rec = new MediaRecorder(stream),
        chunks: BlobPart[] = [],
        startedAt = Date.now();
      value.note.recordingStartedAt = startedAt;
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        value.audio = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        value.duration = (Date.now() - startedAt) / 1000;
        if (!value.audio.size || value.audio.size > 10000000) {
          value.audio = undefined;
          setStatus(
            "Audio was empty or exceeded 10 MB. Available chart and transcript are retained.",
          );
        }
        void finish(value, imageTask);
      };
      rec.onerror = () => {
        setStatus("Recording interrupted. Retaining available audio.");
        if (rec.state === "recording") rec.stop();
      };
      rec.start(500);
      recording.current = true;
      setPhase("recording");
      setStatus("Recording · press again to save");
      const Speech =
        (window as SpeechWindow).SpeechRecognition ||
        (window as SpeechWindow).webkitSpeechRecognition;
      if (Speech && optionsRef.current.transcribe) {
        try {
          const speech = new Speech();
          recognition.current = speech;
          speech.continuous = true;
          speech.interimResults = false;
          speech.lang = navigator.language || "en-US";
          speech.onresult = (e) => {
            const result: string[] = [];
            for (let i = 0; i < e.results.length; i++)
              if (e.results[i].isFinal) result.push(e.results[i][0].transcript);
            value.note.originalTranscript = result.join(" ").slice(0, 2000);
            value.note.transcriptStatus = "available";
          };
          speechDone.current = new Promise<void>((resolve) => {
            speech.onend = resolve;
            speech.onerror = () => {
              value.note.transcriptStatus = "failed";
              setTranscription("Transcription failed · audio retained");
              resolve();
            };
          });
          speech.start();
        } catch {
          value.note.transcriptStatus = "failed";
        }
      } else value.note.transcriptStatus = "unavailable";
      timer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, optionsRef.current.seconds * 1000);
    } catch (e) {
      value.note.transcriptStatus = "unavailable";
      await imageTask;
      setPhase("review");
      setPending({ ...value });
      setStatus(
        `${e instanceof Error ? e.message : "Microphone unavailable."} Allow microphone access and retry, or save the chart moment.`,
      );
    }
  }
  function toggle() {
    if (recording.current) recorder.current?.stop();
    else if (!draft.current) void begin();
  }
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    if (!shortcut) return;
    const key = (e: KeyboardEvent) => {
      if (
        !e.defaultPrevented &&
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.repeat &&
        e.key.toLowerCase() === shortcut.toLowerCase() &&
        !extensionOwnsShortcut(owner || "", shortcut)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [shortcut, owner]);
  useEffect(() => {
    if (!history || !sharing || !active) return;
    const id = setInterval(async () => {
      const s = sessionRef.current;
      if (!s || frameBusy.current) return;
      if (
        (s.blueprint?.chartFrames?.length || 0) >= optionsRef.current.frameLimit
      ) {
        setHistory(false);
        setStatus(
          "Chart history reached its frame limit. Existing frames are retained.",
        );
        return;
      }
      frameBusy.current = true;
      try {
        const frame = freeze();
        if (!frame) throw Error("Shared chart is not ready.");
        const blob = await frame.blob;
        if (!blob) throw Error("Frame encoding failed.");
        const frameId = crypto.randomUUID(),
          asset = await keepPrivateFile(s.owner, frameId, "image", blob, s.id);
        await blueprintCallback.current({
          chartFrames: [
            ...(sessionRef.current?.blueprint?.chartFrames || []),
            {
              id: frameId,
              t: frame.t,
              path: asset.path,
              width: frame.width,
              height: frame.height,
            },
          ],
        });
      } catch (e) {
        setHistory(false);
        setStatus(`Chart history paused: ${(e as Error).message}`);
      } finally {
        frameBusy.current = false;
      }
    }, options.cadence * 1000);
    return () => clearInterval(id);
  }, [history, sharing, active, options.cadence]);
  useEffect(() => {
    if (!active) {
      setHistory(false);
      if (recording.current) recorder.current?.stop();
    }
  }, [active]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draft.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      recorder.current?.state === "recording" && recorder.current.stop();
      recognition.current?.abort();
      mic.current?.getTracks().forEach((t) => t.stop());
      share.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const paused = !!session?.blueprint?.measurementPauses?.some((p) => !p.end);
  async function pause() {
    const intervals = sessionRef.current?.blueprint?.measurementPauses || [];
    try {
      await blueprintCallback.current({
        measurementPauses: paused
          ? intervals.map((p) => (p.end ? p : { ...p, end: Date.now() }))
          : [...intervals, { start: Date.now() }],
      });
      setStatus(
        paused
          ? "Measurement resumed. Same session."
          : "Away interval marked; excluded from analysis. Session continues.",
      );
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  function recoverAudio() {
    const blob = draft.current?.audio;
    if (!blob) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "still-signal-recovery.webm";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    phase,
    status,
    sharing,
    history,
    menu,
    setMenu,
    options,
    configure,
    pending,
    lastSaved,
    transcription,
    paused,
    pendingCapture: !!pending,
    toggle,
    save: () => save(),
    chooseChart,
    pause,
    recoverAudio,
    toggleHistory: () => {
      if (!sharing || !active) {
        setStatus(
          "Start a session and choose a chart before starting history.",
        );
        return;
      }
      setHistory((v) => !v);
    },
    discard: async () => {
      if (recording.current || busy.current) return;
      draft.current = undefined;
      setPending(undefined);
      setPhase("idle");
      setStatus("Capture discarded.");
    },
    undo: async () => {
      if (!lastSaved) return;
      try {
        await callback.current({ ...lastSaved, deletedAt: Date.now() });
        setLastSaved(undefined);
        setStatus("Capture removed. Original assets retained for recovery.");
      } catch (e) {
        setStatus((e as Error).message);
      }
    },
  };
}
export type MomentCapture = ReturnType<typeof useMomentCapture>;
