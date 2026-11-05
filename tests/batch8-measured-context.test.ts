import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { measuredSampleAt } from "../src/lib/measured-sample";
import { RoutineAudio, StillnessBuilder } from "../src/components/personal-stillness";
import { keepRoutineAudio } from "../src/lib/private-files";
test("nearby HR never crosses a pause, uses an artifact, or fills an unobserved gap",()=>{
  const sample={t:1000,bpm:78,provider:"garmin" as const};
  assert.equal(measuredSampleAt([sample],2500,[{start:2000,end:3000}]),null);
  assert.equal(measuredSampleAt([sample],3500,[{start:2000,end:3000}]),null);
  assert.equal(measuredSampleAt([{...sample,quality:"artifact"}],1000),null);
  assert.equal(measuredSampleAt([sample],20000),null);
  assert.equal(measuredSampleAt([sample],1500),sample);
});
function setup(){const dom=new JSDOM('<div id="root"></div>',{url:"https://still-signal.test"});for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{value,configurable:true});const root=createRoot(document.getElementById("root")!);return{root,dom,async close(){await act(async()=>root.unmount());dom.window.close();}};}
test("switching to missing personal audio removes the old recording instead of replaying it",async()=>{
  const ui=setup(),owner="batch8",path=await keepRoutineAudio(owner,new Blob(["saved message"],{type:"audio/webm"}));
  try{
    await act(async()=>ui.root.render(h(RoutineAudio,{owner,path})));
    await act(async()=>{await new Promise(r=>setTimeout(r,40));});
    assert.ok(document.querySelector("audio"));
    await act(async()=>ui.root.render(h(RoutineAudio,{owner,path:"local-audio:missing"})));
    await act(async()=>{await new Promise(r=>setTimeout(r,40));});
    assert.equal(document.querySelector("audio"),null);assert.match(document.body.textContent!,/unavailable/);
  }finally{await ui.close();}
});
test("pending microphone permission cannot start concurrent recordings and failed setup stops tracks",async()=>{
  const ui=setup();let requests=0,stopped=0,resolve!:(v:unknown)=>void;
  Object.defineProperty(globalThis,"navigator",{value:{mediaDevices:{getUserMedia(){requests++;return new Promise(r=>{resolve=r;});}}},configurable:true});
  Object.defineProperty(globalThis,"MediaRecorder",{value:class{constructor(){throw Error("Unsupported recording format");}},configurable:true});
  try{
    await act(async()=>ui.root.render(h(StillnessBuilder,{owner:"batch8",value:[],onChange(){}})));
    const button=[...document.querySelectorAll("button")].find(b=>b.textContent==="Record a message")!;
    await act(async()=>{button.click();button.click();});assert.equal(requests,1);
    await act(async()=>{resolve({getTracks(){return[{stop(){stopped++;}}];}});});
    assert.equal(stopped,1);assert.match(document.body.textContent!,/Unsupported recording format/);
  }finally{await ui.close();}
});
