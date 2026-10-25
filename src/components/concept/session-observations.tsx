"use client";
import { useMemo } from "react";
import type { Session,Sample } from "@/lib/model";
import { sessionObservations } from "@/lib/session-timeline";
import { cx,time } from "./shared";
import GentlePause from "../gentle-pause";
export default function SessionObservations({session,samples,baselineSeconds}:{session:Session;samples:Sample[];baselineSeconds:number}){
  const observations=useMemo(()=>sessionObservations(session,samples,baselineSeconds),[session,samples,baselineSeconds]);
  return <details className={cx("pnl-panel")}><summary>Personal observations · inspect the evidence</summary>
    <p>Only sources enabled in this session’s data controls are combined. Observations describe your record; they do not diagnose a state or suggest a trade.</p>
    {session.events.some(e=>e.kind==="exit"&&e.pnl!==undefined&&e.pnl!==0)&&<GentlePause/>}
    {session.blueprint?.combine?.hr&&<p>{observations.baseline===null?"Opening HR baseline incomplete; recovery stays unavailable.":<>Opening baseline: {Math.round(observations.baseline)} BPM. {observations.recoveryCount?<>Mean observed return to within 5 BPM: {Math.round(observations.recoverySeconds!)} seconds across {observations.recoveryCount} exits. Return must last 30 seconds; gaps reset the measurement.</>:"No elevated exit has a measured 30-second recovery window."}</>}</p>}
    {observations.voice.length>0&&<><h3>Voice markers</h3><p>Approximate words per minute using the original transcript and recording length. Silence is included. These markers do not prove an emotion.</p>{observations.voice.map(v=><p key={v.id}>{time(v.t)} · approximately {v.wpm} words/minute</p>)}</>}
    <h3>Live account & later reflection</h3>
    {observations.comparisons.length?observations.comparisons.map(({live,later})=><div className={cx("source-row")} key={live.id+later.id}><p><b>LIVE · {live.label}</b> “{live.text}”</p><p><b>POST-SESSION · {later.label}</b> “{later.text}”</p></div>):<p>No linked live/post-session pair available with transcript analysis enabled. Both accounts stay separate when you add them.</p>}
    <small>{new Date(session.startedAt).toLocaleDateString()} · {observations.timeline.length} source events · {samples.length} recorded HR samples. Missing data is not filled in.</small>
  </details>;
}
