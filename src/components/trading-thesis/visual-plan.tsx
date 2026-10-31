"use client";
import { useState } from "react";
import { biasSchema, type BodyOf } from "@/lib/process/model";
import { Field } from "../command-center/shared";
type Thesis = BodyOf<"thesis">;
export default function VisualPlan({ body }: {body: Thesis}) {
  const [frames,setFrames] = useState(body.timeframes), [scenarios,setScenarios] = useState(body.scenarios ?? []);
  return <>
    <input type="hidden" name="visualTimeframes" value={JSON.stringify(frames)}/>
    <input type="hidden" name="visualScenarios" value={JSON.stringify(scenarios)}/>
    <fieldset><legend>Timeframe matrix</legend><div className="cc-grid">
      {frames.map((frame,i) => <div className="cc-thesis" key={i}>
        <Field label="Timeframe"><input required maxLength={160} value={frame.timeframe} onChange={e => setFrames(rows => rows.map((r,n) => n === i ? {...r,timeframe:e.target.value} : r))}/></Field>
        <Field label="Bias"><select value={frame.bias} onChange={e => setFrames(rows => rows.map((r,n) => n === i ? {...r,bias:biasSchema.parse(e.target.value)} : r))}>{biasSchema.options.map(b => <option key={b}>{b}</option>)}</select></Field>
        <details><summary>Structure, levels & invalidation</summary>{(["structure","levels","invalidation"] as const).map(key => <Field key={key} label={key}><textarea maxLength={8000} value={frame[key] ?? ""} onChange={e => setFrames(rows => rows.map((r,n) => n === i ? {...r,[key]:e.target.value} : r))}/></Field>)}</details>
        <button type="button" onClick={() => setFrames(rows => rows.filter((_,n) => n !== i))}>Remove timeframe</button>
      </div>)}
    </div><button type="button" disabled={frames.length >= 12} onClick={() => setFrames(rows => [...rows,{timeframe:"Custom",bias:"neutral"}])}>Add timeframe</button><small>Each bias is your input; no combined direction is inferred.</small></fieldset>
    <fieldset><legend>Scenario cards</legend><div className="cc-grid">{scenarios.map((s,i) => <article className="cc-thesis" key={s.id}>
      <Field label="Scenario title"><input required maxLength={160} value={s.title} onChange={e => setScenarios(rows => rows.map((r,n) => n === i ? {...r,title:e.target.value} : r))}/></Field>
      <Field label="Role"><select value={s.role} onChange={e => setScenarios(rows => rows.map((r,n) => n === i ? {...r,role:e.target.value as typeof s.role} : r))}>{["primary","alternative","no-trade"].map(v => <option key={v}>{v}</option>)}</select></Field>
      {(["condition","confirmation","action","invalidation"] as const).map(key => <Field label={key} key={key}><textarea maxLength={8000} value={s[key]} onChange={e => setScenarios(rows => rows.map((r,n) => n === i ? {...r,[key]:e.target.value} : r))}/></Field>)}
      <button type="button" onClick={() => setScenarios(rows => rows.filter((_,n) => n !== i))}>Remove scenario</button>
    </article>)}</div><button type="button" disabled={scenarios.length >= 20} onClick={() => setScenarios(rows => [...rows,{id:crypto.randomUUID(),title:"New scenario",role:rows.length ? "alternative":"primary",condition:"",confirmation:"",action:"",invalidation:""}])}>Add scenario</button></fieldset>
  </>;
}
