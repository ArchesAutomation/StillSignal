"use client";
import { createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Plus, RotateCcw, Undo2, Redo2, MoveDiagonal2, Settings2, X, EyeOff } from "lucide-react";
import { emptyModuleLayout, moduleLayoutKey, readModuleLayout, boundModuleBox, type ModuleLayout, type ModulePlacement, type ModuleBox } from "@/lib/module-layout";

import { moduleBoard, modulePlacement, materializeBoard, placeModule, availableModuleBox } from "@/lib/module-board";

export type ModulePart = { id: string; title: string; selector: string };
type Definition = { id: string; title: string; section: string; order: number; width: number; initiallyHidden: boolean; parts: ModulePart[]; host: HTMLDivElement };
type Registry = { register: (module: Definition) => () => void; editing: boolean; placement: (module: Definition) => ModulePlacement; change: (id: string, patch: Partial<ModulePlacement>) => void; drag: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void; dragging: boolean; resize: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void; resizeKey: (id: string, key: string) => void; moveKey: (id: string, key: string, large: boolean) => void };
const Context = createContext<Registry | null>(null);
const noParts: ModulePart[] = [];
export function ModuleScope({ active, children }: { active: boolean; children: ReactNode }) {
  const context = useContext(Context);
  return <Context.Provider value={active ? context : null}>{children}</Context.Provider>;
}

/** Each portal has one stable host. Keeping that host on the board
 * preserves React state, focus, recordings and unsaved writing inside the module. */
