"use client";
import { createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ArrowDown, GripVertical, Plus, RotateCcw, Undo2, Redo2, MoveDiagonal2, Settings2, X, EyeOff } from "lucide-react";
import { emptyModuleLayout, moduleLayoutKey, moveModule, readModuleLayout, resizeModule, type ModuleLayout, type ModulePlacement } from "@/lib/module-layout";

export type ModulePart = { id: string; title: string; selector: string };
type Definition = { id: string; title: string; section: string; order: number; width: number; initiallyHidden: boolean; parts: ModulePart[]; host: HTMLDivElement };
type Registry = { register: (module: Definition) => () => void; editing: boolean; placement: (module: Definition) => ModulePlacement; change: (id: string, patch: Partial<ModulePlacement>) => void; shift: (id: string, direction: number) => void; sections: ModuleLayout["sections"]; drag: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void; dragging: boolean; resize: (event: ReactPointerEvent<HTMLButtonElement>, id: string, section?: boolean) => void; resizeKey: (id: string, key: string, section?: boolean) => void };
const Context = createContext<Registry | null>(null);
const noParts: ModulePart[] = [];
export function ModuleScope({ active, children }: { active: boolean; children: ReactNode }) {
  const context = useContext(Context);
  return <Context.Provider value={active ? context : null}>{children}</Context.Provider>;
}

