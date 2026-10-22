"use client";
import { useEffect, useState } from "react";
import type { Sample, Session, Settings } from "@/lib/model";
import { getSamples } from "@/lib/storage";
import { isOct20Demo } from "@/lib/demo-market";
import { compareLoad, measureLoad } from "@/lib/session-load";
import { cx, time } from "./shared";
export default function LoadMetric({ samples, session, history, settings, onInspect }: {
  samples: Sample[]; session: Session; history: Session[]; settings: Settings; onInspect: (t: number) => void;
}) {
  const [past, setPast] = useState<ReturnType<typeof measureLoad>[]>([]);
  useEffect(() => {
    let alive = true;
    setPast([]);
    void Promise.all(history.filter(s => s.owner === session.owner && s.id !== session.id && s.startedAt < session.startedAt && s.endedAt && s.sampleCount && !s.demo && !isOct20Demo(s))
      .slice(0, 30).map(async s => measureLoad(await getSamples(s.id, s.owner), settings)))
      .then(values => { if (alive) setPast(values); }).catch(() => {});
    return () => { alive = false; };
  }, [history, session.id, session.owner, session.startedAt, settings.baselineSeconds, settings.threshold]);
  const load = measureLoad(samples, settings), comparison = compareLoad(load, past);
  return <div className={cx("metric")}>
    <span>Session load</span><strong className={cx(comparison.label === "Provisional" && "load-learning")}>{samples.length ? comparison.label === "Provisional" ? "Learning your normal" : comparison.label : "—"}</strong>
    <small className={cx("loadhelp")}>{load.count} rises · {Math.round(load.magnitude)} BPM average rise · {Math.round(load.duration)}s duration</small>
    <details><summary>Inspect load</summary>
      <p>{comparison.count} prior recordings. Recovery: {load.recovery === null ? "not observed" : `${Math.round(load.recovery)}s average`}.</p>
      {comparison.reasons.map(reason => <p key={reason}>{reason}</p>)}
      {load.windows.map(window => <button key={window.id} className={cx("textlink")} onClick={() => onInspect(window.t)}>
        {time(window.t, false)}–{time(window.end, false)} · +{Math.round(window.delta)} BPM
      </button>)}
    </details>
  </div>;
}
