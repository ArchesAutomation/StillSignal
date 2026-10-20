"use client";
import { useMemo, useState, type ClipboardEvent } from "react";
import { Activity, BookOpen, ClipboardPaste, Heart, Mic, X } from "lucide-react";
import type { JournalEntry, Sample, Session } from "@/lib/model";
import { summary } from "@/lib/analytics";
import { readClipboardScreenshot, validateScreenshotFile } from "@/lib/clipboard-screenshot";
import ReflectionEditor, { type ReflectionDraft } from "./reflection-editor";

export default function FloatingJournal({
  session, samples, now, baselineSeconds, recording, active, syncState,
  floating, message, onClose, onReopen, prepareScreenshot, onSave,
}: {
  session: Session;
  samples: Sample[];
  now: number;
  baselineSeconds: number;
  recording: boolean;
  active: boolean;
  syncState: string;
  floating: boolean;
  message: string;
  onClose: () => void;
  onReopen: () => void;
  prepareScreenshot: (t: number) => Promise<string>;
  onSave: (note: JournalEntry) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReflectionDraft | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const stats = useMemo(() => summary(samples, samples[0]?.t || session.startedAt, baselineSeconds), [samples, session.startedAt, baselineSeconds]);
  const latest = samples.at(-1);
  const fresh = active && recording && !!latest && now - latest.t <= 10000;
  const baselineReady = !!latest && latest.t >= (samples[0]?.t || session.startedAt) + baselineSeconds * 1000;
  const delta = fresh && baselineReady && stats.baseline !== null ? Math.round(latest.bpm - stats.baseline) : null;

  function newEntry(options: Partial<ReflectionDraft> = {}) {
    setStatus("");
    setError("");
    setDraft({ t: Date.now(), ...options });
  }
  function paste(event: ClipboardEvent<HTMLElement>) {
    const file = Array.from(event.clipboardData.files).find((value) => value.type.startsWith("image/"));
    if (!file || draft || !active) return;
    event.preventDefault();
    try { newEntry({ screenshotFile: validateScreenshotFile(file) }); }
    catch (err) { setError((err as Error).message); }
  }

  return (
    <section className="floating-journal" aria-label="Session dashboard" onPaste={paste} tabIndex={-1}>
      <header className="floating-journal-heading">
        <span><Activity size={18} /> still<span className="orange">signal.</span></span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close session dashboard"><X size={17} /></button>
      </header>
      <div className="floating-session-name"><span className={"status-dot " + (active ? "green" : "")} />{active ? "SESSION LIVE" : "SESSION ENDED"}</div>
      <h2>{session.name}</h2>
      <div className="floating-pulse" aria-label="Heart rate versus baseline">
        <div><span><Heart size={14} /> Current heart rate</span><strong>{fresh ? Math.round(latest.bpm) : "—"}<small>BPM</small></strong></div>
        <div><span>Opening baseline</span><strong>{stats.baseline === null ? "—" : Math.round(stats.baseline)}<small>BPM</small></strong></div>
      </div>
      <p className="floating-pulse-detail">
        {!recording ? "Wearable not connected · journaling is ready" : !fresh ? "Waiting for a fresh heart-rate reading" : !baselineReady ? `Building your ${baselineSeconds / 60}-minute baseline` : delta === 0 ? "At your opening baseline" : `${delta! > 0 ? "+" : ""}${delta} BPM from baseline`}
      </p>
      {message && <p role="status" className="floating-message">{message}</p>}
      {error && <p role="alert" className="banner error">{error}</p>}
      {status && <p role="status" className="floating-saved">{status}</p>}
      {draft ? (
        <ReflectionEditor
          draft={draft}
          owner={session.owner}
          question="Capture this moment."
          compact
          prepareScreenshot={prepareScreenshot}
          onSave={onSave}
          onDone={() => { setDraft(null); setStatus("Journal entry saved."); }}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <div className="floating-journal-actions">
          <button type="button" className="button primary full" disabled={!active} onClick={() => newEntry()}><BookOpen size={16} /> Journal entry</button>
          <div>
            <button type="button" className="button" disabled={!active} onClick={() => newEntry({ autoListen: true })}><Mic size={17} /> Microphone</button>
            <button type="button" className="button" disabled={!active} onClick={async (event) => {
              const clipboard = event.currentTarget.ownerDocument.defaultView?.navigator.clipboard;
              const t = Date.now();
              try {
                const file = await readClipboardScreenshot(clipboard);
                newEntry({ t, screenshotFile: file });
              } catch (err) { setError((err as Error).message); }
            }}><ClipboardPaste size={17} /> Paste screenshot</button>
          </div>
          <p>Copy a chart screenshot, then paste it here. Add your thoughts and save together.</p>
        </div>
      )}
      <footer className="floating-journal-footer">
        <span>{syncState}</span>
        {!floating && active && <button type="button" className="text-button" onClick={onReopen}>Reopen floating dashboard</button>}
        <small>Keep the main Still Signal tab open.</small>
      </footer>
    </section>
  );
}
