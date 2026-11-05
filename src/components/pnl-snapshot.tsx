"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { weekOf } from "@/lib/process/model";
import { paintSnapshot, snapshotTrades, type SnapshotOptions } from "@/lib/pnl-export";
import { Field, type Context } from "./command-center/shared";
export default function PnlSnapshot({day,props}:Context) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [period,setPeriod]=useState("day"),[from,setFrom]=useState(day.body.date),[to,setTo]=useState(day.body.date);
  const [currency,setCurrency]=useState(""),[scope,setScope]=useState("all"),[ids,setIds]=useState<string[]>([]);
  const [caption,setCaption]=useState(""),[showDate,setShowDate]=useState(true),[showTimezone,setShowTimezone]=useState(true),[showCount,setShowCount]=useState(true),[showSymbols,setShowSymbols]=useState(false);
  const [style,setStyle]=useState<"ocean"|"midnight">("ocean"),[background,setBackground]=useState(""),[error,setError]=useState(""),[readyKey,setReadyKey]=useState("");
  const week=weekOf(day.body.date),weekEnd=new Date(Date.parse(week+"T12:00:00Z")+6*86400000).toISOString().slice(0,10);
  const start=period==="day"?day.body.date:period==="week"?week:from,end=period==="day"?day.body.date:period==="week"?weekEnd:to;
  const invalid=!start||!end||start>end;
  const ideas=useMemo(()=>snapshotTrades([...props.history,props.session],props.pulse.owner,start,end,day.body.timezone),[props.history,props.session,props.pulse.owner,start,end,day.body.timezone]);
  const currencies=[...new Set(ideas.map(i=>i.currency).filter(Boolean))].sort(),usedCurrency=currencies.includes(currency)?currency:currencies[0]||"";
  const available=ideas.filter(i=>i.currency===usedCurrency&&!!usedCurrency);
  const chosen=available.filter(i=>scope==="all"||(scope==="selected"?ids.includes(i.id):i.id===scope));
  const complete=!invalid&&chosen.length>0&&chosen.every(i=>i.complete),total=chosen.reduce((n,i)=>n+(i.pnl??0),0);
  const options:SnapshotOptions={currency:usedCurrency,total,complete,count:chosen.length,start,end,timezone:day.body.timezone,showDate,showTimezone,showCount,showSymbols,symbols:chosen.map(i=>i.symbol),caption,style};
  const renderKey=JSON.stringify([options,background,chosen.map(i=>[i.id,i.pnl,i.complete])]);
  useEffect(()=>{
    let alive=true;setReadyKey("");setError("");
    const draw=async()=>{const ctx=canvas.current?.getContext("2d");if(!ctx)throw Error("Image preview is unavailable in this browser.");
      let image:HTMLImageElement|undefined;if(background){image=new Image();image.src=background;await image.decode();}
      if(!alive)return;paintSnapshot(ctx,options,image);setReadyKey(renderKey);
    };
    void draw().catch(()=>{if(alive)setError("The preview could not be drawn. Remove the uploaded background or choose another image.");});
    return()=>{alive=false;};
    // renderKey includes every drawn option and selected record's value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[renderKey]);
  useEffect(()=>()=>{if(background)URL.revokeObjectURL(background);},[background]);
  const resetSelection=()=>{setScope("all");setIds([]);};
  return <details className="guide-advanced pnl-export"><summary>Optional: preview a shareable P&amp;L snapshot</summary>
    <p>Only recorded realised P&amp;L from fully closed trades is exported. Open positions are excluded. Fee treatment follows your source records. Names and accounts are never added automatically.</p>
    <div className="cc-grid">
      <Field label="Period"><select value={period} onChange={e=>{setPeriod(e.target.value);resetSelection();}}><option value="day">Selected day</option><option value="week">Selected week</option><option value="custom">Custom date range</option></select></Field>
      {period==="custom"&&<><Field label="From date"><input type="date" value={from} onChange={e=>{setFrom(e.target.value);resetSelection();}} /></Field><Field label="Through date"><input type="date" value={to} onChange={e=>{setTo(e.target.value);resetSelection();}} /></Field></>}
      <Field label="Currency"><select value={usedCurrency} onChange={e=>{setCurrency(e.target.value);resetSelection();}}>{currencies.length?currencies.map(c=><option key={c}>{c}</option>):<option value="">None recorded</option>}</select></Field>
      <Field label="Scope"><select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All closed trades in this period / currency</option><option value="selected">Choose several trades</option>{available.map(i=><option key={i.id} value={i.id}>{i.symbol} · {new Date(i.exit!).toLocaleString(undefined,{timeZone:day.body.timezone})}</option>)}</select></Field>
      <Field label="Display name / caption (optional)"><input maxLength={70} value={caption} onChange={e=>setCaption(e.target.value)} /></Field>
      <Field label="Background style"><select value={style} onChange={e=>{setStyle(e.target.value as typeof style);setBackground("");}}><option value="ocean">Still Signal ocean</option><option value="midnight">Midnight blue</option></select></Field>
      <Field label="Background image (optional)"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024||!/^image\/(png|jpeg|webp)$/.test(f.type)){setError("Choose a PNG, JPEG or WebP image under 5 MB.");return;}setBackground(URL.createObjectURL(f));}} /></Field>
    </div>
    {scope==="selected"&&<fieldset><legend>Trades to include</legend>{available.map(i=><label key={i.id} style={{display:"block"}}><input type="checkbox" checked={ids.includes(i.id)} onChange={e=>setIds(previous=>e.target.checked?[...previous,i.id]:previous.filter(id=>id!==i.id))} /> {i.symbol} · {new Date(i.exit!).toLocaleString(undefined,{timeZone:day.body.timezone})}{!i.complete?" · P&L incomplete":""}</label>)}</fieldset>}
    <div className="cc-actions">{[["Include date range",showDate,setShowDate],["Include timezone",showTimezone,setShowTimezone],["Include trade count",showCount,setShowCount],["Include symbols",showSymbols,setShowSymbols]].map(([name,value,set])=><label key={String(name)}><input type="checkbox" checked={value as boolean} onChange={e=>(set as (v:boolean)=>void)(e.target.checked)} /> {name as string}</label>)}</div>
    <button type="button" onClick={()=>setBackground("")}>Remove uploaded background</button>
    {invalid&&<p role="alert">Choose a valid date range with the start on or before the end.</p>}
    {ideas.some(i=>!i.currency)&&<p role="status">{ideas.filter(i=>!i.currency).length} closed trade(s) have missing or inconsistent currency and cannot be exported.</p>}
    {!complete&&!invalid&&<p role="status">{chosen.length?"Selected trades have incomplete realised P&L. Correct the source or select complete trades.":"No closed trades selected for this period and currency."}</p>}
    <canvas ref={canvas} width={1000} height={600} style={{width:"100%",maxWidth:700,height:"auto",display:"block",margin:"20px 0",borderRadius:18}} aria-label="Exact export preview" />
    <button type="button" disabled={!complete||readyKey!==renderKey||!!error} onClick={()=>canvas.current?.toBlob(blob=>{if(!blob){setError("The image could not be saved. Try again.");return;}const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="still-signal-pnl.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},"image/png")}>Export this preview</button>
    {error&&<p role="alert">{error}</p>}
  </details>;
}
