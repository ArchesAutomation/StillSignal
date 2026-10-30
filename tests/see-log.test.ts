import {test} from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import JournalSpace from "../src/components/concept/journal-space";
import {reviewFixtures} from "../src/lib/staging-fixtures";
import {sessionTrades} from "../src/lib/journal-routing";
import {defaults,type JournalEntry} from "../src/lib/model";
import type {Props,Moment} from "../src/components/concept/shared";
test("See log highlights every matching moment without hiding other trades or stages, including an empty stage",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"});
  const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),cancelAnimationFrame:(id:number)=>clearTimeout(id),IS_REACT_ACT_ENVIRONMENT:true};
  const originals=new Map(Object.keys(values).map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  for(const[name,value]of Object.entries(values))Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  const scrolled:string[]=[];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolled.push(this.id);};
  const root=createRoot(document.getElementById("root")!);
  try{
    const fixture=reviewFixtures(),trades=sessionTrades(fixture.session);
    const note=(id:string,section:JournalEntry["section"],tradeId?:string):JournalEntry=>({id,t:fixture.session.startedAt+1000,label:"Unlabelled",text:id,section,tradeId,captureMode:"live"});
    const session={...fixture.session,journal:[note("match-1","entry",trades[0].id),note("match-2","entry",trades[0].id),note("other-trade","entry",trades[1].id),note("other-stage","exit",trades[0].id),note("session-note",undefined)]};
    const props={session,history:[],threshold:12,pulse:{history:[],now:session.endedAt,settings:defaults,saveJournalNote:async()=>{},addNote:async()=>{},updateBlueprint:async()=>{},prepareScreenshot:async()=>session.id},onReflect(){},onPage(){}} as unknown as Props;
    async function render(section:JournalEntry["section"],selected:Moment|null=null){await act(async()=>root.render(createElement(JournalSpace,{props,session,samples:[],selected,reveal:{section,tradeId:trades[0].id},timezone:"UTC",onSelect(){},onReview(){}})));await act(async()=>new Promise(r=>setTimeout(r,5)));}
    await render("entry");
    assert.equal(document.querySelectorAll('[data-note-id]').length,5);
    assert.deepEqual([...document.querySelectorAll('.ss-space-selected')].map(n=>n.getAttribute('data-note-id')),["match-1","match-2"]);
    assert.equal(document.querySelector<HTMLSelectElement>('[aria-label="Filter trade"]')!.value,"");
    assert.equal(document.querySelector<HTMLSelectElement>('[aria-label="Filter stage"]')!.value,"");
    assert.ok(scrolled.includes("moment-match-1"));
    await render("management");
    assert.equal(document.querySelectorAll('[data-note-id]').length,5);
    assert.equal(document.querySelectorAll('.ss-space-selected').length,0);
    assert.match(document.querySelector('.ss-log-highlight-notice')!.textContent!,/No saved management moments/);
    const source=session.journal.at(-1)!;
    await render("before",{id:source.id,t:source.t,phase:"BEFORE",label:source.label,text:source.text,note:source,bpm:null});
    assert.equal(document.querySelectorAll('[data-note-id]').length,5);
    assert.equal(document.querySelector('.ss-space-selected')?.getAttribute('data-note-id'),source.id);
    assert.match(document.querySelector<HTMLElement>('.ss-space-selected')!.style.boxShadow,/#72b7ff|114, 183, 255/);
    assert.equal(source.section,undefined,"highlighting a chart source must not assign an unknown stage");
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of originals){if(value)Object.defineProperty(globalThis,name,value);else Reflect.deleteProperty(globalThis,name);}}
});
