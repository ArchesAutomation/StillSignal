import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import FocusedRun from "../src/components/pre-market/focused-run";
import PreparationSummary from "../src/components/pre-market/preparation-summary";
import StepSettings from "../src/components/pre-market/step-settings";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";
import { starterProfile } from "../src/lib/process/journal-guide";
import { emptyThesis } from "../src/components/trading-thesis/workspace";
import type { Context } from "../src/components/command-center/shared";

function fixture() {
  const day=createRecord("day",{date:"2026-11-03",timezone:"UTC",status:"preparing",instrument:"ES",account:"",timeframes:[],sessionIds:[],goal:""});
  const prompt={id:crypto.randomUUID(),label:"Can I wait for my setup?",type:"boolean" as const,required:false,choices:[]};
  const step={id:crypto.randomUUID(),name:"Reflect",description:"",category:"Preparation",requirement:"optional" as const,condition:"",verification:"manual" as const,window:"",order:0,activity:"custom" as const,allowReflectionSkip:true,prompts:[prompt],checklist:["Keep my risk limit"],checklistMode:"reminder" as const};
  const later={...step,id:crypto.randomUUID(),name:"Monday only",order:1,cadence:"weekdays" as const,weekdays:[1],checklist:[],prompts:[]};
  const profile={...starterProfile(),perspective:"Follow my long-term process"};
  const template=createRecord("protocol",{name:"Routine",description:"",instrument:"ES",strategy:"",session:"",steps:[step,later],profile});
  const run=createRecord("run",{dayId:day.rootId,templateId:template.id,steps:template.body.steps,startedAt:Date.now()});
  const records:ProcessRecord[]=[day,template,run];
  const context={day,props:{pulse:{owner:"batch6"},onPage(){}},store:{records,loaded:true,busy:false,error:"",setError(){},async save(batch:ProcessRecord[]){records.push(...batch);return true;}}} as unknown as Context;
  return {day,prompt,step,later,template,run,records,context};
}
function setup() {
  const dom=new JSDOM('<div id="root"></div>',{url:"https://still-signal.test"});
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})) Object.defineProperty(globalThis,key,{value,configurable:true});
  Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){},scrollIntoView(){}});
  const root=createRoot(document.getElementById("root")!);
  return {dom,root,async close(){await act(async()=>root.unmount());dom.window.close();}};
}

test("the last scheduled section gives one reminder even when the final configured section is not due",async()=>{
  const f=fixture(), ui=setup();
  localStorage.setItem(`ss-guide-run:batch6:${f.run.id}`,JSON.stringify({selected:f.step.id,page:3,answers:{},reminders:[]}));
  try {
    await act(async()=>ui.root.render(h(FocusedRun,{context:f.context,run:f.run})));
    const save=[...document.querySelectorAll("button")].find(b=>b.textContent?.includes("Save section & continue"))!;
    await act(async()=>save.click());
    assert.match(document.body.textContent!,/one reminder near the end/);
    assert.equal(f.records.filter(r=>r.kind==="response").length,0);
    const skip=[...document.querySelectorAll("button")].find(b=>b.textContent?.includes("Skip unanswered reflections & save"))!;
    await act(async()=>skip.click());
    assert.equal(f.records.filter(r=>r.kind==="response").length,1);
    assert.equal(JSON.parse(localStorage.getItem(`ss-guide-run:batch6:${f.run.id}`)!).reminders.length,1);
  } finally {await ui.close();}
});

test("today's reference retains risk reminders and perspective without retired market plans",()=>{
  const f=fixture();
  const weekly=createRecord("thesis",{...emptyThesis(f.day,"weekly"),primary:"Weekly ES context"});
  const other=createRecord("thesis",{...emptyThesis(f.day,"weekly"),instrument:"NQ",primary:"Unrelated NQ plan"});
  f.run.body.steps[0]={...f.run.body.steps[0],activity:"checklist"};
  f.records.push(weekly,other);
  const html=renderToStaticMarkup(h(PreparationSummary,f.context));
  assert.doesNotMatch(html,/Weekly ES context/);
  assert.doesNotMatch(html,/Unrelated NQ plan/);
  assert.match(html,/Keep my risk limit/);
  assert.match(html,/Follow my long-term process/);
});

test("reference edits preserve the pinned yes/no answer control",async()=>{
  const f=fixture(),ui=setup();
  f.records.push(createRecord("response",{runId:f.run.id,stepId:f.step.id,status:"complete",method:"manual",reason:"",answers:[{id:f.prompt.id,value:"yes"}]}));
  try {
    await act(async()=>ui.root.render(h(PreparationSummary,f.context)));
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Edit can i wait for my setup?"]')!.click());
    const select=document.querySelector<HTMLSelectElement>(".guide-summary-item form select");
    assert.ok(select,"a typed response must not become an unrestricted textarea");
    assert.equal(select.value,"yes");
  } finally {await ui.close();}
});

test("routine questions offer yes/no/custom and a separate optional written follow-up without changing saved schemas",async()=>{
  const f=fixture(),ui=setup(); let step=f.step;
  const render=()=>h(StepSettings,{step,context:f.context,onChange(patch){step={...step,...patch} as typeof step;}});
  try {
    await act(async()=>ui.root.render(render()));
    const select=[...document.querySelectorAll("select")].find(s=>[...s.options].some(o=>o.value==="yes-no-custom"));
    assert.ok(select,"the combined answer format is discoverable");
    await act(async()=>{select.value="yes-no-custom";select.dispatchEvent(new ui.dom.window.Event("change",{bubbles:true}));});
    assert.equal(step.prompts[0].type,"choice");
    assert.deepEqual(step.prompts[0].choices,["Yes","No","Custom"]);
    await act(async()=>ui.root.render(render()));
    const add=[...document.querySelectorAll("button")].find(b=>b.textContent?.includes("Add optional elaboration"))!;
    await act(async()=>add.click());
    assert.equal(step.prompts.length,2);
    assert.equal(step.prompts[1].type,"text");
    assert.equal(step.prompts[1].required,false);
    assert.notEqual(step.prompts[0].id,step.prompts[1].id);
  } finally {await ui.close();}
});
