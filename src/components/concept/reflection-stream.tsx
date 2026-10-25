"use client";
import type { JournalEntry, Session } from "@/lib/model";
import { captureMode } from "@/lib/session-timeline";
import { noteTime, sectionName } from "@/lib/journal-routing";
import { AudioPlayback } from "../reflection-audio";
import { Screenshot } from "../reflection-editor";
import { cx,time } from "./shared";
export default function ReflectionStream({ session,onEdit,onSave }: {session:Session;onEdit:(n:JournalEntry)=>void;onSave:(n:JournalEntry)=>Promise<void>}) {
  const notes=session.journal.filter(n=>!n.deletedAt).sort((a,b)=>(noteTime(a)??a.capturedAt??a.t)-(noteTime(b)??b.capturedAt??b.t));
  return <section className={cx("reflection-stream")} aria-label="Chronological journal">
    <div className={cx("sectiontitle")}><div><h2>Your day, in your words</h2><p>Live and later reflections keep their own place in the record.</p></div><span>{notes.length} reflections</span></div>
    {notes.map(n=><details key={n.id} className={cx("stream-note")}>
      <summary><time>{noteTime(n)===null?"Day note":time(noteTime(n)!)}</time><span className={cx("provenance-badge")} data-origin={n.captureMode}>{captureMode(n)}</span><span aria-label={n.inputMethod||n.source||"text"}>{n.source==="voice"||n.inputMethod==="voice"?"● Voice":n.prompt?"◇ Prompt":"✎ Text"}</span><b>{n.label}</b><span>{n.text.slice(0,130)}{n.text.length>130?"…":""}</span></summary>
      <div className={cx("stream-detail")}>
        <small>Captured {new Date(n.capturedAt??n.t).toLocaleString()} · {noteTime(n)===null?"Neutral day reflection":`Session time ${time(noteTime(n)!)}`} · {n.tradeId?sectionName(n.section):"Day scope"}</small>
        {n.prompt&&<blockquote>{n.prompt.question}{n.prompt.choice&&<small>{n.prompt.choice}</small>}</blockquote>}
        <p>{n.text}</p>
        {n.originalTranscript&&n.originalTranscript!==n.text&&<details><summary>Original transcript</summary><p>{n.originalTranscript}</p></details>}
        {n.audio&&<AudioPlayback audio={n.audio} owner={session.owner} onDelete={()=>onSave({...n,audio:undefined})}/>}
        {n.screenshot&&<Screenshot {...n.screenshot}/>}
        <button className={cx("textlink")} onClick={()=>onEdit(n)}>Edit reflection</button>
      </div>
    </details>)}
    {!notes.length&&<p className={cx("empty-note")}>A neutral day reflection can stand on its own. No trade tag is required.</p>}
    {!!notes.length&&<div className={cx("emotion-summary")} aria-label="Day emotion summary">{[...new Set(notes.map(n=>n.label))].map(label=><span key={label}>{label} <b>{notes.filter(n=>n.label===label).length}</b></span>)}</div>}
  </section>;
}
