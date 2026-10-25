"use client";
import { useState } from "react";
import type { Session } from "@/lib/model";
import { noCombination, type SessionBlueprint } from "@/lib/blueprint-schema";
import { cleanPrivateFiles } from "@/lib/private-files";
export default function BlueprintPreferences({session,onSave,history=[]}:{session:Session;history?:Session[];onSave:(patch:Partial<SessionBlueprint>)=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
  const b=session.blueprint,combine=b?.combine||noCombination,profile=b?.profile;
  async function save(patch:Partial<SessionBlueprint>){setBusy(true);try{await onSave(patch);setStatus("Saved for this session.");}catch(e){setStatus(e instanceof Error?e.message:"Could not save.");}finally{setBusy(false);}}
  const previous=history.filter(s=>s.owner===session.owner && s.id!==session.id && s.blueprint?.profile?.consent && (s.blueprint.profile.measuredAt || 0)<(profile?.measuredAt || 0)).sort((a,b)=>b.blueprint!.profile!.measuredAt-a.blueprint!.profile!.measuredAt)[0]?.blueprint?.profile;
  return <section className="glass settings-card"><h2>Your data, your choice</h2><p>Choose which sources may be combined for this session’s pattern analysis. Each source remains available on its own.</p>
    {Object.keys(noCombination).map(key=><label key={key} className="checkbox-label"><input type="checkbox" checked={combine[key as keyof typeof combine]} disabled={busy} onChange={e=>void save({combine:{...combine,[key]:e.target.checked}})}/>{({audio:"Original audio markers",transcript:"Reflection transcripts",hr:"Heart rate",pnl:"P&L exposure",profile:"Physiology profile",environment:"Environment"} as Record<string,string>)[key]}</label>)}
    <p>No exact GPS is collected. Audio retention consent is separate and asked when recording. Profile and sensitive fields each require separate consent below.</p>
    <button className="button" disabled={busy} onClick={async()=>{setBusy(true);try{await cleanPrivateFiles(session.owner,undefined,true);setStatus("All original audio on this device deleted. Transcripts kept.");}catch{setStatus("Could not delete audio. Please retry.");}finally{setBusy(false);}}}>Delete all original audio on this device</button>
    <details><summary>Optional physiology profile</summary><p>A dated snapshot of your own baseline. Weight and recovery can change. Physical features are never used to infer character or trading ability.</p>
      <form key={b?.updatedAt||session.id} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),consent=f.get("consent")==="on",sensitiveConsent=f.get("sensitive")==="on",number=(k:string)=>f.get(k)?Number(f.get(k)):undefined;
        if(!consent){setStatus("Choose profile consent before saving health data.");return;}
        void save({profile:{consent,sensitiveConsent,measuredAt:Date.now(),age:number("age"),heightCm:number("height"),weightKg:number("weight"),restingHr:number("resting"),recovery:number("recovery"),caffeine:sensitiveConsent?String(f.get("caffeine")||""):undefined,medication:sensitiveConsent?String(f.get("medication")||""):undefined}});}}>
        <label className="checkbox-label"><input type="checkbox" name="consent" defaultChecked={profile?.consent}/>I choose to save this optional physiology snapshot</label>
        <label>Age · optional<input name="age" type="number" min="18" max="120" defaultValue={profile?.age}/></label>
        <label>Height · cm<input name="height" type="number" min="50" max="250" step="any" defaultValue={profile?.heightCm}/></label>
        <label>Weight · kg<input name="weight" type="number" min="20" max="400" step="any" defaultValue={profile?.weightKg}/></label>
        <label>Resting HR · BPM<input name="resting" type="number" min="25" max="200" defaultValue={profile?.restingHr}/></label>
        <label>Recovery · 0–100<input name="recovery" type="number" min="0" max="100" defaultValue={profile?.recovery}/></label>
        <label className="checkbox-label"><input type="checkbox" name="sensitive" defaultChecked={profile?.sensitiveConsent}/>I separately choose to save caffeine / medication information</label>
        <label>Caffeine · optional<input name="caffeine" maxLength={160} defaultValue={profile?.sensitiveConsent?profile.caffeine:""}/></label>
        <label>Medication · optional<input name="medication" maxLength={160} defaultValue={profile?.sensitiveConsent?profile.medication:""}/></label>
        {profile&&<small>Snapshot recorded {new Date(profile.measuredAt).toLocaleString()}. Source: entered by you.</small>}
        {profile?.consent&&previous&&<p>Your prior snapshot: {new Date(previous.measuredAt).toLocaleDateString()}. {profile.weightKg!==undefined&&previous.weightKg!==undefined&&<>Weight change: {(profile.weightKg-previous.weightKg).toFixed(1)} kg. </>}{profile.restingHr!==undefined&&previous.restingHr!==undefined&&<>Resting HR change: {profile.restingHr-previous.restingHr} BPM.</>} Your own history is the reference; no population ranking is applied.</p>}
        <button className="button primary" disabled={busy}>Save dated snapshot</button>
      </form><button className="text-button" disabled={busy||!profile} onClick={()=>void save({profile:undefined,combine:{...combine,profile:false}})}>Delete this physiology snapshot</button>
    </details><p role="status">{status}</p>
  </section>;
}