export function WorkspaceModule({ id, title, section = "main", order = 10, width = 12, initiallyHidden = false, parts = noParts, children }: {
  id: string; title: string; section?: string; order?: number; width?: number; initiallyHidden?: boolean; parts?: ModulePart[]; children: ReactNode;
}) {
  const inherited = useContext(Context);
  const ctx = isValidElement<{ hidden?: boolean }>(children) && children.props.hidden === true ? null : inherited;
  const [host, setHost] = useState<HTMLDivElement>();
  const [options, setOptions] = useState(false);
  const [activated, setActivated] = useState(!initiallyHidden);
  useEffect(() => { if (ctx) setHost(document.createElement("div")); }, [!!ctx]);
  const register = ctx?.register;
  const signature = JSON.stringify(parts);
  useLayoutEffect(() => {
    if (!host || !register) return;
    return register({ id, title, section, order, width, initiallyHidden, parts: JSON.parse(signature), host });
  }, [host, register, id, title, section, order, width, initiallyHidden, signature]);
  const definition = host && { id, title, section, order, width, initiallyHidden, parts, host };
  const placement = ctx && definition ? ctx.placement(definition) : undefined;
  useEffect(() => { if (placement && !placement.hidden) setActivated(true); }, [placement?.hidden]);
  useLayoutEffect(() => {
    if (!host || !placement) return;
    host.className = `ss-workspace-module${ctx?.editing ? " ss-module-editing" : ""}${placement.compact ? " ss-module-compact" : ""}`;
    host.dataset.moduleId = id;

  }, [host, id, ctx?.editing, placement?.width, placement?.height, placement?.compact]);
  useLayoutEffect(() => {
    if (!host || !placement) return;
    const restores: (() => void)[] = [];
    if (placement.title && placement.title !== title) {
      const heading = host.querySelector<HTMLElement>(".ss-module-content h1,.ss-module-content h2,.ss-module-content h3");
      if (heading) { const display = heading.style.display; heading.style.display = "none"; restores.push(() => { heading.style.display = display; }); }
    }
    for (const part of parts) for (const node of host.querySelectorAll<HTMLElement>(part.selector)) {
      const display = node.style.display;
      if (placement.hiddenParts?.includes(part.id)) node.style.display = "none";
      restores.push(() => { node.style.display = display; });
    }
    return () => restores.forEach(fn => fn());
  }, [host, activated, signature, JSON.stringify(placement?.hiddenParts), placement?.title, title, children]);
  if (!ctx) return initiallyHidden ? null : <>{children}</>;
  if (!host || !placement) return null;
  if (!activated) return null;
  return createPortal(<>
    {ctx.editing && <div className="ss-module-controls" role="group" aria-label={`${title} module controls`}>
      <button className="ss-module-grip" aria-label={`Drag ${title} module`} onPointerDown={event => ctx.drag(event, id)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); ctx.moveKey(id, event.key, event.shiftKey); } }} title="Drag anywhere. Arrow keys move; Shift moves further."><GripVertical size={16} /><span>{placement.title || title}</span></button>
      <button aria-label={`Edit inside ${title}`} disabled={ctx.dragging} onClick={() => setOptions(v => !v)} aria-expanded={options}><Settings2 size={15} /></button>
      <button aria-label={`Hide ${title} module`} disabled={ctx.dragging} onClick={() => ctx.change(id, { hidden: true })}><EyeOff size={15} /></button>
    </div>}
    {ctx.editing && options && <fieldset className="ss-module-options" disabled={ctx.dragging}>
      <legend>Customize {title}</legend>
      <label>Module title<input maxLength={80} value={placement.title ?? title} onChange={event => ctx.change(id, { title: event.target.value })} /></label>
      <label>Width<input aria-label={`Width for ${title}`} type="number" min={180} max={1200} value={placement.box?.w ?? placement.width * 100} onChange={event => ctx.change(id, { box: boundModuleBox({ ...(placement.box ?? {x:0,y:0,w:384,h:300}), w: +event.target.value }) })} /></label>
      <label>Horizontal position<input aria-label={`Horizontal position for ${title}`} type="number" min={0} max={1200} value={placement.box?.x ?? 0} onChange={event => ctx.change(id, { box: boundModuleBox({ ...(placement.box ?? {x:0,y:0,w:384,h:300}), x: +event.target.value }) })} /></label>
      <label>Vertical position<input aria-label={`Vertical position for ${title}`} type="number" min={0} max={50000} value={placement.box?.y ?? 0} onChange={event => ctx.change(id, { box: boundModuleBox({ ...(placement.box ?? {x:0,y:0,w:384,h:300}), y: +event.target.value }) })} /></label>
      <label>Height<input aria-label={`Height for ${title}`} type="number" min={120} max={2400} value={placement.height ?? placement.box?.h ?? 300} onChange={event => { if (event.target.value) ctx.change(id, { box: boundModuleBox({ ...(placement.box ?? {x:0,y:0,w:384,h:300}), h: +event.target.value }) }); }} /></label>
      <label><input type="checkbox" checked={placement.compact ?? false} onChange={event => ctx.change(id, { compact: event.target.checked })} /> Compact spacing</label>
      {!!parts.length && <div className="ss-module-parts"><strong>Inside this module</strong>{parts.map(part => <label key={part.id}><input type="checkbox" checked={!placement.hiddenParts?.includes(part.id)} onChange={event => ctx.change(id, { hiddenParts: event.target.checked ? placement.hiddenParts?.filter(value => value !== part.id) : [...(placement.hiddenParts || []), part.id] })} />{part.title}</label>)}</div>}
      <button type="button" onClick={() => setOptions(false)}>Done</button>
    </fieldset>}
    {placement.title && placement.title !== title && <h2 className="ss-module-custom-title">{placement.title}</h2>}
    <div className="ss-module-content">{children}</div>
    {ctx.editing && <button className="ss-module-resize" aria-label={`Resize ${title}`} title="Drag to resize. Arrow keys adjust width and height; Home fits the content." onPointerDown={event => ctx.resize(event, id)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) { event.preventDefault(); ctx.resizeKey(id, event.key); } }}><MoveDiagonal2 size={16} /></button>}
  </>, host, id);
}


