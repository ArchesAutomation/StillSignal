"use client";
import { useState } from "react";
import { usePhaseLabels } from "../phase-label-context";
import { labelsFor, stages, type Stage } from "@/lib/journal-reference";
import { sectionName } from "@/lib/journal-routing";
export default function StageLabelModule({ onSettings }: { onSettings: () => void }) {
  const [stage, setStage] = useState<Stage>("before");
  const labels = usePhaseLabels();
  return <section className="ss-space-card"><h3>Your stage suggestions</h3><label>Stage<select aria-label="Suggestion stage" value={stage} onChange={event => setStage(event.target.value as Stage)}>{stages.map(s => <option key={s} value={s}>{sectionName(s)}</option>)}</select></label><div className="ss-stage-label-chips">{labelsFor(stage, labels).map(label => <span key={label}>{label}</span>)}</div>{!labelsFor(stage, labels).length && <p>No suggestions saved for this stage.</p>}<button onClick={onSettings}>Edit these labels in Settings →</button></section>;
}
