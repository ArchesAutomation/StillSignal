"use client";
import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { phaseColors } from "@/lib/phase-colors";

function text(node:ReactNode):string {
  return Children.toArray(node).map(item=>isValidElement<{children?:ReactNode}>(item)?text(item.props.children):String(item)).join("");
}
function optionsOf(children:ReactNode):{value:string;label:string;disabled:boolean}[] {
  return Children.toArray(children).flatMap(child=>{
    if(!isValidElement<{value?:string|number;children?:ReactNode;disabled?:boolean}>(child))return [];
    if(child.type!=="option")return optionsOf(child.props.children);
    const label=text(child.props.children).replace(/\s+/g," ").trim();
    return [{value:String(child.props.value??label),label,disabled:!!child.props.disabled}];
  });
}

/** A styled, keyboard-accessible control backed by the existing native form contract. */
export default function JournalSelect(props:SelectHTMLAttributes<HTMLSelectElement>) {
  const {children,value,disabled}=props;
  const id=useId(), native=useRef<HTMLSelectElement>(null), trigger=useRef<HTMLButtonElement>(null), menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false), [active,setActive]=useState(0), [position,setPosition]=useState<CSSProperties>({});
  const typeahead=useRef({text:"",at:0});
  const options=optionsOf(children), selected=options.findIndex(o=>o.value===String(value??""));
  const label=props["aria-label"] || "Choose an option";
  const kind=/trade/i.test(label)?"Trade":/stage|section/i.test(label)?"Stage":/capture/i.test(label)?"Capture":/timezone/i.test(label)?"Timezone":"Choose";
  function show(index=selected<0?0:selected) {
    if(disabled || !trigger.current)return;
    const rect=trigger.current.getBoundingClientRect(),width=Math.min(Math.max(rect.width,kind==="Trade"?250:215),window.innerWidth-24);
    const below=window.innerHeight-rect.bottom,above=rect.top,up=below<Math.min(310,options.length*38+40) && above>below;
    setPosition({position:"fixed",left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),width,...(up?{bottom:window.innerHeight-rect.top+7}:{top:rect.bottom+7}),maxHeight:Math.max(120,Math.min(360,(up?above:below)-18))});
    setActive(index);setOpen(true);
  }
  function choose(index:number) {
    const option=options[index];if(!option || option.disabled || !native.current)return;
    native.current.value=option.value;
    native.current.dispatchEvent(new native.current.ownerDocument.defaultView!.Event("change",{bubbles:true}));
    setOpen(false);trigger.current?.focus();
  }
  useEffect(()=>{
    if(!open)return;
    const doc=trigger.current!.ownerDocument;
    const outside=(e:PointerEvent)=>{const target=e.target as Node;if(!trigger.current?.contains(target) && !menu.current?.contains(target))setOpen(false);};
    const scroll=(e:Event)=>{if(!menu.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);trigger.current?.focus();}};
    doc.addEventListener("pointerdown",outside);doc.addEventListener("keydown",escape);doc.addEventListener("scroll",scroll,true);window.addEventListener("resize",scroll);
    return()=>{doc.removeEventListener("pointerdown",outside);doc.removeEventListener("keydown",escape);doc.removeEventListener("scroll",scroll,true);window.removeEventListener("resize",scroll);};
  },[open]);
  useEffect(()=>{if(open)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:"nearest"});},[active,open,id]);
  return <span className={`ss-journal-select ${open?"ss-select-open":""} ${props.className||""}`}>
    <select {...props} ref={native} hidden aria-hidden="true" tabIndex={-1}/>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-menu`} aria-haspopup="listbox" aria-activedescendant={open?`${id}-option-${active}`:undefined} disabled={disabled} className="ss-select-trigger" onClick={()=>open?setOpen(false):show()} onKeyDown={e=>{
      if(e.key==="Tab"){setOpen(false);return;}
      if(e.key==="Escape"){e.preventDefault();setOpen(false);return;}
      if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){
        e.preventDefault();const next=e.key==="Home"?0:e.key==="End"?options.length-1:open?(active+(e.key==="ArrowDown"?1:-1)+options.length)%options.length:Math.max(0,selected);
        if(open)setActive(next);else show(next);return;
      }
      if(e.key==="Enter" || e.key===" "){e.preventDefault();if(open)choose(active);else show();return;}
      if(e.key.length===1 && !e.ctrlKey && !e.metaKey){const now=Date.now();typeahead.current={text:(now-typeahead.current.at<700?typeahead.current.text:"")+e.key.toLowerCase(),at:now};const found=options.findIndex(o=>o.label.toLowerCase().startsWith(typeahead.current.text));if(found>=0){e.preventDefault();if(open)setActive(found);else show(found);}}
    }}>
      <span className="ss-select-leading" aria-hidden="true">{kind==="Stage" && phaseColors[String(value)]?<i style={{background:phaseColors[String(value)]}}/>:<svg viewBox="0 0 16 16" fill="none"><path d={kind==="Trade"?"M3 4h10M3 8h7M3 12h4":kind==="Capture"?"M8 3v5l3 2M13 8A5 5 0 1 1 8 3":"M3 4h10M3 8h10M3 12h10"} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}</span>
      <span className="ss-select-value">{options[selected]?.label || "Choose…"}</span>
      <svg className="ss-select-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    {open && createPortal(<div ref={menu} className="ss-journal-select-menu" style={position}>
      <div className="ss-select-menu-heading">{kind}<span>{options.length} options</span></div>
      <div className="ss-select-options" role="listbox" id={`${id}-menu`} aria-label={`${label} options`}>
        {options.map((option,index)=><div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value===String(value??"")} aria-disabled={option.disabled} className={`ss-select-option ${index===active?"ss-select-option-active":""} ${option.value===String(value??"")?"ss-select-option-selected":""}`} onPointerMove={()=>setActive(index)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(index)}>
          <span className="ss-option-symbol" aria-hidden="true">{kind==="Stage" && phaseColors[option.value]?<i style={{background:phaseColors[option.value]}}/>:kind==="Trade" && option.value && option.value!=="session"?<span className="ss-option-trade">{index}</span>:<i/>}</span>
          <span>{option.label}</span>
          {option.value===String(value??"") && <svg className="ss-option-check" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>)}
      </div>
    </div>,trigger.current?.closest("dialog[open]") || document.body)}
  </span>;
}