/** Each portal has one stable host. Moving that host between empty section slots
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
    host.style.gridColumn = `span ${placement.width}`;
    host.style.height = placement.height ? placement.height + "px" : "";
    host.classList.toggle("ss-module-sized", !!placement.height);
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
      <button className="ss-module-grip" aria-label={`Drag ${title} module`} onPointerDown={event => ctx.drag(event, id)}><GripVertical size={16} /><span>{placement.title || title}</span></button>
      <button aria-label={`Edit inside ${title}`} disabled={ctx.dragging} onClick={() => setOptions(v => !v)} aria-expanded={options}><Settings2 size={15} /></button>
      <button aria-label={`Move ${title} module up`} disabled={ctx.dragging} onClick={() => ctx.shift(id, -1)}><ArrowUp size={14} /></button>
      <button aria-label={`Move ${title} module down`} disabled={ctx.dragging} onClick={() => ctx.shift(id, 1)}><ArrowDown size={14} /></button>
      <button aria-label={`Hide ${title} module`} disabled={ctx.dragging} onClick={() => ctx.change(id, { hidden: true })}><EyeOff size={15} /></button>
    </div>}
    {ctx.editing && options && <fieldset className="ss-module-options" disabled={ctx.dragging}>
      <legend>Customize {title}</legend>
      <label>Module title<input maxLength={80} value={placement.title ?? title} onChange={event => ctx.change(id, { title: event.target.value })} /></label>
      <label>Section<select aria-label={`Section for ${title}`} value={placement.section} onChange={event => ctx.change(id, { section: event.target.value })}>{ctx.sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <label>Width<select aria-label={`Width for ${title}`} value={placement.width} onChange={event => ctx.change(id, { width: +event.target.value })}>{[3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}/12{n === 12 ? " · full section" : n === 6 ? " · half section" : ""}</option>)}</select></label>
      <label>Height<input aria-label={`Height for ${title}`} type="number" placeholder="Automatic" min={120} max={1600} value={placement.height ?? ""} onChange={event => ctx.change(id, { height: event.target.value ? Math.max(120, Math.min(1600, +event.target.value)) : undefined })} /></label>
      <label><input type="checkbox" checked={placement.compact ?? false} onChange={event => ctx.change(id, { compact: event.target.checked })} /> Compact spacing</label>
      {!!parts.length && <div className="ss-module-parts"><strong>Inside this module</strong>{parts.map(part => <label key={part.id}><input type="checkbox" checked={!placement.hiddenParts?.includes(part.id)} onChange={event => ctx.change(id, { hiddenParts: event.target.checked ? placement.hiddenParts?.filter(value => value !== part.id) : [...(placement.hiddenParts || []), part.id] })} />{part.title}</label>)}</div>}
      <button type="button" onClick={() => setOptions(false)}>Done</button>
    </fieldset>}
    {placement.title && placement.title !== title && <h2 className="ss-module-custom-title">{placement.title}</h2>}
    <div className="ss-module-content">{children}</div>
    {ctx.editing && <button className="ss-module-resize" aria-label={`Resize ${title}`} title="Drag to resize. Arrow keys adjust width and height; Home restores automatic height." onPointerDown={event => ctx.resize(event, id)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) { event.preventDefault(); ctx.resizeKey(id, event.key); } }}><MoveDiagonal2 size={16} /></button>}
  </>, host, id);
}

export default function ModuleWorkspace({ owner, page, enabled = true, children }: { owner: string; page: string; enabled?: boolean; children: ReactNode }) {
  const [modules, setModules] = useState<Definition[]>([]);
  const [undo, setUndo] = useState<ModuleLayout[]>([]), [redo, setRedo] = useState<ModuleLayout[]>([]);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<ModuleLayout>(emptyModuleLayout);
  const [draft, setDraft] = useState<ModuleLayout>(emptyModuleLayout);
  const [editing, setEditing] = useState(false), [library, setLibrary] = useState(false), [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false), [destination, setDestination] = useState("main");
  const slots = useRef(new Map<string, HTMLDivElement>());
  const libraryPanel = useRef<HTMLElement>(null);
  const libraryDrag = useRef<{ pointer: number; x: number; y: number; left: number; top: number; handle: HTMLButtonElement } | null>(null);
  const parking = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; host: HTMLElement; x: number; y: number; scrollStart: number; scroller?: HTMLElement; pointer: number; handle: HTMLButtonElement; moved: boolean; transform: string; library?: boolean } | null>(null);
  const sizing = useRef<{ id: string; section: boolean; host: HTMLElement; handle: HTMLButtonElement; pointer: number; x: number; y: number; width: number; height: number; grid: number; gap: number; originalHeight: string; next?: { width: number; height: number } } | null>(null);
  const key = moduleLayoutKey(owner, page);
  const current = editing ? draft : saved;
  const latest = useRef({ current, modules }); latest.current = { current, modules };
  const register = useCallback((module: Definition) => {
    setModules(old => [...old.filter(m => m.id !== module.id), module]);
    return () => { module.host.remove(); setModules(old => old.filter(m => m.host !== module.host)); };
  }, []);
  useEffect(() => {
    endDrag();
    const resize = sizing.current; sizing.current = null;
    if (resize) {
      resize.host.style.gridColumn = `span ${resize.width}`; resize.host.style.height = resize.originalHeight;
      if (resize.handle.hasPointerCapture(resize.pointer)) resize.handle.releasePointerCapture(resize.pointer);
    }
    let value = emptyModuleLayout();
    try { value = readModuleLayout(localStorage.getItem(key)); } catch { /* Optional storage. */ }
    setSaved(value); setDraft(value); setUndo([]); setRedo([]); setEditing(false); setLibrary(false);
  }, [key]);
  const placement = (module: Definition): ModulePlacement => current.modules[module.id] ?? {
    section: current.sections.some(s => s.id === module.section) ? module.section : current.sections[0].id,
    order: module.order, width: module.width, hidden: module.initiallyHidden,
  };
  // Resolve all defaults before moving so untouched modules retain their reading order.
  const resolved = (): ModuleLayout => ({ ...latest.current.current, modules: Object.fromEntries(latest.current.modules.map(m => [m.id, latest.current.current.modules[m.id] ?? { section: latest.current.current.sections.some(s => s.id === m.section) ? m.section : latest.current.current.sections[0].id, order: m.order, width: m.width, hidden: m.initiallyHidden }])) });
  const commit = (value: ModuleLayout | ((old: ModuleLayout) => ModuleLayout)) => {
    const previous = latest.current.current;
    const next = typeof value === "function" ? value(previous) : value;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    setUndo(rows => [...rows.slice(-39), previous]); setRedo([]);
    latest.current.current = next; setDraft(next);
  };
  const change = (id: string, patch: Partial<ModulePlacement>) => {
    const value = resolved(), old = value.modules[id]; if (!old) return;
    commit((patch.section && patch.section !== old.section) || (old.hidden && patch.hidden === false) ? moveModule(value, id, { ...old, ...patch }, patch.section ?? old.section) : { ...value, modules: { ...value.modules, [id]: { ...old, ...patch } } });
  };
  const shiftSection = (id: string, direction: number) => commit(old => {
    const sections = [...old.sections], index = sections.findIndex(s => s.id === id), target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return old;
    const [section] = sections.splice(index, 1); sections.splice(target, 0, section);
    return { ...old, sections };
  });
  useLayoutEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const textInput = active instanceof window.HTMLInputElement || active instanceof window.HTMLTextAreaElement ? active : null;
    const selection = textInput ? { start: textInput.selectionStart, end: textInput.selectionEnd } : null;
    for (const section of current.sections) {
      // Slot moves keep the existing portal host and its contents intact.
      const slot = slots.current.get(section.id); if (!slot) continue;
      modules.filter(m => !placement(m).hidden && placement(m).section === section.id).sort((a, b) => placement(a).order - placement(b).order || modules.indexOf(a) - modules.indexOf(b)).forEach((m, index) => {
        if (slot.children[index] !== m.host) slot.insertBefore(m.host, slot.children[index] ?? null);
      });
    }
    for (const module of modules) if (placement(module).hidden && module.host.parentElement !== parking.current) parking.current?.appendChild(module.host);
    if (active?.isConnected && document.activeElement !== active && !active.closest("[hidden],[inert]")) {
      active.focus({ preventScroll: true });
      if (selection?.start != null && selection.end != null) textInput?.setSelectionRange(selection.start, selection.end);
    }
  }, [modules, current, enabled]);
  const endDrag = () => {
    const g = drag.current; drag.current = null;
    if (g?.library) g.host.remove();
    if (g) { g.host.style.transform = g.transform; g.host.classList.remove("ss-module-held"); if (g.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer); }
    canvas.current?.querySelectorAll(".ss-module-drop-target").forEach(n => n.classList.remove("ss-module-drop-target"));
    setDragging(false);
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const g = drag.current; if (!g || event.pointerId !== g.pointer) return;
      const dx = event.clientX - g.x, dy = event.clientY - g.y + (g.scroller?.scrollTop ?? window.scrollY) - g.scrollStart;
      if (Math.hypot(dx, dy) < 5 && !g.moved) return;
      g.moved = true;
      g.host.style.transform = `translate(${dx}px,${dy}px) scale(${window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 1.025})`;
      canvas.current?.querySelectorAll<HTMLElement>("[data-module-section]").forEach(n => { const r = n.getBoundingClientRect(); n.classList.toggle("ss-module-drop-target", event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom); });
      if (event.clientY > window.innerHeight - 35) { if (g.scroller) g.scroller.scrollTop += 12; else window.scrollBy(0, 12); }
      else if (event.clientY < 40) { if (g.scroller) g.scroller.scrollTop -= 12; else window.scrollBy(0, -12); }
    };
    const up = (event: PointerEvent) => {
      const g = drag.current; if (!g || event.pointerId !== g.pointer) return;
      if (g.moved) {
        const target = [...(canvas.current?.querySelectorAll<HTMLElement>("[data-module-section]") ?? [])].find(n => { const r = n.getBoundingClientRect(); return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom; });
        if (target) {
          const value = resolved();
          const before = [...target.querySelectorAll<HTMLElement>("[data-module-id]")].find(n => {
            if (n === g.host) return false;
            const r = n.getBoundingClientRect();
            return event.clientY < r.top || (event.clientY <= r.bottom && event.clientX < r.left + r.width / 2);
          })?.dataset.moduleId;
          if (value.modules[g.id]) commit(moveModule(value, g.id, value.modules[g.id], target.dataset.moduleSection!, before));
          setMessage("Module moved. Save layout to keep this arrangement.");
        }
      }
      endDrag();
    };
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); endDrag(); setMessage("Move canceled."); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", endDrag); window.addEventListener("keydown", cancel); window.addEventListener("blur", endDrag);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", endDrag); window.removeEventListener("keydown", cancel); window.removeEventListener("blur", endDrag); endDrag(); };
  }, []);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const g = libraryDrag.current, panel = libraryPanel.current;
      if (!g || !panel || g.pointer !== event.pointerId) return;
      const left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, g.left + event.clientX - g.x));
      const top = Math.max(0, Math.min(window.innerHeight - 60, g.top + event.clientY - g.y));
      Object.assign(panel.style, { left: left + "px", top: top + "px", right: "auto", bottom: "auto", maxHeight: `calc(100dvh - ${top + 12}px)` });
    };
    const finish = () => { const g = libraryDrag.current; libraryDrag.current = null; if (g?.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); window.addEventListener("blur", finish);
    return () => { finish(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); window.removeEventListener("blur", finish); };
  }, []);
  const context: Registry = { register, editing, placement, change, sections: current.sections, dragging,
    shift: (id, direction) => {
      const value = resolved(), p = value.modules[id];
      const peers = Object.entries(value.modules).filter(([, m]) => !m.hidden && m.section === p.section).sort((a, b) => a[1].order - b[1].order);
      const index = peers.findIndex(([key]) => key === id);
      if (index + direction < 0 || index + direction >= peers.length) return;
      commit(moveModule(value, id, p, p.section, peers[direction < 0 ? index - 1 : index + 2]?.[0]));
      setMessage("Module order updated.");
    },
    drag: (event, id) => startDrag(event, id), resize: startResize, resizeKey, };
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string, fromLibrary = false) {
      if (event.button !== 0 || drag.current || sizing.current) return;
      const module = modules.find(m => m.id === id); if (!module) return;
      event.preventDefault(); event.currentTarget.focus();
      let held = module.host;
      if (fromLibrary) {
        held = document.createElement("div"); held.className = "ss-module-library-ghost"; held.textContent = module.title;
        Object.assign(held.style, { position: "fixed", left: event.clientX + "px", top: event.clientY + "px", pointerEvents: "none" });
        document.body.appendChild(held);
      }
      let parent = canvas.current?.parentElement ?? null, scroller: HTMLElement | undefined;
      while (parent && parent !== document.body) { if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) { scroller = parent; break; } parent = parent.parentElement; }
      drag.current = { id, host: held, library: fromLibrary, x: event.clientX, y: event.clientY, scrollStart: scroller?.scrollTop ?? window.scrollY, scroller, pointer: event.pointerId, handle: event.currentTarget, moved: false, transform: held.style.transform };
      event.currentTarget.setPointerCapture(event.pointerId); held.classList.add("ss-module-held");
      held.style.transform = `scale(${window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 1.025})`; setDragging(true);
  }
  function startResize(event: ReactPointerEvent<HTMLButtonElement>, id: string, section = false) {
    if (event.button !== 0 || drag.current || sizing.current) return;
    const host = section ? [...(canvas.current?.children ?? [])].find(n => (n as HTMLElement).dataset.moduleSection === id) as HTMLElement : modules.find(m => m.id === id)?.host;
    if (!host?.parentElement) return;
    event.preventDefault(); event.currentTarget.focus();
    const value = resolved(), item = section ? value.sections.find(s => s.id === id) : value.modules[id];
    if (!item) return;
    sizing.current = { id, section, host, handle: event.currentTarget, pointer: event.pointerId, x: event.clientX, y: event.clientY, width: item.width, height: host.getBoundingClientRect().height, grid: host.parentElement.getBoundingClientRect().width, gap: parseFloat(getComputedStyle(host.parentElement).columnGap) || 0, originalHeight: host.style.height };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  }
  function resizeKey(id: string, key: string, section = false) {
    const value = resolved(), item = section ? value.sections.find(s => s.id === id) : value.modules[id];
    if (!item) return;
    const patch = key === "Home" ? { height: undefined } : { width: Math.max(3, Math.min(12, item.width + (key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0))), height: key === "ArrowUp" || key === "ArrowDown" ? Math.max(120, Math.min(1600, (item.height ?? 300) + (key === "ArrowDown" ? 20 : -20))) : item.height };
    commit(section ? { ...value, sections: value.sections.map(s => s.id === id ? { ...s, ...patch } : s) } : { ...value, modules: { ...value.modules, [id]: { ...value.modules[id], ...patch } } });
  }
  useEffect(() => {
    const finish = (accept: boolean) => {
      const g = sizing.current; if (!g) return; sizing.current = null;
      g.host.style.gridColumn = `span ${g.width}`; g.host.style.height = g.originalHeight;
      if (g.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
      if (accept && g.next) {
        const value = resolved();
        commit(g.section ? { ...value, sections: value.sections.map(s => s.id === g.id ? { ...s, ...g.next } : s) } : { ...value, modules: { ...value.modules, [g.id]: { ...value.modules[g.id], ...g.next } } });
        setMessage("Size updated. Save layout to keep it.");
      }
      setDragging(false);
    };
    const move = (event: PointerEvent) => {
      const g = sizing.current; if (!g || event.pointerId !== g.pointer) return;
      g.next = resizeModule(g.width, g.height, event.clientX - g.x, event.clientY - g.y, g.grid, g.gap);
      g.host.style.gridColumn = `span ${g.next.width}`; g.host.style.height = g.next.height + "px";
    };
    const up = (event: PointerEvent) => { if (event.pointerId === sizing.current?.pointer) finish(true); };
    const cancel = () => finish(false);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", key);
    return () => { cancel(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", key); };
  }, []);
  return <Context.Provider value={enabled ? context : null}><div className={`ss-module-workspace${enabled ? " ss-module-workspace-active" : ""}`}>
    {enabled && <div className="ss-module-toolbar">
      <div><strong>{editing ? "Build a workspace that fits you" : "Your workspace"}</strong><small>{editing ? "Drag cards between sections. Pull a corner to resize. Choose the information inside each card." : "Your modules and sections are saved for this page on this browser."}</small></div>
      <div>{editing ? <>
        <button disabled={dragging || !undo.length} onClick={() => { const previous = undo.at(-1)!; setRedo(rows => [...rows, current]); setUndo(rows => rows.slice(0, -1)); setDraft(previous); setMessage("Layout change undone."); }}><Undo2 size={15} /> Undo</button>
        <button disabled={dragging || !redo.length} onClick={() => { setUndo(rows => [...rows, current]); setDraft(redo.at(-1)!); setRedo(rows => rows.slice(0, -1)); setMessage("Layout change restored."); }}><Redo2 size={15} /> Redo</button>
        <button disabled={dragging} onClick={() => setLibrary(v => !v)}><Plus size={15} /> Add modules</button>
        <button disabled={dragging || draft.sections.length >= 12} onClick={() => { const id = "section-" + crypto.randomUUID(); commit(old => ({ ...old, sections: [...old.sections, { id, title: "New section", width: 12 }] })); }}><Plus size={15} /> Add section</button>
        <button disabled={dragging} onClick={() => { commit(emptyModuleLayout()); setMessage("Default modules restored. Save to keep them, or cancel."); }}><RotateCcw size={14} /> Reset</button>
        <button disabled={dragging} onClick={() => { setDraft(saved); setEditing(false); setLibrary(false); }}>Cancel</button>
        <button disabled={dragging} className="ss-module-save" onClick={() => { if (draft.sections.some(s => !s.title.trim())) { setMessage("Give each section a name before saving."); return; } try { localStorage.setItem(key, JSON.stringify(draft)); setSaved(draft); setUndo([]); setRedo([]); setEditing(false); setLibrary(false); setMessage("Module layout saved."); } catch { setMessage("Could not save this layout. Your draft is still available."); } }}>Save layout</button>
      </> : <button onClick={() => { setDraft(saved); setUndo([]); setRedo([]); setEditing(true); setMessage(""); }}>Customize workspace</button>}</div>
    </div>}
    <p className="ss-module-message" role="status" aria-live="polite">{message}</p>
    {editing && library && <section ref={libraryPanel} className="ss-module-library" aria-label="Module library"><div><button className="ss-module-library-handle" aria-label="Move module library" onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); const rect = libraryPanel.current!.getBoundingClientRect(); libraryDrag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, handle: event.currentTarget }; event.currentTarget.setPointerCapture(event.pointerId); }}><GripVertical size={16} /> Add a module</button><button aria-label="Close module library" onClick={() => setLibrary(false)}><X size={16} /></button></div>
      <p>Pick up a module and drop it into a section, or choose a section below.</p>
      <input aria-label="Search modules" placeholder="Find a module…" value={search} onChange={event => setSearch(event.target.value)} />
      <label>Add to section<select aria-label="Add to section" value={current.sections.some(s => s.id === destination) ? destination : current.sections[0].id} onChange={event => setDestination(event.target.value)}>{current.sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <div className="ss-module-library-grid">{modules.filter(m => m.title.toLowerCase().includes(search.toLowerCase())).map(m => <article key={m.id}><strong>{m.title}</strong><small>{placement(m).hidden ? "Available to add" : "On your page · move to another section"}</small><button onClick={() => change(m.id, { section: current.sections.some(s => s.id === destination) ? destination : current.sections[0].id, hidden: false })}>{placement(m).hidden ? "Add module" : "Move here"}</button><button className="ss-module-library-grip" aria-label={`Drag ${m.title} from library`} onPointerDown={event => startDrag(event, m.id, true)}><GripVertical size={16} /> Pick up</button></article>)}</div>
    </section>}
    <div className="ss-module-sources">{children}</div>
    <div ref={canvas} hidden={!enabled} className={`ss-module-canvas${editing ? " ss-module-canvas-editing" : ""}`}>
      {current.sections.map(section => {
        const count = modules.filter(m => !placement(m).hidden && placement(m).section === section.id).length;
        if (!editing && !count) return null;
        return <section key={section.id} data-module-section={section.id} className="ss-module-section" style={{ gridColumn: `span ${section.width}`, height: section.height, position: "relative" }} aria-label={section.title}>
          {editing && <div className="ss-module-section-heading"><input aria-label={`Section name: ${section.title}`} maxLength={60} value={section.title} onChange={event => commit(old => ({ ...old, sections: old.sections.map(s => s.id === section.id ? { ...s, title: event.target.value } : s) }))} /><select aria-label={`Width of ${section.title} section`} value={section.width} onChange={event => commit(old => ({ ...old, sections: old.sections.map(s => s.id === section.id ? { ...s, width: +event.target.value } : s) }))}>{[3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}/12 wide</option>)}</select></div>}
          {editing && <div className="ss-module-section-actions"><button disabled={dragging || current.sections[0].id === section.id} aria-label={`Move ${section.title} section up`} onClick={() => shiftSection(section.id, -1)}><ArrowUp size={13} /></button><button disabled={dragging || current.sections.at(-1)?.id === section.id} aria-label={`Move ${section.title} section down`} onClick={() => shiftSection(section.id, 1)}><ArrowDown size={13} /></button><button className="ss-module-remove-section" disabled={dragging || current.sections.length === 1} aria-label={`Remove ${section.title} section`} onClick={() => {
            const value = resolved(), sections = value.sections.filter(s => s.id !== section.id);
            const fallback = sections[0]; if (!fallback) return;
            const next = { ...value, sections, modules: { ...value.modules } };
            for (const [id, p] of Object.entries(next.modules)) if (p.section === section.id) next.modules[id] = { ...p, section: fallback.id, order: 100 + p.order };
            for (const s of sections) Object.entries(next.modules).filter(([,p]) => p.section === s.id).sort((a,b) => a[1].order - b[1].order).forEach(([id,p], order) => { next.modules[id] = { ...p, order }; });
            commit(next); setMessage(`Section removed. Its modules moved to ${fallback.title}.`);
          }}><X size={13} /> Remove section</button></div>}
          {!editing && !["top", "main", "side", "bottom"].includes(section.id) && <h2 className="ss-module-section-title">{section.title}</h2>}
          {editing && <button className="ss-module-resize ss-section-resize" aria-label={`Resize ${section.title} section`} title="Drag or use arrow keys to resize. Home restores automatic height." onPointerDown={event => startResize(event, section.id, true)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) { event.preventDefault(); resizeKey(section.id, event.key, true); } }}><MoveDiagonal2 size={16} /></button>}
          <div className="ss-module-slot" ref={node => { if (node) slots.current.set(section.id, node); else slots.current.delete(section.id); }} />
          {editing && !count && <button className="ss-module-empty" onClick={() => { setDestination(section.id); setLibrary(true); }}>Drop a module here or ＋ add one</button>}
        </section>;
      })}
    </div>
    <div ref={parking} hidden inert />
  </div></Context.Provider>;
}
