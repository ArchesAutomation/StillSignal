import {test} from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {act,createElement,useState} from "react";
import {createRoot} from "react-dom/client";
import JournalSelect from "../src/components/concept/journal-select";
test("journal dropdown supports keyboard selection, native change handlers, Escape and outside dismissal",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"});
  const names=["window","document","navigator","HTMLElement","IS_REACT_ACT_ENVIRONMENT"],originals=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const root=createRoot(document.getElementById("root")!);
  function Harness(){const[value,setValue]=useState("");return createElement(JournalSelect,{"aria-label":"Filter stage",value,onChange:e=>setValue(e.target.value)},createElement("option",{value:""},"All stages"),createElement("option",{value:"entry"},"Entry"),createElement("option",{value:"management"},"Management"));}
  try{
    await act(async()=>root.render(createElement(Harness)));
    const trigger=document.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    const key=async(k:string)=>act(async()=>trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:k,bubbles:true,cancelable:true})));
    await key("ArrowDown");assert.equal(document.querySelectorAll('[role="option"]').length,3);
    await key("ArrowDown");await key("Enter");
    assert.equal(document.querySelector("select")!.value,"entry");assert.match(trigger.textContent!,/Entry/);assert.equal(trigger.getAttribute("aria-expanded"),"false");
    await act(async()=>trigger.click());assert.equal(trigger.getAttribute("aria-expanded"),"true");
    await key("Escape");assert.equal(document.querySelector('[role="listbox"]'),null);
    await act(async()=>trigger.click());await act(async()=>document.body.dispatchEvent(new dom.window.Event("pointerdown",{bubbles:true})));assert.equal(document.querySelector('[role="listbox"]'),null);
    await key("m");await key("Enter");assert.equal(document.querySelector("select")!.value,"management");
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of originals){if(value)Object.defineProperty(globalThis,name,value);else Reflect.deleteProperty(globalThis,name);}}
});
