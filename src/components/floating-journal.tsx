"use client";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import type { JournalEntry, Sample, Session } from "@/lib/model";
import { readClipboardScreenshot, validateScreenshotFile } from "@/lib/clipboard-screenshot";
import ReflectionEditor, { type ReflectionDraft } from "./reflection-editor";
import CapturePanel from "./concept/capture-panel";
export default function FloatingJournal({ session, samples, now, baselineSeconds, recording, active, syncState, floating, message, onClose, onReopen, prepareScreenshot, onSave }: {
  session: Session; samples: Sample[]; now: number; baselineSeconds: number; recording: boolean; active: boolean; syncState: string;
  floating: boolean; message: string; onClose: () => void; onReopen: () => void;
  prepareScreenshot: (t: number) => Promise<string>; onSave: (note: JournalEntry) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReflectionDraft | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const captureTime = () => active ? Date.now() : session.endedAt || session.startedAt;
  function newEntry(options: Partial<ReflectionDraft> = {}) {
    setStatus(""); setError(""); setDraft({ t: captureTime(), ...options });
  }
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (draft) setDraft(null); else onClose(); }
      if (event.altKey && event.key.toLowerCase() === "j") { event.preventDefault(); newEntry({ source: "voice", autoListen: true }); }
    };
    doc?.addEventListener("keydown", key);
    return () => doc?.removeEventListener("keydown", key);
  }, [draft, floating, onClose, active, session.endedAt, session.startedAt]);
  function paste(event: ClipboardEvent<HTMLElement>) {
    const file = Array.from(event.clipboardData.files).find(value => value.type.startsWith("image/"));
    if (!file || draft || !active) return;
    event.preventDefault();
    try { newEntry({ screenshotFile: validateScreenshotFile(file) }); }
    catch (err) { setError((err as Error).message); }
  }
  return <div ref={root} className="ss-app ss-popup-root" aria-label="Session dashboard" onPaste={paste}>
    <CapturePanel key={session.id} session={session} samples={samples} baselineSeconds={baselineSeconds} now={now} active={active} recording={recording} onClose={onClose} onReflect={newEntry} onSave={onSave}
      onScreenshot={async () => {
        const t = captureTime();
        try {
          const clipboard = root.current?.ownerDocument.defaultView?.navigator.clipboard;
          const screenshotFile = await readClipboardScreenshot(clipboard);
          newEntry({ t, screenshotFile });
        } catch (err) { newEntry({ t }); setError((err as Error).message); }
      }} />
    {draft ? <div className="ss-popup-editor"><ReflectionEditor session={session} draft={draft} owner={session.owner} question="Capture this moment." compact prepareScreenshot={prepareScreenshot} onSave={onSave}
      onDone={() => { setDraft(null); setStatus("Journal entry saved."); }} onCancel={() => setDraft(null)} /></div>
      : <button className="ss-popup-write" onClick={() => newEntry()}>Write a note →</button>}
    {message && <p role="status" className="ss-popup-status">{message}</p>}
    {error && <p role="alert" className="ss-popup-status">{error}</p>}
    {status && <p role="status" className="ss-popup-status">{status}</p>}
    {!floating && active && <button className="ss-popup-write" onClick={onReopen}>Reopen floating dashboard</button>}
    <span className="sr-only" role="status">{syncState}</span>
  </div>;
}
