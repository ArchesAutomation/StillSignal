"use client";
import { useState } from "react";
import type { JournalEntry, Sample, Session } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import { summary } from "@/lib/analytics";
import { cx } from "./shared";
import Destination from "./destination";
import { validateDestination } from "@/lib/journal-routing";

export function captureSignal(samples: Sample[], session: Session, baselineSeconds: number) {
  const stats = summary(samples, samples[0]?.t || session.startedAt, baselineSeconds);
  const latest = samples.at(-1);
  const opening = samples.filter(s => s.t < (samples[0]?.t || session.startedAt) + baselineSeconds * 1000);
  const variance = stats.baseline === null || !opening.length ? 0 : opening.reduce((sum, s) => sum + (s.bpm - stats.baseline!) ** 2, 0) / opening.length;
  const ready = !!latest && latest.t >= (samples[0]?.t || session.startedAt) + baselineSeconds * 1000;
  const delta = ready && latest && stats.baseline !== null ? Math.round(latest.bpm - stats.baseline) : null;
  return { latest, delta, sigma: ready && variance > 0 && latest && stats.baseline !== null ? (latest.bpm - stats.baseline) / Math.sqrt(variance) : null };
}

export default function CapturePanel({ session, samples, baselineSeconds, now, active, recording, shortcut = "J", onClose, onReflect, onScreenshot, onSave }: {
  session: Session; samples: Sample[]; baselineSeconds: number; now: number; active: boolean; recording: boolean; shortcut?: string;
  onClose: () => void; onReflect: (draft: ReflectionDraft) => void; onScreenshot?: () => void;
  onSave: (note: JournalEntry) => Promise<void>;
}) {
  const { latest, sigma } = captureSignal(samples, session, baselineSeconds);
  const fresh = !!latest && (!active || (recording && now - latest.t <= 10000));
  const captureTime = active ? now : session.endedAt || session.startedAt;
  const [answer, setAnswer] = useState(""), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [section, setSection] = useState<JournalEntry["section"]>(), [tradeId, setTradeId] = useState(""), [custom, setCustom] = useState("");
  const question = "Is there an urge to act before you have checked your plan?";
  return <div className={cx("widgetpanel")}>
    <div className={cx("widgetpanelhead")}>
      <div><div className={cx("eyebrow")}>{active ? "Session live" : "Session ready"} · silent nudge</div>
        <h3>Capture this moment</h3><p>Context is attached to the current timestamp.</p></div>
      <button className={cx("widgetexpand")} aria-label="Close widget" onClick={onClose}>×</button>
    </div>
    <div className={cx("widgetsignal")}>
      <div><span>{active && fresh ? "CURRENT HR" : "LAST RECORDED HR"}</span><strong>{fresh ? latest?.bpm : "—"} BPM</strong></div>
      <div><span>PERSONAL DEVIATION</span><strong style={{ color: "var(--orange)" }}>{fresh && sigma !== null ? `${sigma.toFixed(1)}σ` : "—"}</strong></div>
    </div>
    <div className={cx("widgetactions")}>
      <button className={cx("primary")} onClick={() => onReflect({ t: captureTime, section, tradeId, customSection: custom, origin: "capture", source: "voice", autoListen: true })}>● Speak</button>
      <button className={cx("ghost")} onClick={() => onScreenshot ? onScreenshot() : onReflect({ t: captureTime, section, tradeId, customSection: custom, origin: "capture" })}>▣ Paste screenshot</button>
    </div>
    <div className={cx("widgetprompt")}><b>{question}</b><br />Does that description fit what you are noticing now?
      <Destination session={session} section={section} tradeId={tradeId} custom={custom} onSection={setSection} onTrade={setTradeId} onCustom={setCustom} />
      <div className={cx("widgetguess")}>{["Yes", "No", "Not sure"].map(value => <button key={value} disabled={busy} aria-pressed={answer === value} onClick={async () => {
        setBusy(true); setStatus("");
        try {
          const note: JournalEntry = { id: crypto.randomUUID(), t: Date.now(), eventTime: captureTime, section, tradeId: tradeId || undefined, customSection: section === "custom" ? custom : undefined, origin: "capture", label: "Unlabelled", text: value, source: "typed", prompt: { id: "silent-nudge", question } };
          validateDestination(note, session);
          await onSave(note);
          setAnswer(value); setStatus("Saved to My Journal.");
        } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save your answer."); }
        finally { setBusy(false); }
      }}>{value}</button>)}</div>
      {status && <span className={cx("widget-save")} role="status">{status}</span>}
    </div>
    <div className={cx("shortcut")}>ALT + {shortcut.toUpperCase()} · VOICE NOTE &nbsp; / &nbsp; ESC · CLOSE</div>
  </div>;
}
