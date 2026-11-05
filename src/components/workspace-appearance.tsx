"use client";
import { useEffect, useRef, useState } from "react";
import { GlassPanel } from "./glassyui/glass-panel";
import { z } from "zod";
import { useSavedGuide } from "./use-saved-guide";
import type { Props } from "./concept/shared";
import LearningCentre from "./learning-centre";
export default function WorkspaceAppearance({ props }: { props: Props }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDetailsElement>(null),
    [tour, setTour] = useState(false),
    [learning, setLearning] = useState(false),
    [step, setStep] = useState(0);
  const saved = useSavedGuide(
    `ss-appearance:${props.pulse.owner}`,
    () => ({ scale: 100, balance: "original" as "original" | "evidence" }),
    (v) =>
      z
        .object({
          scale: z.number().min(100).max(130),
          balance: z.enum(["original", "evidence"]),
        })
        .parse(v),
  );
  useEffect(() => {
    const root = menu.current?.closest<HTMLElement>(".ss-app");
    if (root) {
      root.style.setProperty(
        "--journal-text-scale",
        String(saved.value.scale / 100),
      );
      root.dataset.journalBalance = saved.value.balance;
      window.dispatchEvent(new window.CustomEvent("ss-journal-balance"));
    }
  }, [saved.value]);
  useEffect(() => {
    const close = (event: Event) => {
      if (
        event.type === "keydown"
          ? (event as KeyboardEvent).key === "Escape"
          : !menu.current?.contains(event.target as Node)
      )
        menu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  useEffect(() => {
    if (tour) dialog.current?.showModal?.();
    else dialog.current?.close?.();
  }, [tour]);
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
  return (
    <div className="guide-resources">
      <button ref={helpTrigger} type="button" className="guide-help-entry" onClick={() => setLearning(true)}>Help & learning</button>
      {learning && <LearningCentre onClose={() => { setLearning(false); helpTrigger.current?.focus(); }} onNavigate={props.onPage} />}
      <details ref={menu} className="guide-appearance">
        <summary>Journal guide & text</summary>
        <div>
          <label>
            Journal text size
            <select
              value={saved.value.scale}
              onChange={(e) =>
                saved.update((v) => ({ ...v, scale: +e.target.value }))
              }
            >
              {[100, 115, 130].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </label>
          <label>
            Journal arrangement
            <select
              value={saved.value.balance}
              onChange={(e) =>
                saved.update((v) => ({
                  ...v,
                  balance: e.target.value as typeof v.balance,
                }))
              }
            >
              <option value="original">Original balance</option>
              <option value="evidence">More room for selected evidence</option>
            </select>
          </label>
          <button
            onClick={() => {
              setStep(0);
              setTour(true);
              menu.current?.removeAttribute("open");
            }}
          >
            Show me how Still Signal works
          </button>
          {saved.storageError && <p role="status">{saved.storageError}</p>}
        </div>
      </details>
      <dialog
        ref={dialog}
        aria-label="Still Signal guided tour"
        className="guide-tour"
        onClose={() => setTour(false)}
      >
        <GlassPanel>
          <small>
            Learn Still Signal · {step + 1} of {tourSteps.length}
          </small>
          <h2>{tourSteps[step][0]}</h2>
          <p>{tourSteps[step][1]}</p>
          <div className="cc-actions">
            <button disabled={!step} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
            <button
              onClick={() => {
                props.onPage(tourSteps[step][2]);
                setTour(false);
              }}
            >
              Take me there
            </button>
            <button
              onClick={() =>
                step + 1 < tourSteps.length
                  ? setStep((s) => s + 1)
                  : setTour(false)
              }
            >
              {step + 1 < tourSteps.length ? "Next" : "Finish tour"}
            </button>
            <button autoFocus onClick={() => setTour(false)}>
              Close tour
            </button>
          </div>
        </GlassPanel>
      </dialog>
    </div>
  );
}