export default function ModuleWorkspace({ owner, page, enabled = true, children }: { owner: string; page: string; enabled?: boolean; children: ReactNode }) {
  const [modules, setModules] = useState<Definition[]>([]);
  const [saved, setSaved] = useState<ModuleLayout>(emptyModuleLayout), [draft, setDraft] = useState<ModuleLayout>(emptyModuleLayout);
  const [editing, setEditing] = useState(false), [library, setLibrary] = useState(false), [search, setSearch] = useState("");
  const [undo, setUndo] = useState<ModuleLayout[]>([]), [redo, setRedo] = useState<ModuleLayout[]>([]);
  const [message, setMessage] = useState(""), [dragging, setDragging] = useState(false), [heights, setHeights] = useState<Record<string, number>>({});
  const canvas = useRef<HTMLDivElement>(null), parking = useRef<HTMLDivElement>(null), libraryPanel = useRef<HTMLElement>(null);
  const pendingCustom = useRef<string | undefined>(undefined);
  const current = editing ? draft : saved, key = moduleLayoutKey(owner, page);
  const boxes = moduleBoard(current, modules, heights);
  const latest = useRef({ current, modules, boxes, editing, key }); latest.current = { current, modules, boxes, editing, key };
  type Gesture = { mode: "move" | "resize" | "library" | "panel"; id: string; pointer: number; handle: HTMLButtonElement; host: HTMLElement; x: number; y: number; scroll: number; scroller?: HTMLElement; width: number; start: ModuleBox; next: ModuleBox; base: ModuleLayout; key: string; moved: boolean; left?: number; top?: number };
  const gesture = useRef<Gesture | null>(null);
  const register = useCallback((module: Definition) => {
    setModules(old => [...old.filter(m => m.id !== module.id), module]);
    return () => { module.host.remove(); setModules(old => old.filter(m => m.host !== module.host)); };
  }, []);
  const resolved = () => materializeBoard(latest.current.current, latest.current.modules, latest.current.boxes);
  const commit = (next: ModuleLayout, announcement = "") => {
    const previous = latest.current.current;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    setUndo(rows => [...rows.slice(-39), previous]); setRedo([]);
    latest.current.current = next; setDraft(next); setMessage(announcement);
  };
  const cancelGesture = () => {
    const g = gesture.current; gesture.current = null;
    if (g) {
      if (g.mode === "library") g.host.remove();
      else if (g.mode !== "panel") {
        g.host.style.transform = ""; g.host.style.width = g.start.w / 12 + "%";
        const placement = latest.current.current.modules[g.id];
        g.host.style.height = placement?.height || placement?.box ? g.start.h + "px" : "";
        g.host.classList.remove("ss-module-held");
      }
      if (g.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
    }
    setDragging(false);
  };
  useEffect(() => {
    cancelGesture();
    let value = emptyModuleLayout();
    try { value = readModuleLayout(localStorage.getItem(key)); } catch { /* Optional storage. */ }
    setSaved(value); setDraft(value); setEditing(false); setLibrary(false); setUndo([]); setRedo([]); setMessage(""); setHeights({});
  }, [key]);
  const placement = (module: Definition): ModulePlacement => ({ ...modulePlacement(current, module), box: boxes[module.id] ?? modulePlacement(current, module).box });
  const ordered = modules.filter(m => !modulePlacement(current, m).hidden).sort((a, b) => (boxes[a.id]?.y ?? 0) - (boxes[b.id]?.y ?? 0) || (boxes[a.id]?.x ?? 0) - (boxes[b.id]?.x ?? 0));
  useLayoutEffect(() => {
    const board = canvas.current; if (!board || !enabled) return;
    const active = document.activeElement as HTMLElement | null;
    const field = active instanceof window.HTMLInputElement || active instanceof window.HTMLTextAreaElement ? active : null;
    const selection = field ? [field.selectionStart, field.selectionEnd] : null;
    ordered.forEach((module, index) => {
      if (board.children[index] !== module.host) board.insertBefore(module.host, board.children[index] ?? null);
      const box = boxes[module.id], raw = modulePlacement(current, module); if (!box) return;
      Object.assign(module.host.style, { left: box.x / 12 + "%", top: box.y + "px", width: box.w / 12 + "%", height: raw.box || raw.height ? box.h + "px" : "" });
      module.host.classList.toggle("ss-module-sized", !!raw.box || !!raw.height);
    });
    for (const module of modules) if (modulePlacement(current, module).hidden && module.host.parentElement !== parking.current) parking.current?.appendChild(module.host);
    if (active?.isConnected && document.activeElement !== active && !active.closest("[hidden],[inert]")) {
      active.focus({ preventScroll: true });
      if (field && selection?.[0] != null && selection[1] != null) field.setSelectionRange(selection[0], selection[1]);
    }
  }, [current, modules, enabled, editing, JSON.stringify(boxes)]);
  useEffect(() => {
    const module = modules.find(m => m.id === pendingCustom.current);
    if (!module || !editing) return;
    pendingCustom.current = undefined;
    module.host.scrollIntoView?.({ block: "center", behavior: "instant" });
    module.host.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, [modules, editing]);
  useLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      if (gesture.current) return;
      setHeights(old => {
        const next = { ...old }; let changed = false;
        for (const entry of entries) {
          const host = entry.target as HTMLElement, id = host.dataset.moduleId;
          if (!id || latest.current.current.modules[id]?.box || latest.current.current.modules[id]?.height) continue;
          const height = Math.ceil(host.getBoundingClientRect().height);
          if (height > 0 && next[id] !== height) { next[id] = height; changed = true; }
        }
        return changed ? next : old;
      });
    });
    modules.forEach(m => observer.observe(m.host));
    return () => observer.disconnect();
  }, [modules, enabled, editing]);
  const viewportTop = () => Math.max(0, -(canvas.current?.getBoundingClientRect().top ?? 0) + 40);
  function addModule(id: string, at?: ModuleBox) {
    const value = resolved(), module = modules.find(m => m.id === id); if (!module) return;
    const p = modulePlacement(value, module), box = at ?? availableModuleBox(latest.current.boxes, viewportTop(), p.box);
    value.modules[id] = p;
    commit(placeModule(value, id, box), "Module added to your board. Drag it anywhere.");
  }
  function change(id: string, patch: Partial<ModulePlacement>) {
    const value = resolved(), old = value.modules[id]; if (!old) return;
    value.modules[id] = { ...old, ...patch };
    if (patch.box) value.modules[id] = { ...value.modules[id], box: boundModuleBox(patch.box), height: patch.box.h };
    commit(value);
  }
  function moveKey(id: string, key: string, resize = false, large = false) {
    const value = resolved(), start = latest.current.boxes[id]; if (!start) return;
    if (key === "Home" && resize) {
      const host = modules.find(m => m.id === id)?.host;
      const content = host?.querySelector<HTMLElement>(".ss-module-content");
      commit(placeModule(value, id, { ...start, h: (content?.scrollHeight ?? 260) + 64 }), "Module fitted to its content."); return;
    }
    const step = large ? 48 : 12;
    const dx = key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0, dy = key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0;
    const next = resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy };
    commit(placeModule(value, id, next), resize ? "Module resized." : "Module moved.");
  }
  function startGesture(event: ReactPointerEvent<HTMLButtonElement>, id: string, mode: Gesture["mode"]) {
    if (event.button !== 0 || gesture.current) return;
    const board = canvas.current; if (!board) return;
    const module = modules.find(m => m.id === id);
    if (mode !== "panel" && !module) return;
    event.preventDefault(); event.currentTarget.focus();
    let host: HTMLElement = mode === "panel" ? libraryPanel.current! : module!.host;
    const start = latest.current.boxes[id] ?? latest.current.current.modules[id]?.box ?? { x: 0, y: 0, w: 384, h: 288 };
    if (mode === "library") {
      host = document.createElement("div"); host.className = "ss-module-library-ghost"; host.textContent = module!.title;
      Object.assign(host.style, { position: "fixed", left: event.clientX + "px", top: event.clientY + "px", pointerEvents: "none" }); document.body.appendChild(host);
    }
    let parent = board.parentElement, scroller: HTMLElement | undefined;
    while (parent && parent !== document.body) { if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) { scroller = parent; break; } parent = parent.parentElement; }
    const rect = host.getBoundingClientRect();
    gesture.current = { mode, id, host, handle: event.currentTarget, pointer: event.pointerId, x: event.clientX, y: event.clientY, scroll: scroller?.scrollTop ?? window.scrollY, scroller, width: board.getBoundingClientRect().width || 1200, start, next: start, base: resolved(), key, moved: false, left: rect.left, top: rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode !== "panel") { host.classList.add("ss-module-held"); setDragging(true); }
  }
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const g = gesture.current; if (!g || event.pointerId !== g.pointer) return;
      const dx = event.clientX - g.x, dy = event.clientY - g.y + (g.scroller?.scrollTop ?? window.scrollY) - g.scroll;
      if (Math.hypot(dx, dy) < 4 && !g.moved) return; g.moved = true;
      if (g.mode === "panel") {
        const left = Math.max(0, Math.min(window.innerWidth - g.host.offsetWidth, g.left! + dx)), top = Math.max(0, Math.min(window.innerHeight - 60, g.top! + event.clientY - g.y));
        Object.assign(g.host.style, { left: left + "px", top: top + "px", right: "auto", maxHeight: `calc(100dvh - ${top + 12}px)` }); return;
      }
      const snap = (n: number) => Math.round(n / 12) * 12;
      if (g.mode === "library") {
        g.host.style.transform = `translate(${dx}px,${event.clientY - g.y}px)`;
        const rect = canvas.current!.getBoundingClientRect();
        g.next = boundModuleBox({ ...g.start, x: snap((event.clientX - rect.left) * 1200 / g.width), y: snap(event.clientY - rect.top) });
      } else if (g.mode === "move") {
        g.next = boundModuleBox({ ...g.start, x: g.start.x + snap(dx * 1200 / g.width), y: g.start.y + snap(dy) });
        g.host.style.transform = `translate(${(g.next.x - g.start.x) * g.width / 1200}px,${g.next.y - g.start.y}px) scale(1.01)`;
      } else {
        g.next = boundModuleBox({ ...g.start, w: g.start.w + snap(dx * 1200 / g.width), h: g.start.h + snap(dy) });
        g.host.style.width = g.next.w / 12 + "%"; g.host.style.height = g.next.h + "px";
      }
      if (event.clientY > window.innerHeight - 45) { if (g.scroller) g.scroller.scrollTop += 16; else window.scrollBy(0, 16); }
      else if (event.clientY < 45) { if (g.scroller) g.scroller.scrollTop -= 16; else window.scrollBy(0, -16); }
    };
    const up = (event: PointerEvent) => {
      const g = gesture.current; if (!g || event.pointerId !== g.pointer) return;
      let valid = g.moved && g.key === latest.current.key;
      if (g.mode === "library") { const rect = canvas.current!.getBoundingClientRect(); valid = valid && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom; }
      cancelGesture();
      if (valid && g.mode !== "panel") commit(placeModule(g.base, g.id, g.next), "Module placed. Save layout to keep your board.");
    };
    const cancel = () => cancelGesture();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); cancelGesture(); setMessage("Move canceled."); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", key);
    return () => { cancelGesture(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", key); };
  }, []);
  const context: Registry = { register, editing, placement, change, dragging, drag: (event, id) => startGesture(event, id, "move"), resize: (event, id) => startGesture(event, id, "resize"), resizeKey: (id, key) => moveKey(id, key, true), moveKey: (id, key, large) => moveKey(id, key, false, large) };
  const boardHeight = Math.max(800, ...Object.values(boxes).map(b => b.y + b.h + (editing ? 600 : 24)));
  function createCustom() {
    const id = "custom-" + crypto.randomUUID(), value = resolved(), box = availableModuleBox(boxes, viewportTop());
    value.custom = [...(value.custom ?? []), { id, title: "My module", text: "" }];
    value.modules[id] = { section: value.sections[0].id, order: 10, width: 4, hidden: false, box, height: box.h };
    pendingCustom.current = id;
    commit(value, "Custom module created. Open its settings to name it, and write inside it.");
  }
  return <Context.Provider value={enabled ? context : null}><div className={`ss-module-workspace${enabled ? " ss-module-workspace-active" : ""}`}>
    {enabled && <div className="ss-module-toolbar">
      <div><strong>{editing ? "Make this board yours" : "Your workspace"}</strong><small>{editing ? "Drag anywhere on the dots. Pull a corner to resize. Add your own modules." : "Your board is saved for this page on this browser."}</small></div>
      <div>{editing ? <>
        <button disabled={dragging || !undo.length} onClick={() => { setRedo(rows => [...rows, current]); setDraft(undo.at(-1)!); setUndo(rows => rows.slice(0, -1)); }}><Undo2 size={15} /> Undo</button>
        <button disabled={dragging || !redo.length} onClick={() => { setUndo(rows => [...rows, current]); setDraft(redo.at(-1)!); setRedo(rows => rows.slice(0, -1)); }}><Redo2 size={15} /> Redo</button>
        <button disabled={dragging} onClick={() => setLibrary(v => !v)}><Plus size={15} /> Add modules</button>
        <button disabled={dragging || (current.custom?.length ?? 0) >= 50} onClick={createCustom}><Plus size={15} /> Create module</button>
        <button disabled={dragging} onClick={() => commit({ ...emptyModuleLayout(), custom: current.custom, modules: Object.fromEntries(Object.entries(current.modules).filter(([id]) => id.startsWith("custom-")).map(([id, p]) => [id, { ...p, hidden: true }])) }, "Original arrangement restored. Custom cards are kept in your library.")}><RotateCcw size={14} /> Reset</button>
        <button disabled={dragging} onClick={() => { setDraft(saved); setEditing(false); setLibrary(false); }}>Cancel</button>
        <button disabled={dragging} className="ss-module-save" onClick={() => { try { localStorage.setItem(key, JSON.stringify(current)); setSaved(current); setEditing(false); setLibrary(false); setUndo([]); setRedo([]); setMessage("Board saved."); } catch { setMessage("Could not save this board. Your draft is still available."); } }}>Save layout</button>
      </> : <button onClick={() => { setDraft(saved); setEditing(true); setUndo([]); setRedo([]); setMessage(""); }}>Customize workspace</button>}</div>
    </div>}
    <p className="ss-module-message" role="status" aria-live="polite">{message}</p>
    {editing && library && <section ref={libraryPanel} className="ss-module-library" aria-label="Module library"><div><button className="ss-module-library-handle" aria-label="Move module library" onPointerDown={event => startGesture(event, "", "panel")}><GripVertical size={16} /> Add a module</button><button disabled={dragging} aria-label="Close module library" onClick={() => setLibrary(false)}><X size={16} /></button></div>
      <p>Pick up a module and drop it anywhere on your board.</p>
      <input aria-label="Search modules" placeholder="Find a module…" value={search} onChange={event => setSearch(event.target.value)} />
      <button disabled={dragging} onClick={createCustom}><Plus size={15} /> Create your own module</button>
      <div className="ss-module-library-grid">{modules.filter(m => m.title.toLowerCase().includes(search.toLowerCase())).map(m => <article key={m.id}><strong>{modulePlacement(current, m).title || m.title}</strong><small>{modulePlacement(current, m).hidden ? "Available to add" : "On your board"}</small><button disabled={dragging} onClick={() => addModule(m.id)}>{modulePlacement(current, m).hidden ? "Add module" : "Place in view"}</button><button disabled={dragging} className="ss-module-library-grip" aria-label={`Drag ${m.title} from library`} onPointerDown={event => startGesture(event, m.id, "library")}><GripVertical size={16} /> Pick up</button></article>)}</div>
    </section>}
    <div className="ss-module-sources">{children}{enabled && current.custom?.map(custom => <WorkspaceModule key={custom.id} id={custom.id} title={custom.title} section={current.sections[0].id}><section className="ss-custom-module"><h2>{current.modules[custom.id]?.title || custom.title}</h2>{editing ? <textarea aria-label={`Content for ${current.modules[custom.id]?.title || custom.title}`} placeholder="Your notes, reminders, rules…" maxLength={10000} value={custom.text} onChange={event => commit({ ...resolved(), custom: current.custom!.map(c => c.id === custom.id ? { ...c, text: event.target.value } : c) })} /> : <p>{custom.text || "Your own space for notes, reminders and rules."}</p>}</section></WorkspaceModule>)}</div>
    <div ref={canvas} hidden={!enabled} className={`ss-free-board${editing ? " ss-free-board-editing" : ""}`} style={{ minHeight: boardHeight }} aria-label="Workspace board" />
    <div ref={parking} hidden inert />
  </div></Context.Provider>;
}
