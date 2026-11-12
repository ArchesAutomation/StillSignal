"use client";
import { Panel } from "@/components/ui/panel";
import { searchLearningTopics } from "@/lib/learning-content";
import { useEffect, useRef, useState } from "react";
import type { Page } from "./concept/shared";
export default function LearningCentre({onClose,onNavigate,onStartTour}:{onClose:()=>void;onNavigate:(page:Page)=>void;onStartTour?:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [query,setQuery]=useState(""),[selected,setSelected]=useState("routine");
  const topics=searchLearningTopics(query), topic=topics.find(t=>t.id===selected)??topics[0];
  useEffect(()=>{const node=dialog.current;if(node&&!node.open)node.showModal();},[]);
  return <dialog ref={dialog} className="learning-centre" aria-labelledby="learning-title" onClose={onClose}>
    <Panel>
      <header><div><small>STILL SIGNAL / A PLACE TO LEARN</small><h2 id="learning-title">Help & learning</h2></div><button type="button" onClick={onClose} aria-label="Close learning centre">Close</button></header>
      {onStartTour && <button type="button" onClick={onStartTour}>Show me how Still Signal works</button>}
      <label>Find a task<input autoFocus type="search" aria-label="Search help" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try: close the day, caffeine, missing HR…" /></label>
      <div className="learning-layout">
        <nav aria-label="Help topics">{topics.map(t=><button key={t.id} type="button" aria-pressed={topic?.id===t.id} onClick={()=>setSelected(t.id)}><strong>{t.title}</strong><span>{t.summary}</span></button>)}</nav>
        {topic?<article aria-live="polite"><h3>{topic.title}</h3><ol>{topic.steps.map(step=><li key={step}>{step}</li>)}</ol><aside><strong>For example</strong><p>{topic.example}</p></aside><p className="learning-evidence">{topic.evidence}</p><button type="button" onClick={()=>{onClose();onNavigate(topic.page);}}>{topic.action} →</button></article>:<p role="status">No matching task. Try a shorter phrase, or clear the search to see every guide.</p>}
      </div>
    </Panel>
  </dialog>;
}
