"use client";
import { useMemo, useState } from "react";
import { money, type Session, type Sample } from "@/lib/model";
import { Temporal } from "@js-temporal/polyfill";
import { nearest } from "@/lib/analytics";
import { parsePnlCsv, pnlExposure } from "@/lib/session-timeline";
import { noteTime } from "@/lib/journal-routing";
import type { PnlPoint, SessionBlueprint } from "@/lib/blueprint-schema";
import { keepPrivateFile, privateFile, removePrivateFile } from "@/lib/private-files";
import { cx,time } from "./shared";
export default function PnlTimeline({session,samples,onSave}:{session:Session;samples:Sample[];onSave:(p:Partial<SessionBlueprint>)=>Promise<void>}) {
  const data=session.blueprint;
  const accounts=[...new Set([...(data?.pnl||[]).map(p=>p.account),...session.events.map(e=>e.broker?.accountId||e.account||"manual")])];
  const leader=data?.leaderAccount&&accounts.includes(data.leaderAccount)?data.leaderAccount:accounts[0]||"";
  const currencies=[...new Set([...(data?.pnl||[]).filter(p=>p.account===leader).map(p=>p.currency),...session.events.filter(e=>(e.broker?.accountId||e.account||"manual")===leader).map(e=>e.currency||"USD")])];
  const [selectedSymbol,setSymbol]=useState(""),[selectedCurrency,setCurrency]=useState(""),[threshold,setThreshold]=useState(0),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
  const currency=currencies.includes(selectedCurrency)?selectedCurrency:currencies[0]||"USD";
  const [pending,setPending]=useState<{csv:string;name:string;points:PnlPoint[]}>(),[timezone,setTimezone]=useState(session.timezone||"UTC");
  const scopes=[...new Set((data?.pnl||[]).filter(p=>p.account===leader&&p.currency===currency).map(p=>p.symbol))];
  const scope=scopes.includes(selectedSymbol)?selectedSymbol:scopes.includes("Account")?"Account":scopes[0];
  const exposure=useMemo(()=>pnlExposure(session,leader,currency,threshold,scope),[session,leader,currency,threshold,scope]);
  const points=exposure.curve, times=[...session.events.map(e=>e.t),...points.map(p=>p.t),...samples.map(p=>p.t)];
  const start=times.length?times.reduce((a,b)=>Math.min(a,b),Infinity):session.startedAt,end=times.reduce((a,b)=>Math.max(a,b),start+1000);
  const x=(t:number)=>30+(t-start)/(end-start)*940;
  const min=Math.min(0,...points.map(p=>p.total)),max=Math.max(1,...points.map(p=>p.total)),y=(v:number)=>145-(v-min)/(max-min)*120;
  const notes=session.journal.filter(n=>!n.deletedAt&&noteTime(n)!==null&&noteTime(n)!>=start&&noteTime(n)!<=end);
  const combinedHr=data?.combine?.hr&&data.combine.pnl;
  const day=Temporal.Instant.fromEpochMilliseconds(session.startedAt).toZonedDateTimeISO(session.timezone||"UTC").toPlainDate().toString();
  const selectedPnl=pending?.points.filter(p=>Temporal.Instant.fromEpochMilliseconds(p.t).toZonedDateTimeISO(session.timezone||"UTC").toPlainDate().toString()===day)||[];
  async function save(patch:Partial<SessionBlueprint>){setBusy(true);try{await onSave(patch);setStatus("Saved to this session.");return true;}catch(e){setStatus(e instanceof Error?e.message:"Could not save.");return false;}finally{setBusy(false);}}
  async function sourceFile(id:string,name:string,remove=false){try{const path=`local-csv:${session.owner}:${id}`;if(remove){await removePrivateFile(path,session.owner);setStatus("Original file deleted from this device. Imported events are kept.");return;}
    const blob=await privateFile(path,session.owner),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setStatus(e instanceof Error?e.message:"Original unavailable.");}}
  return <section className={cx("pnl-panel")} aria-label="P&L exposure timeline">
    <div className={cx("sectiontitle")}><div><h2>P&L exposure</h2><p>One leader account. Follower balances are never added together.</p></div>
      <label>Leader account<select aria-label="Leader account" disabled={busy} value={leader} onChange={e=>void save({leaderAccount:e.target.value})}>{accounts.length?accounts.map(a=><option key={a}>{a}</option>):<option value="">No account data</option>}</select></label>
      {!!scopes.length&&<label>P&L scope<select value={scope} onChange={e=>setSymbol(e.target.value)}>{scopes.map(s=><option key={s}>{s}</option>)}</select></label>}
      <label>Currency<select aria-label="P&L currency" value={currency} onChange={e=>setCurrency(e.target.value)}>{(currencies.length?currencies:["USD"]).map(c=><option key={c}>{c}</option>)}</select></label>
    </div>
    {!!points.length&&<>
      <svg viewBox="0 0 1000 200" role="img" aria-label="Timestamped P&L with optional heart rate and reflections" className={cx("pnl-chart")}>
        <line x1="30" x2="970" y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".25"/>
        <path fill="none" stroke="var(--accent, #b5d6a5)" strokeWidth="2" d={points.map((p,i)=>!i?`M${x(p.t)},${y(p.total)}`:!exposure.hasOpenPnl?`H${x(p.t)} L${x(p.t)},${y(p.total)}`:`${p.t-points[i-1].t<=60000?"L":"M"}${x(p.t)},${y(p.total)}`).join(" ")}/>
        {combinedHr&&samples.filter((_,i)=>i%Math.max(1,Math.floor(samples.length/500))===0).map(p=><circle key={p.t} cx={x(p.t)} cy={150-(p.bpm-25)/215*120} r="1.5" fill="#d79196"><title>{time(p.t)} · {p.bpm} BPM · {p.provider||"recorded HR"}</title></circle>)}
        {data?.combine?.transcript&&data.combine.pnl&&notes.map(n=><circle key={n.id} cx={x(noteTime(n)!)} cy="165" r="4" fill={n.captureMode==="live"?"#a8cbb7":"#ccb2de"}><title>{time(noteTime(n)!)} · {n.captureMode||"legacy"} · {n.label}</title></circle>)}
        {session.events.filter(e=>!e.voided&&(e.broker?.accountId||e.account||"manual")===leader).map(e=><path key={e.id} d={`M${x(e.t)},177 l-3,5 h6 z`} fill="currentColor"><title>{time(e.t)} · {e.symbol} {e.kind} · {e.source}</title></path>)}
        {[0,1,2,3,4].map(i=><text key={i} x={x(start+(end-start)*i/4)} y="198" textAnchor={i===0?"start":i===4?"end":"middle"} fill="currentColor" fontSize="11">{time(start+(end-start)*i/4,false)}</text>)}
        <text x="30" y="14" fill="currentColor" fontSize="12">{money(max,currency)}</text><text x="970" y="158" textAnchor="end" fill="currentColor" fontSize="12">{money(min,currency)}</text>
      </svg>
      <p>{exposure.source} · {points.length} points · {new Date(start).toLocaleDateString()} · Times shown in your browser timezone. {combinedHr?"Pink dots: recorded HR, 25–240 BPM scale. ":""}{data?.combine?.transcript&&data.combine.pnl?"Bottom circles: live (green) / later (purple) reflections. ":""}Triangles: fills.</p>
      <div className={cx("exposure-metrics")}><span>Peak open profit <b>{exposure.peakOpen===null?"Unavailable":money(exposure.peakOpen,currency)}</b></span><span>Observed drawdown <b>{exposure.maxDrawdown===null?"Unavailable":money(exposure.maxDrawdown,currency)}</b></span><span>Open-profit giveback <b>{exposure.giveback===null?"Unavailable":money(exposure.giveback,currency)}</b></span></div>
      <details><summary>Time above / below a threshold</summary><label>Threshold ({currency})<input type="number" step="any" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label><p>{Math.round(exposure.aboveMs/1000)} measured seconds above · {Math.round(exposure.belowMs/1000)} below. Gaps over 60 seconds are excluded; fills alone cannot measure holding exposure.</p></details>
    </>}
    {!points.length&&<p className={cx("empty-note")}>No timestamped P&L supplied. Upload a read-only export; missing open P&L stays blank.</p>}
    <details><summary>Import P&L snapshots / inspect sources</summary><p>CSV columns: timestamp, account, currency, realised (cumulative session total). Optional: symbol, position, unrealised, equity. No brokerage password or trading permission is needed.</p>
      <label>Source timezone<input maxLength={80} value={timezone} onChange={e=>setTimezone(e.target.value)}/></label>
      <label>P&L CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try{if(file.size>2_000_000)throw new Error("Choose a CSV smaller than 2 MB.");const csv=await file.text();setPending({csv,name:file.name,points:parsePnlCsv(csv,timezone)});setStatus("");}catch(error){setStatus(error instanceof Error?error.message:"Could not read CSV.");}}}/></label>
      {pending&&<div><p>Preview: {selectedPnl.length} of {pending.points.length} snapshots match {day} in {session.timezone||"UTC"}. Other dates are excluded.</p><div className="table-scroll"><table><thead><tr><th>UTC</th><th>Account</th><th>Realised</th><th>Unrealised</th></tr></thead><tbody>{selectedPnl.slice(0,8).map((p,i)=><tr key={i}><td>{new Date(p.t).toISOString()}</td><td>{p.account}</td><td>{money(p.realised,p.currency)}</td><td>{p.unrealised===undefined?"Not supplied":money(p.unrealised,p.currency)}</td></tr>)}</tbody></table></div>
        <button className={cx("primary")} disabled={busy||!selectedPnl.length} onClick={async()=>{
          try { const id=crypto.randomUUID(),digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(pending.csv)),sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
            const pnl=[...new Map([...(data?.pnl||[]),...selectedPnl].map(p=>[`${p.t}:${p.account}:${p.currency}:${p.symbol}`,p])).values()];
            await keepPrivateFile(session.owner,id,"csv",new Blob([pending.csv],{type:"text/csv"}),session.id);
            if(await save({pnl,leaderAccount:leader||selectedPnl[0].account,imports:[...(data?.imports||[]),{id,filename:pending.name.slice(0,160),sha256,sourceTimezone:timezone,userTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone,importedAt:Date.now(),start:selectedPnl[0].t,end:selectedPnl.at(-1)!.t,account:"P&L snapshots",eventIds:[]}]}))setPending(undefined);
          }catch(e){setStatus(e instanceof Error?e.message:"Could not import.");}
        }}>Confirm P&L import</button></div>}
      {(data?.imports||[]).map(i=><div className={cx("source-row")} key={i.id}><b>{i.filename}</b><small>{i.sourceTimezone} → UTC · {new Date(i.importedAt).toLocaleString()} · SHA-256 {i.sha256.slice(0,12)}…</small><button className={cx("textlink")} onClick={()=>void sourceFile(i.id,i.filename)}>Download original</button><button className={cx("textlink")} onClick={()=>void sourceFile(i.id,i.filename,true)}>Delete original file</button></div>)}
      <button className={cx("textlink")} disabled={busy||!data?.pnl?.length} onClick={()=>void save({pnl:[]})}>Delete imported P&L snapshots</button>
      <p>Source files and raw audio are kept on the importing device. Session data and transcripts use your existing cloud sync. Direct Tradecopia streaming requires approved partner access.</p>
    </details><p role="status">{status}</p>
  </section>;
}
