"use client";
import { GlassPanel } from "../glassyui/glass-panel";
import type { Props } from "../concept/shared";
export const preparationTools = [
  ["routine", "Guided routine"], ["thesis", "Trading thesis"],
  ["missions", "Active missions"], ["variables", "Personal variables"],
  ["intentions", "Intentions"], ["checks", "Pre-market non-negotiables"],
  ["checkin", "Personal check-in"],
] as const;
export default function WorkflowNavigation({ owner, open }: {
  owner: string;
  open: (page: Parameters<Props["onPage"]>[0]) => void;
}) {
  const prepare = (tool: string) => {
    try { localStorage.setItem(`ss-preparation-tool:${owner}`, JSON.stringify(tool)); } catch {}
    open("Pre-Market");
  };
  return <div className="cc-workflow-navigation">
    <GlassPanel preset="standard" className="cc-workflow-group">
      <h2>Preparation</h2>
      <nav aria-label="Preparation">{preparationTools.map(([id, label]) =>
        <button key={id} onClick={() => id === "variables" ? open("Settings & Variables") : prepare(id)}>{label}</button>
      )}</nav>
    </GlassPanel>
    <GlassPanel preset="standard" className="cc-workflow-group">
      <h2>Review &amp; Refine</h2>
      <button className="cc-primary" onClick={() => open("Trade Quality")}>Session review</button>
      <nav aria-label="Review & Refine">{([
        ["Audits", "Daily review"], ["Rule Violations", "Rule history"],
        ["Settings & Variables", "Personal variables"],
      ] as const).map(([page, label]) => <button key={page} onClick={() => open(page)}>{label}</button>)}
        <button onClick={() => prepare("intentions")}>Session intentions</button>
      </nav>
    </GlassPanel>
  </div>;
}
