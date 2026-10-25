"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry, Sample, Session, Settings } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import { summary } from "@/lib/analytics";
import {
  environmentAt,
  labelsFor,
  validQuote,
  captureSymbol,
  type Quote,
} from "@/lib/journal-reference";
import { journalDateValue } from "@/lib/journal-day";
import { keepPrivateFile, removePrivateFile } from "@/lib/private-files";
import { validateDestination } from "@/lib/journal-routing";
import { cx } from "./shared";
import Destination from "./destination";
export function captureSignal(
  samples: Sample[],
  session: Session,
  baselineSeconds: number,
) {
  const stats = summary(
      samples,
      samples[0]?.t || session.startedAt,
      baselineSeconds,
    ),
    latest = samples.at(-1),
    opening = samples.filter(
      (s) =>
        s.t < (samples[0]?.t || session.startedAt) + baselineSeconds * 1000,
    );
  const variance =
    stats.baseline === null || !opening.length
      ? 0
      : opening.reduce((n, s) => n + (s.bpm - stats.baseline!) ** 2, 0) /
        opening.length;
  const ready =
    !!latest &&
    latest.t >= (samples[0]?.t || session.startedAt) + baselineSeconds * 1000;
  return {
    latest,
    delta:
      ready && latest && stats.baseline !== null
        ? Math.round(latest.bpm - stats.baseline)
        : null,
    sigma:
      ready && variance > 0 && latest && stats.baseline !== null
        ? (latest.bpm - stats.baseline) / Math.sqrt(variance)
        : null,
  };
}
type Draft = {
  note: JournalEntry;
  image?: Blob;
  audio?: Blob;
  duration?: number;
};
type QuoteWindow = Window & {
  StillSignalQuoteAdapter?: {
    readQuote: (options: {
      capturedAt: number;
      symbol: string;
    }) => Promise<Quote | null>;
  };
};
export default function CapturePanel({
  session,
  samples,
  baselineSeconds,
  now,
  active,
  recording,
  shortcut = "J",
  labels,
  onPending,
  onClose,
  onReflect,
  onSave,
}: {
  session: Session;
  samples: Sample[];
  baselineSeconds: number;
  now: number;
  active: boolean;
  recording: boolean;
  shortcut?: string;
  labels?: Settings["phaseLabels"];
  onPending?: (pending: boolean) => void;
  onClose: () => void;
  onReflect: (d: ReflectionDraft) => void;
  onScreenshot?: () => void;
  onSave: (n: JournalEntry) => Promise<void>;
}) {
  const { latest, delta } = captureSignal(samples, session, baselineSeconds),
    fresh =
      active &&
      recording &&
      !!latest &&
      now - latest.t <= 10000 &&
      now >= latest.t;
  const [text, setText] = useState(""),
    [label, setLabel] = useState(""),
    [section, setSection] = useState<JournalEntry["section"]>(),
    [tradeId, setTradeId] = useState(""),
    [custom, setCustom] = useState("");
  const [draft, setDraft] = useState<Draft>(),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [sharing, setSharing] = useState(false),
    [audioConsent, setAudioConsent] = useState(false),
    [recordingAudio, setRecordingAudio] = useState(false),
    [imageUrl, setImageUrl] = useState(""),
    [audioUrl, setAudioUrl] = useState("");
  const video = useRef<HTMLVideoElement | null>(null),
    share = useRef<MediaStream | null>(null),
    microphone = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    draftRef = useRef<Draft | undefined>(undefined),
    generation = useRef(0),
    mounted = useRef(true),
    confirming = useRef(false),
    limit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  draftRef.current = draft;
  useEffect(() => {
    onPending?.(!!draft);
  }, [!!draft, onPending]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [!!draft]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimeout(limit.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      share.current?.getTracks().forEach((t) => t.stop());
      microphone.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!draft?.image) {
      setImageUrl("");
      return;
    }
    const u = URL.createObjectURL(draft.image);
    setImageUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [draft?.image]);
  useEffect(() => {
    if (!draft?.audio) {
      setAudioUrl("");
      return;
    }
    const u = URL.createObjectURL(draft.audio);
    setAudioUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [draft?.audio]);
  async function shareChart() {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw Error(
          "Chart sharing is unavailable in this browser. You can attach a screenshot manually.",
        );
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      share.current?.getTracks().forEach((t) => t.stop());
      share.current = stream;
      const player = document.createElement("video");
      player.srcObject = stream;
      player.muted = true;
      await player.play();
      video.current = player;
      setSharing(true);
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (mounted.current) {
          setSharing(false);
          setStatus(
            "Chart sharing ended. Existing drafts keep their original image.",
          );
        }
      });
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Chart sharing was not available.",
      );
    }
  }
  async function begin() {
    if (draftRef.current || busy) return;
    if (session.id === "workspace") {
      setStatus("Start a session or select a journal date before capturing.");
      return;
    }
    const token = ++generation.current,
      pressedAt = Date.now();
    const actualLive =
        active &&
        journalDateValue(session.startedAt) === journalDateValue(pressedAt),
      env = environmentAt(session, pressedAt, pressedAt);
    const note: JournalEntry = {
      id: crypto.randomUUID(),
      t: pressedAt,
      capturedAt: pressedAt,
      eventTime: actualLive ? pressedAt : null,
      captureMode: actualLive ? "live" : "post-session",
      label: label || "Unlabelled",
      text,
      section,
      tradeId: tradeId || undefined,
      customSection: section === "custom" ? custom : undefined,
      origin: "capture",
      source: audioConsent ? "voice" : "typed",
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
      context:
        fresh && latest && latest.t <= pressedAt
          ? { bpm: latest.bpm }
          : undefined,
    };
    const initial: Draft = { note };
    draftRef.current = initial;
    setDraft(initial);
    setReview(false);
    setBusy(true);
    setStatus("Freezing available evidence…");
    try {
      // Draw synchronously at the press; PNG encoding may finish later.
      const player = video.current;
      if (
        sharing &&
        share.current?.getVideoTracks().some((t) => t.readyState === "live") &&
        player?.videoWidth &&
        player.videoHeight
      ) {
        const canvas = document.createElement("canvas");
        canvas.width = player.videoWidth;
        canvas.height = player.videoHeight;
        canvas.getContext("2d")!.drawImage(player, 0, 0);
        initial.note.capture!.imageCapturedAt = Date.now();
        initial.note.capture!.width = canvas.width;
        initial.note.capture!.height = canvas.height;
        initial.image =
          (await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          )) || undefined;
        if (initial.image) initial.note.capture!.imageMissing = undefined;
      }
      const symbol = captureSymbol(session, tradeId),
        adapter = (window as QuoteWindow).StillSignalQuoteAdapter;
      if (adapter && !symbol)
        initial.note.capture!.quoteMissing =
          "Select a trade idea to choose the quote instrument.";
      if (adapter && symbol) {
        try {
          const result = await Promise.race([
            adapter.readQuote({ capturedAt: pressedAt, symbol }),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 2000),
            ),
          ]);
          initial.note.capture!.quote =
            validQuote(result, pressedAt, symbol) || undefined;
          initial.note.capture!.quoteMissing = initial.note.capture!.quote
            ? undefined
            : "Quote unavailable, stale, future-dated or for a different instrument.";
        } catch {
          initial.note.capture!.quoteMissing = "Quote source unavailable.";
        }
      }
      if (token !== generation.current || !mounted.current) return;
      if (
        audioConsent &&
        navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined"
      ) {
        try {
          const media = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          if (token !== generation.current || !mounted.current) {
            media.getTracks().forEach((t) => t.stop());
            return;
          }
          microphone.current = media;
          const rec = new MediaRecorder(media),
            chunks: BlobPart[] = [],
            started = Date.now();
          recorder.current = rec;
          initial.note.recordingStartedAt = started;
          rec.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          rec.onstop = () => {
            clearTimeout(limit.current);
            media.getTracks().forEach((t) => t.stop());
            if (token !== generation.current || !mounted.current) return;
            const audio = new Blob(chunks, { type: rec.mimeType });
            setRecordingAudio(false);
            setDraft({
              ...initial,
              audio: audio.size && audio.size <= 10000000 ? audio : undefined,
              duration: (Date.now() - started) / 1000,
            });
            setReview(true);
            setStatus(
              audio.size > 10000000
                ? "Recording exceeded 10 MB. You can save the text and image."
                : "Review your original moment before saving.",
            );
          };
          rec.start(1000);
          setRecordingAudio(true);
          limit.current = setTimeout(
            () => rec.state === "recording" && rec.stop(),
            600000,
          );
        } catch {
          setStatus(
            "Microphone unavailable. Text and available image remain in the draft.",
          );
          setReview(true);
        }
      } else {
        setReview(true);
        setStatus("Review the draft. Nothing has been saved yet.");
      }
      if (token === generation.current) setDraft({ ...initial });
    } catch (e) {
      if (token === generation.current) {
        setReview(true);
        setStatus(
          e instanceof Error
            ? e.message
            : "Partial evidence available. Review or discard this draft.",
        );
      }
    } finally {
      if (token === generation.current && mounted.current) setBusy(false);
    }
  }
  function discard() {
    generation.current++;
    clearTimeout(limit.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    microphone.current?.getTracks().forEach((t) => t.stop());
    draftRef.current = undefined;
    setDraft(undefined);
    setReview(false);
    setRecordingAudio(false);
    setBusy(false);
    setStatus("Draft discarded. No journal entry saved.");
  }
  async function confirm() {
    if (!draft || confirming.current || recordingAudio) return;
    confirming.current = true;
    setBusy(true);
    const retained: string[] = [];
    try {
      const note = {
        ...draft.note,
        text,
        label: label || "Unlabelled",
        capture: { ...draft.note.capture!, confirmedAt: Date.now() },
      };
      validateDestination(note, session);
      if (draft.image) {
        const file = await keepPrivateFile(
          session.owner,
          note.id,
          "image",
          draft.image,
          session.id,
        );
        retained.push(file.path);
        note.capture.imagePath = file.path;
      }
      if (draft.audio) {
        const file = await keepPrivateFile(
          session.owner,
          note.id,
          "audio",
          draft.audio,
          session.id,
        );
        retained.push(file.path);
        note.audio = {
          path: file.path,
          expiresAt: file.expiresAt!,
          durationSeconds: Math.min(600, draft.duration || 0),
          mimeType: draft.audio.type,
        };
      }
      await onSave(note);
      draftRef.current = undefined;
      setDraft(undefined);
      setText("");
      setReview(false);
      setStatus("Saved to your journal.");
    } catch (e) {
      await Promise.all(
        retained.map((path) =>
          removePrivateFile(path, session.owner).catch(() => {}),
        ),
      );
      setStatus(
        e instanceof Error
          ? e.message
          : "Could not save. Your draft is ready to retry.",
      );
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }
  const options = ["", ...labelsFor(section, labels)];
  return (
    <div className={cx("widgetpanel")}>
      <div className={cx("widgetpanelhead")}>
        <div>
          <div className={cx("eyebrow")}>
            {active ? "Session live" : "Review capture"}
          </div>
          <h3>{review ? "Review this moment" : "Capture this moment"}</h3>
        </div>
        <button
          aria-label="Close widget"
          disabled={busy || !!draft}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={cx("widgetsignal")}>
        <div>
          <span>{fresh ? "CURRENT HR" : "NO LIVE HR"}</span>
          <strong>{fresh ? latest?.bpm : "—"} BPM</strong>
        </div>
        <div>
          <span>FROM BASELINE</span>
          <strong>
            {fresh && delta !== null ? `${delta > 0 ? "+" : ""}${delta}` : "—"}
          </strong>
        </div>
      </div>
      {!draft && (
        <>
          <button disabled={busy} onClick={() => void shareChart()}>
            {sharing ? "Change shared chart" : "Share chart for capture"}
          </button>
          <small>
            {sharing
              ? "Chart surface ready"
              : "No chart shared · text-only capture available"}
          </small>
          <Destination
            session={session}
            section={section}
            tradeId={tradeId}
            custom={custom}
            onSection={setSection}
            onTrade={setTradeId}
            onCustom={setCustom}
          />
          <label>
            <input
              type="checkbox"
              checked={audioConsent}
              onChange={(e) => setAudioConsent(e.target.checked)}
            />
            Record and retain original audio on this device for 7 days
          </label>
        </>
      )}
      <label>
        Your label
        <select
          aria-label="Capture label"
          value={label}
          disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
        >
          {[...new Set([...options, label])].map((l) => (
            <option key={l} value={l}>
              {l || "No label"}
            </option>
          ))}
        </select>
      </label>
      <textarea
        aria-label="Capture words"
        maxLength={2000}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        placeholder="What are you noticing?"
      />
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Original chart frozen at record press"
          className={cx("capture-original")}
        />
      )}
      {audioUrl && (
        <audio controls src={audioUrl} aria-label="Draft original audio" />
      )}
      {draft && (
        <div className={cx("capture-evidence")}>
          <small>
            Recorded {new Date(draft.note.capture!.pressedAt).toLocaleString()}{" "}
            · {draft.note.captureMode}
          </small>
          <small>
            {draft.note.capture!.quote
              ? `${draft.note.capture!.quote.symbol} ${draft.note.capture!.quote.price} ${draft.note.capture!.quote.currency} · ${draft.note.capture!.quote.source}`
              : draft.note.capture!.quoteMissing}
          </small>
          {draft.note.capture!.imageMissing && (
            <small>{draft.note.capture!.imageMissing}</small>
          )}
        </div>
      )}
      <div className={cx("row-actions")}>
        {!draft ? (
          <>
            <button
              className={cx("primary")}
              disabled={busy}
              onClick={() => void begin()}
            >
              ● Record moment
            </button>
            <button
              aria-label="Review typed capture"
              disabled={busy || !text.trim()}
              onClick={() => void begin()}
            >
              Review →
            </button>
            <button
              onClick={() =>
                onReflect({
                  t: active ? now : session.startedAt,
                  eventTime: active ? now : null,
                  source: "voice",
                  autoListen: true,
                  origin: "capture",
                  initialText: text,
                })
              }
            >
              Dictate
            </button>
          </>
        ) : (
          <>
            {recordingAudio ? (
              <button onClick={() => recorder.current?.stop()}>
                Stop recording
              </button>
            ) : (
              review && (
                <button
                  className={cx("primary")}
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  Confirm save
                </button>
              )
            )}
            <button disabled={confirming.current} onClick={discard}>
              Discard draft
            </button>
          </>
        )}
      </div>
      <p role="status">{status}</p>
      <small>
        ALT + {shortcut.toUpperCase()} · dictation. Original images and audio
        stay on this device; JSON exports contain references.
      </small>
    </div>
  );
}
