import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import Missions, { MissionsPanel } from "../src/components/process-goals/workspace";
import MarketOutlook from "../src/components/command-center/market-outlook";
import { createRecord } from "../src/lib/process/model";
import { emptyThesis } from "../src/components/trading-thesis/workspace";
import type { Context } from "../src/components/command-center/shared";
const day = createRecord("day",{date:"2026-11-05",timezone:"UTC",status:"preparing",instrument:" es ",account:"",timeframes:["Daily","15M"],sessionIds:[],goal:""});
const goal=(name:string,start:string,end:string)=>createRecord("goal",{name,description:"",source:"manual",target:3,start,end,milestones:[]});
test("the daily mission reminder shows applicable periods and plain evidence language",()=>{
  const context={day,props:{onPage(){}},store:{records:[day,goal("Current practice","2026-11-01","2026-11-10"),goal("Past practice","2026-10-01","2026-10-31"),goal("Future practice","2026-12-01","2026-12-31")]}} as unknown as Context;
  const html=renderToStaticMarkup(h(MissionsPanel,context));
  assert.match(html,/Current practice/);assert.doesNotMatch(html,/Past practice|Future practice/);assert.match(html,/Your saved manual confirmations/);
});
test("an empty mission rule selector explains the gap and opens rule creation",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"https://still-signal.test"});
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{value,configurable:true});
  Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
  let destination="";const root=createRoot(document.getElementById("root")!);
  const context={day,props:{pulse:{owner:"batch7"},onPage(value:string){destination=value;}},store:{records:[day],busy:false}} as unknown as Context;
  try{
    await act(async()=>root.render(h(Missions,context)));
    await act(async()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Create mission")!.click());
    assert.match(document.body.textContent!,/No rules yet/);
    await act(async()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Create my first rule")!.click());
    assert.equal(destination,"Trade Quality");
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
test("market outlook uses normalized instrument scope and keeps chart scope distinct from daily plan",()=>{
  const plan=createRecord("thesis",{...emptyThesis(day,"daily"),instrument:"ES",bias:"bullish",timeframes:[{timeframe:"Daily",bias:"bearish"}]});
  const context={day,props:{onPage(){}},store:{records:[day,plan],busy:false}} as unknown as Context;
  const html=renderToStaticMarkup(h(MarketOutlook,context));
  assert.match(html,/Daily bias/);assert.match(html,/Daily chart bias/);assert.match(html,/bullish/);assert.match(html,/2026-11-05/);
});
