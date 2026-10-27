"use client";
import { useState } from "react";
import type { JournalEntry, Sample, Session, Settings } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import type { ReflectionDraft } from "../reflection-editor";
import { summary } from "@/lib/analytics";
import { useMomentCapture, type MomentCapture } from "../use-moment-capture";
import { cx } from "./shared";
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
export default function CapturePanel(props: {
  session: Session;
  samples: Sample[];
  baselineSeconds: number;
  now: number;
  active: boolean;
  recording: boolean;
  shortcut?: string;
  labels?: Settings["phaseLabels"];
  onPending?: (p: boolean) => void;
  onClose: () => void;
  onReflect: (d: ReflectionDraft) => void;
  onScreenshot?: () => void;
  onSave: (n: JournalEntry) => Promise<void>;
  controller?: MomentCapture;
  onSaveBlueprint?: (p: Partial<SessionBlueprint>) => Promise<void>;
  expanded?: boolean;
  historicalBaseline?: { bpm: number | null; count: number };
}) {
  const local = useMomentCapture({
    session: props.session,
    active: props.active,
    shortcut: props.controller ? "" : props.shortcut || "j",
    onSave: props.onSave,
    onSaveBlueprint: props.onSaveBlueprint || (async () => {}),
  });
  const c = props.controller || local,
    [settings, setSettings] = useState(false);
  const latest = props.samples.at(-1),
    fresh =
      props.active &&
      props.recording &&
      latest &&
      latest.quality !== "artifact" &&
      props.now >= latest.t &&
      props.now - latest.t <= 10000 &&
      !c.paused;
  const busy = c.phase === "starting" || c.phase === "saving",
    isRecording = c.phase === "recording";
  const baseline = props.historicalBaseline;
  const delta =
    fresh && baseline?.bpm != null
      ? Math.round(latest.bpm - baseline.bpm)
      : null;
  const feelings = [
    "Calm",
    "Focused",
    "Confident",
    "Anxious",
    "Frustrated",
    "Impulsive",
  ];
  const counts = new Map<string, number>();
  for (const note of props.session.journal) {
    if (!note.deletedAt && note.label && note.label !== "Unlabelled")
      counts.set(note.label, (counts.get(note.label) || 0) + 1);
  }
  const emotionLabels = [...new Set([...feelings, ...counts.keys()])].slice(
    0,
    12,
  );
  const maxCount = Math.max(1, ...counts.values());
  return (
    <div
      className={cx("compact-capture", props.expanded && "capture-expanded")}
    >
      {props.expanded && (
        <header className={cx("recorder-header")}>
          <div>
            <span className={cx("eyebrow")}>YOUR SESSION</span>
            <h2>Capture the moment</h2>
          </div>
          <button aria-label="Close session recorder" onClick={props.onClose}>
            ×
          </button>
        </header>
      )}
      <div
        className={cx("capture-pill")}
        aria-label={
          props.expanded ? "Session recorder" : "Compact capture widget"
        }
      >
        <span
          className={cx("capture-reading")}
          title={fresh ? "Current measured heart rate" : "No live heart rate"}
        >
          <b>{fresh ? latest.bpm : "—"}</b>
          <small>BPM</small>
        </span>
        {props.expanded && (
          <span className={cx("recorder-delta")}>
            <b>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}</b>
            <small>BPM from baseline</small>
          </span>
        )}
        <button
          className={cx("capture-record")}
          aria-label={
            isRecording ? "Stop recording and save moment" : "Record moment"
          }
          disabled={busy || (c.pendingCapture && !isRecording)}
          aria-pressed={isRecording}
          onClick={(e) =>
            c.toggle(e.currentTarget.ownerDocument.defaultView || window)
          }
        >
          {isRecording ? "■" : "●"}
        </button>
        <button
          className={cx("capture-options-button")}
          aria-label="Capture options"
          aria-expanded={c.menu}
          onClick={() => c.setMenu(!c.menu)}
        >
          ⋯
        </button>
      </div>
      {props.expanded && (
        <>
          <p className={cx("recorder-baseline")}>
            {baseline?.bpm == null
              ? "Baseline builds from your previous measured sessions."
              : `${Math.round(baseline.bpm)} BPM baseline · ${baseline.count} previous ${baseline.count === 1 ? "session" : "sessions"}`}
            {!fresh && <span>Waiting for live heart rate</span>}
          </p>
          <p className={cx("recorder-screen-state")}>
            {c.options.screenshots
              ? c.sharing
                ? "Screen connected · screenshot on every recording"
                : "Screenshot on Record · choose your screen once per session"
              : "Automatic screenshots off"}
          </p>
          <div className={cx("recorder-actions")}>
            <button
              disabled={busy || isRecording}
              onClick={() =>
                props.onReflect({
                  t: props.now,
                  source: "voice",
                  autoListen: true,
                })
              }
            >
              Voice dictation
            </button>
            {props.onScreenshot && (
              <button
                disabled={busy || isRecording}
                onClick={props.onScreenshot}
              >
                Paste screenshot
              </button>
            )}
          </div>
          <section
            className={cx("emotion-checkin")}
            aria-label="Emotion check-in chart"
          >
            <h3>How are you feeling?</h3>
            <p>Your saved labels · select a feeling for your next recording.</p>
            <div className={cx("emotion-bars")}>
              {emotionLabels.map((label, i) => (
                <button
                  key={label}
                  aria-label={`${label}, ${counts.get(label) || 0} saved moments`}
                  aria-pressed={c.feeling === label}
                  disabled={busy || isRecording || c.pendingCapture}
                  onClick={() =>
                    c.chooseFeeling(c.feeling === label ? "" : label)
                  }
                >
                  <span>{label}</span>
                  <span className={cx("emotion-track")} aria-hidden="true">
                    <i
                      style={{
                        width: `${((counts.get(label) || 0) / maxCount) * 100}%`,
                        background: [
                          "#9fc8b0",
                          "#8cb9d5",
                          "#c6b2d8",
                          "#dac080",
                          "#ed9b83",
                          "#caa7ae",
                        ][i % 6],
                      }}
                    />
                  </span>
                  <small>{counts.get(label) || 0}</small>
                </button>
              ))}
            </div>
            <small>
              {c.feeling
                ? `${c.feeling} will be saved with your recording.`
                : "Optional · your feelings are never inferred from heart rate."}
            </small>
          </section>
          {c.pending?.note.originalTranscript && (
            <p className={cx("recorder-transcript")}>
              {c.pending.note.originalTranscript}
            </p>
          )}
        </>
      )}
      {c.menu && (
        <div className={cx("capture-menu")} aria-label="Capture options menu">
          <b>
            {props.active ? "Session live" : "Session ready"}
            {c.paused ? " · measurement paused" : ""}
          </b>
          <small>
            Microphone:{" "}
            {typeof MediaRecorder === "undefined"
              ? "unsupported"
              : isRecording
                ? "recording"
                : "permission requested on record"}
          </small>
          <small>
            {c.sharing ? "Chart ready" : "Chart not shared"} · {c.transcription}
          </small>
          <button onClick={() => void c.pause()}>
            {c.paused ? "Resume measurement" : "Pause measurement"}
          </button>
          <button
            onClick={(e) =>
              void c.chooseChart(
                e.currentTarget.ownerDocument.defaultView || window,
              )
            }
          >
            {c.sharing ? "Choose a different chart" : "Choose a chart"}
          </button>
          <button onClick={c.toggleHistory}>
            {c.history ? "Stop chart history" : "Start chart history"}
          </button>
          <small>
            {c.history ? "History active" : "History off"} · every{" "}
            {c.options.cadence}s · limit {c.options.frameLimit} frames ·{" "}
            {props.session.blueprint?.chartFrames?.length || 0} stored
          </small>
          <button onClick={() => setSettings((v) => !v)}>
            Capture settings
          </button>
          {settings && (
            <div className={cx("capture-settings")}>
              <label>
                <input
                  type="checkbox"
                  checked={c.options.screenshots}
                  onChange={(e) =>
                    c.configure({ screenshots: e.target.checked })
                  }
                />
                Capture a screenshot on Record
              </label>
              <label>
                Automatic stop · seconds
                <input
                  aria-label="Recording duration"
                  type="number"
                  min={5}
                  max={600}
                  value={c.options.seconds}
                  onChange={(e) => c.configure({ seconds: +e.target.value })}
                />
              </label>
              <label>
                History cadence · seconds
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={c.options.cadence}
                  onChange={(e) => c.configure({ cadence: +e.target.value })}
                />
              </label>
              <label>
                History frame limit
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={c.options.frameLimit}
                  onChange={(e) => c.configure({ frameLimit: +e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={c.options.confirm}
                  onChange={(e) => c.configure({ confirm: e.target.checked })}
                />
                Confirm before saving
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={c.options.transcribe}
                  onChange={(e) =>
                    c.configure({ transcribe: e.target.checked })
                  }
                />
                Browser transcription · may process speech remotely
              </label>
              <small>
                Audio stays on this device for 7 days. Download it from the
                journal to keep a copy. HR analysis windows are in Settings.
              </small>
            </div>
          )}
          <button
            onClick={() =>
              props.onReflect({
                t: props.active ? props.now : props.session.startedAt,
                eventTime: props.active ? props.now : null,
              })
            }
          >
            Write a note
          </button>
          <small>
            Alt + {(props.shortcut || "J").toUpperCase()} starts / stops while
            Still Signal or its floating widget is focused. Other apps need a
            supported extension or native shortcut.
          </small>
          <button onClick={() => c.setMenu(false)}>Close options</button>
        </div>
      )}
      {(c.status || isRecording) && (
        <div className={cx("capture-feedback")} role="status">
          <span>{c.status}</span>
          {(c.phase === "review" || c.phase === "failed") && (
            <>
              <button disabled={busy} onClick={() => void c.save()}>
                Retry / save moment
              </button>
              <button onClick={() => void c.discard()}>Discard capture</button>
              {c.pending?.audio && (
                <button onClick={c.recoverAudio}>
                  Download recovery audio
                </button>
              )}
            </>
          )}
          {c.lastSaved && c.phase === "idle" && (
            <button onClick={() => void c.undo()}>Undo capture</button>
          )}
        </div>
      )}
    </div>
  );
}
