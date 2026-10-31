"use client";
import { useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import type { Settings } from "@/lib/model";
import { stageLabels, stages, type Stage } from "@/lib/journal-reference";
import { sectionName } from "@/lib/journal-routing";
export default function PhaseLabelPreferences({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [stage, setStage] = useState<Stage>("before");
  const [drafts, setDrafts] = useState<Partial<Record<Stage, string[]>>>({});
  const [status, setStatus] = useState("");
  const rows = drafts[stage] ?? settings.phaseLabels?.[stage] ?? stageLabels[stage];
  const update = (next: string[]) => { setDrafts(old => ({ ...old, [stage]: next })); setStatus(""); };
  return <section className="glass settings-card phase-label-editor">
    <h2>Your stage labels</h2>
    <p>Choose a stage, then give each feeling or thought its own box. Saved labels appear throughout your journal.</p>
    <label>Trading stage<select aria-label="Stage to customize" value={stage} onChange={event => { setStage(event.target.value as Stage); setStatus(""); }}>
      {stages.map(value => <option key={value} value={value}>{sectionName(value)}</option>)}
    </select></label>
    <form onSubmit={event => {
      event.preventDefault();
      const labels = rows.map(row => row.trim()).filter(Boolean);
      if (labels.length > 30 || labels.some(row => row.length > 40)) { setStatus("Use up to 30 labels, each 40 characters or fewer."); return; }
      if (new Set(labels.map(row => row.toLocaleLowerCase())).size !== labels.length) { setStatus("Each label should be different. Remove the duplicate before saving."); return; }
      try {
        onChange({ ...settings, phaseLabels: { ...settings.phaseLabels, [stage]: labels } });
        setDrafts(old => { const next = { ...old }; delete next[stage]; return next; });
        setStatus(`${sectionName(stage)} labels saved. Journal suggestions are updated.`);
      } catch { setStatus("Could not save labels on this device. Your edits are still here."); }
    }}>
      <div className="phase-label-boxes">{rows.map((row, index) => <div className="phase-label-box" key={index}>
        <span>{index + 1}</span>
        <input aria-label={`${sectionName(stage)} label ${index + 1}`} value={row} maxLength={40} autoFocus={!row && index === rows.length - 1} placeholder="Add a feeling or thought" onChange={event => update(rows.map((value, i) => i === index ? event.target.value : value))} />
        <button type="button" aria-label={`Remove ${sectionName(stage)} label ${index + 1}`} onClick={() => update(rows.filter((_, i) => i !== index))}><X size={15} /></button>
      </div>)}</div>
      {!rows.length && <p>No suggestions for this stage. You can still write any label in your journal.</p>}
      <div className="phase-label-actions">
        <button type="button" className="button" disabled={rows.length >= 30} onClick={() => update([...rows, ""])}><Plus size={15} /> Add label</button>
        <button type="button" className="button" onClick={() => update([...stageLabels[stage]])}><RotateCcw size={14} /> Use defaults</button>
        <button className="button primary">Save labels</button>
      </div>
      <small>{rows.length}/30 labels · changes apply when you save · existing entries keep their words</small>
    </form>
    <label className="checkbox-label"><input type="checkbox" checked={settings.smallPauses !== false} onChange={event => onChange({ ...settings, smallPauses: event.target.checked })} /> Offer optional pauses before reflection</label>
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
