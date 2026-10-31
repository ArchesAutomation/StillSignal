"use client";
import { useEffect, useMemo, useState } from "react";
import type { Sample } from "@/lib/model";
import { getSamples } from "@/lib/storage";
import { replayContext, replayTimeline } from "@/lib/process/replay";
import { preparation, sessionsForDay } from "@/lib/process/engine";
import { analyticalSamples, eventPhysiology } from "@/lib/pattern-engine/physiology";
import { isActualExecution } from "@/lib/trade-context";
import { Empty, Field, Panel, type Context } from "../command-center/shared";
export default function ProcessReplay({store,day,props}:Context) {
  const sessions=sessionsForDay(props.history,day),[sessionId,setSessionId]=useState(""),[cursor,setCursor]=useState<number>(),[samples,setSamples]=useState<Sample[]>([]),[error,setError]=useState("");
  const session=sessions.find(s => s.id === sessionId) ?? sessions[0];
  useEffect(() => {let active=true;setSamples([]);setError("");if(session) void getSamples(session.id,props.pulse.owner).then(rows => {if(active)setSamples(rows);}).catch(() => {if(active)setError("Recorded HR could not be loaded from this device.");});return () => {active=false;};},[session?.id,props.pulse.owner]);
  const timeline=useMemo(() => session ? replayTimeline(store.records,day.rootId,session) : [],[store.records,day.rootId,session]);
  const at=Math.min(cursor ?? timeline.at(-1)?.at ?? 0,timeline.at(-1)?.at ?? 0),visible=timeline.filter(e => e.at <= at),context=replayContext(store.records,day.rootId,at),prep=preparation(context.available,day.rootId,at);
  const execution=session?.events.filter(isActualExecution).filter(e => Math.max(e.t,e.receivedAt ?? e.t) <= at).sort((a,b) => b.t-a.t)[0];
  const physiology=session && execution ? eventPhysiology(analyticalSamples(session,session.id === props.session.id ? props.pulse.samples.filter(p => p.t <= at) : samples.filter(p => p.t <= at)),execution) : undefined;
  return <Panel title="Plan versus execution replay" detail="The cursor shows recorded availability. Later revisions and edited notes appear only when their current version became available.">
    <Field label="Recording session"><select value={session?.id ?? ""} onChange={e => {setSessionId(e.target.value);setCursor(undefined);}}><option value="" disabled>Choose a session</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.name} · {new Date(s.startedAt).toLocaleString()}</option>)}</select></Field>
    {!timeline.length ? <Empty>No linked recording evidence for this day.</Empty> : <>
      <Field label="Replay time"><input type="range" min={timeline[0].at} max={timeline.at(-1)!.at} step={1} value={at} onChange={e => setCursor(+e.target.value)} /></Field><p aria-live="polite">{new Date(at).toLocaleString()} · {visible.length} recorded events</p>
      <div className="cc-actions"><button onClick={() => setCursor([...timeline].reverse().find(e => e.at < at)?.at ?? timeline[0].at)}>Previous event</button><button onClick={() => setCursor(timeline.find(e => e.at > at)?.at ?? at)}>Next event</button><button onClick={() => {if(session)void props.pulse.openSession(session).then(() => props.onPage("Journal")).catch(e => setError(String(e)));}}>Open source journal & charts</button></div>
      <div className="cc-grid"><article className="cc-thesis"><h3>Plan available at this time</h3>{context.theses.map(t => <p key={t.id}>{t.body.instrument} · {t.body.bias} · v{t.revision}: {t.body.primary || "No primary text"}{t.body.scenarios?.map(s => <span key={s.id}> · {s.title}: {s.condition} → {s.action}</span>)}</p>)}{!context.theses.length && <p>No daily thesis available.</p>}<p>Preparation: {prep.complete}/{prep.total} · {prep.unknown} unknown · {prep.excluded} not applicable</p><p>{context.assessments.length} assessments recorded.</p></article>
      <article className="cc-thesis"><h3>Recorded physiology</h3>{physiology ? <><p>Baseline: {physiology.baseline?.toFixed(1) ?? "Unavailable"} BPM</p>{Object.entries(physiology.windows).map(([name,w]) => <p key={name}>{name}: {w.mean?.toFixed(1) ?? "Unavailable"} BPM · {(w.coverage*100).toFixed(0)}% coverage · baseline change {w.meanDeviation?.toFixed(1) ?? "unavailable"}</p>)}<p>{physiology.exclusion}</p></> : <p>No execution-aligned measurements available.</p>}<small>HR does not identify an emotion. Samples after the cursor are excluded.</small></article></div>
      <ol className="cc-replay-events">{visible.slice(-100).map(e => <li key={e.id}><details><summary>{new Date(e.at).toLocaleTimeString()} · {e.label}</summary><p>{e.detail}</p><small>{e.source} · occurred {new Date(e.occurredAt).toLocaleString()}{e.approximate ? " · availability or timing uncertain; current snapshot only" : ""}</small></details></li>)}</ol><small>Showing the latest 100 events before the cursor. Missing prices, earlier mutable journal text and unrecorded source timestamps cannot be reconstructed.</small>
    </>}{error && <p role="alert">{error}</p>}
  </Panel>;
}
