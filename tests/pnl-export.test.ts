import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session,TradeEvent } from "../src/lib/model";
import { snapshotTrades,paintSnapshot,type SnapshotOptions } from "../src/lib/pnl-export";
function trade(id:string,currency:string|undefined,pnl:number|undefined,at=Date.parse("2026-11-02T18:00:00Z")):TradeEvent[]{return[{id:id+"in",t:at,symbol:id,kind:"entry",side:"long",quantity:1,price:100,source:"manual",provenance:"execution",currency},{id:id+"out",t:at+1000,symbol:id,kind:"exit",side:"long",quantity:1,price:110,source:"manual",provenance:"execution",currency,pnl}];}
const session=(events:TradeEvent[],owner="owner"):Session=>({id:crypto.randomUUID(),name:"Private account",owner,startedAt:Date.parse("2026-11-01T00:00:00Z"),source:"csv",events,journal:[],sampleCount:0});
test("snapshot scope isolates owner, closing dates and currencies without inventing missing values",()=>{
 const records=[session([...trade("USD","USD",12),...trade("EUR","EUR",8),...trade("missing",undefined,7),...trade("unknown-pnl","USD",undefined),...trade("outside","USD",999,Date.parse("2026-10-01T12:00Z"))]),session(trade("other","USD",900),"another-owner")];
 const rows=snapshotTrades(records,"owner","2026-11-02","2026-11-02","America/Denver");
 assert.equal(rows.length,4);const complete=rows.filter(r=>r.complete&&r.currency);assert.equal(complete.length,2);
 assert.equal(complete.find(r=>r.currency==="USD")!.pnl,12);assert.equal(complete.find(r=>r.currency==="EUR")!.pnl,8);
 assert.equal(rows.find(r=>r.symbol==="missing")!.currency,"");assert.equal(rows.find(r=>r.symbol==="unknown-pnl")!.complete,false);
 assert.equal(snapshotTrades(records,"owner","2026-11-03","2026-11-01","UTC").length,0);
});
test("a partial exit with missing realised P&L cannot become an apparently complete exported position",()=>{
 const [entry,exit]=trade("partial","USD",10);entry.quantity=2;const final={...exit,id:"last-exit",t:exit.t+1000,pnl:undefined};
 const rows=snapshotTrades([session([entry,exit,final])],"owner","2026-11-02","2026-11-02","UTC");assert.equal(rows.length,1);assert.equal(rows[0].pnl,10);assert.equal(rows[0].complete,false);
 assert.equal(snapshotTrades([session([entry,exit])],"owner","2026-11-02","2026-11-02","UTC").length,0);
});
test("privacy switches remove dates, symbols, counts and captions from drawn output",()=>{
 const text:string[]=[];const ctx={createLinearGradient(){return{addColorStop(){}};},fillRect(){},beginPath(){},roundRect(){},fill(){},stroke(){},measureText(v:string){return{width:v.length*10};},fillText(v:string){text.push(v);}} as unknown as CanvasRenderingContext2D;
 const options:SnapshotOptions={currency:"USD",total:83,complete:true,count:2,start:"2026-11-02",end:"2026-11-03",timezone:"America/Denver",showDate:false,showTimezone:false,showCount:false,showSymbols:false,symbols:["SECRET_SYMBOL"],caption:"",style:"ocean"};
 paintSnapshot(ctx,options);assert.ok(text.includes("$83.00"));assert.doesNotMatch(text.join(" "),/2026|Denver|SECRET_SYMBOL|2 closed/);
 text.length=0;paintSnapshot(ctx,{...options,showDate:true,showCount:true,showSymbols:true,caption:"My caption"});assert.match(text.join(" "),/2026-11-02 → 2026-11-03/);assert.match(text.join(" "),/My caption/);
});
