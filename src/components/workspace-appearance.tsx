"use client";
import { useEffect, useRef, useState } from "react";
import { GlassPanel } from "./glassyui/glass-panel";
import { z } from "zod";
import { useSavedGuide } from "./use-saved-guide";
import type { Props } from "./concept/shared";
import LearningCentre from "./learning-centre";
export default function WorkspaceAppearance({ props, settings = false }: { props: Pick<Props, "onPage"> & { pulse: Pick<Props["pulse"], "owner"> }; settings?: boolean }) {
  const container = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), helpTrigger = useRef<HTMLButtonElement>(null);
  const [learning, setLearning] = useState(false), [tour, setTour] = useState(false), [step, setStep] = useState(0);
  const saved = useSavedGuide(`ss-appearance:${props.pulse.owner}`, () => ({ scale: 100, balance: "original" as "original" | "evidence" }), v => z.object({ scale: z.number().min(100).max(130), balance: z.enum(["original", "evidence"]) }).parse(v));
  useEffect(() => {
    const update = () => {
      let scale = 100;
      try { scale = Number(JSON.parse(localStorage.getItem(`ss-appearance:${props.pulse.owner}`) || "{}").scale) || 100; } catch {}
      container.current?.closest<HTMLElement>(".ss-app")?.style.setProperty("--journal-text-scale", String(Math.max(100, Math.min(130, scale)) / 100));
    };
    update(); window.addEventListener("ss-text-size", update); window.addEventListener("storage", update);
    return () => { window.removeEventListener("ss-text-size", update); window.removeEventListener("storage", update); };
  }, [props.pulse.owner, saved.value.scale]);
  useEffect(() => { if (tour) dialog.current?.showModal?.(); else dialog.current?.close?.(); }, [tour]);
  const tourSteps = [
    [
      "Prepare with a guide",
      "Start / resume preparation in Command Center. Set up your journal once, then follow the same steps each day. You can skip a reflection, return later or edit your summary.",
      "Pre-Market",
    ],
    [
      "Keep your plan within reach",
      "Today's reference in Command Center holds your narrative, intentions, risk and check-in. Edit just one answer when something changes.",
      "Command Center",
    ],
    [
      "Capture a moment",
      "Open Daily journal. Choose writing or voice, add your own words or chart image, and save. You can select a moment to inspect its HR period. With no wearable, your journal still works.",
      "Journal",
    ],
    [
      "Review your process",
      "A fully closed trade offers one invitation. Start with the session overview, then review a trade one rule at a time. Unknown checks are not violations. Stillness is optional.",
      "Trade Quality",
    ],
    [
      "Explore your own context",
      "Patterns compares measured records with labels and observations you entered. A simultaneous HR change and feeling does not establish a cause.",
      "Patterns",
    ],
  ] as const;
  return <div ref={container} className={settings ? "guide-text-settings" : "guide-resources guide-header-resources"}>
    {settings ? <label>Journal text size
      <select aria-label="Journal text size" value={saved.value.scale} onChange={e => { saved.update(v => ({ ...v, scale: +e.target.value })); window.dispatchEvent(new Event("ss-text-size")); }}>
        {[100,115,130].map(n => <option key={n} value={n}>{n}%</option>)}
      </select>
      <small>Scales journal writing, saved reflections and evidence text.</small>
      {saved.storageError && <p role="status">{saved.storageError}</p>}
    </label> : <>
      <button ref={helpTrigger} type="button" onClick={() => setLearning(true)}>Help & learning</button>
      <button type="button" onClick={() => { setStep(0); setTour(true); }}>Show me how Still Signal works</button>
    </>}
    {learning && <LearningCentre onClose={() => { setLearning(false); helpTrigger.current?.focus(); }} onNavigate={props.onPage} />}
    <dialog ref={dialog} aria-label="Still Signal guided tour" className="guide-tour" onClose={() => setTour(false)}>
      <GlassPanel><small>Learn Still Signal · {step+1} of {tourSteps.length}</small><h2>{tourSteps[step][0]}</h2><p>{tourSteps[step][1]}</p>
        <div className="cc-actions">
          <button disabled={!step} onClick={() => setStep(s => s-1)}>Back</button>
          <button onClick={() => { props.onPage(tourSteps[step][2]); setTour(false); }}>Take me there</button>
          <button onClick={() => step+1 < tourSteps.length ? setStep(s => s+1) : setTour(false)}>{step+1 < tourSteps.length ? "Next" : "Finish tour"}</button>
          <button autoFocus onClick={() => setTour(false)}>Close tour</button>
        </div>
      </GlassPanel>
    </dialog>
  </div>;
}
