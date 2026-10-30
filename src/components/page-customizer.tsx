"use client";
import { useEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, GripVertical, LayoutTemplate, RotateCcw } from "lucide-react";
import { pageLayoutKey, readPageLayout, type PageLayout } from "@/lib/page-layout";

type Region = { node: HTMLElement; group: HTMLElement; id: string; title: string; span: number; index: number };
type Drag = { region: Region; x: number; y: number; pointer: number; handle: HTMLButtonElement; moved: boolean; before: PageLayout };
const selector = "section, [data-layout-panel], .ss-reference-history, .ss-space-writing, .ss-space-companion, .cc-panel, .glass.content-panel";

// Styling existing regions keeps their React trees, recordings and form drafts mounted.
export default function PageCustomizer({ scope, owner, page }: {
  scope: RefObject<HTMLElement | null>; owner: string; page: string;
}) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<PageLayout>({});
  const [draft, setDraft] = useState<PageLayout>({});
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const key = pageLayoutKey(owner, page);
  useEffect(() => {
    try { const value = readPageLayout(localStorage.getItem(key)); setSaved(value); setDraft(value); }
    catch { /* Editing remains available when browser storage is unavailable. */ }
  }, [key]);
  useEffect(() => {
    const host = scope.current;
    if (!host) return;
    let frame = 0;
    const stableName = (node: Element) => node.tagName.toLowerCase() + "." +
      [...node.classList].filter(c => !c.startsWith("ss-custom-")).join(".");
    const path = (node: HTMLElement): string => {
      if (node === host) return "page";
      if (node.dataset.layoutId) return node.dataset.layoutId;
      const parent = node.parentElement;
      const name = stableName(node);
      const peers = parent ? [...parent.children].filter(el => stableName(el) === name) : [];
      return (parent && parent !== host ? path(parent) + "/" : "") + name + ":" + peers.indexOf(node);
    };
    const scan = () => {
      frame = 0;
      if (drag.current) return;
      const nodes = [...host.querySelectorAll<HTMLElement>(selector)].filter(node =>
        !node.closest("[hidden], .ss-page-editor, .ss-custom-controls, .cc-dashboard-board, [inert]") &&
        !node.matches(".ss-journal-story") && node.getClientRects().length > 0 &&
        !node.parentElement?.closest("svg, form") && !node.matches("[data-layout-group]"));
      const next = nodes.map(node => {
        const group = node.parentElement!;
        const rect = node.getBoundingClientRect();
        const groupRect = group.getBoundingClientRect();
        const heading = node.querySelector("h1,h2,h3,legend,summary");
        const title = node.dataset.layoutTitle || heading?.textContent?.trim().slice(0, 70) || node.getAttribute("aria-label") || "Page panel";
        const span = Math.max(3, Math.min(12, Number(node.dataset.layoutSpan) || Math.round(rect.width / Math.max(1, groupRect.width) * 12)));
        return { node, group, id: path(node), title, span, index: [...group.children].indexOf(node) };
      });
      setRegions(old => old.length === next.length && old.every((r, i) => r.node === next[i].node && r.id === next[i].id) ? old : next);
    };
    const schedule = () => { if (!frame) frame = window.setTimeout(scan, 16); };
    scan();
    const observer = new window.MutationObserver(schedule);
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open"] });
    return () => { observer.disconnect(); window.clearTimeout(frame); };
  }, [scope, page]);
  const layout = editing ? draft : saved;
  useEffect(() => {
    const restore: (() => void)[] = [];
    const groups = new Set(regions.filter(r => editing || layout[r.id]).map(r => r.group));
    for (const group of groups) {
      const children = [...group.children].filter((n): n is HTMLElement => n instanceof window.HTMLElement && !n.matches(".ss-page-editor"));
      const widths = children.map(n => n.getBoundingClientRect().width);
      const width = Math.max(1, group.getBoundingClientRect().width);
      group.classList.add("ss-custom-group");
      restore.push(() => group.classList.remove("ss-custom-group"));
      children.forEach((node, index) => {
        const region = regions.find(r => r.node === node);
        const value = region && layout[region.id];
        const order = node.style.order, column = node.style.gridColumn;
        node.style.order = String(value ? value.order : index);
        node.style.gridColumn = `span ${value ? value.span : region?.span || Math.max(3, Math.min(12, Math.round(widths[index] / width * 12)))}`;
        restore.push(() => { node.style.order = order; node.style.gridColumn = column; });
      });
    }
    for (const r of regions) {
      r.node.classList.toggle("ss-custom-editing", editing);
      restore.push(() => r.node.classList.remove("ss-custom-editing"));
    }
    return () => restore.forEach(fn => fn());
  }, [regions, editing, layout]);
  const peers = (r: Region) => regions.filter(n => n.group === r.group)
    .sort((a, b) => (draftRef.current[a.id]?.order ?? a.index) - (draftRef.current[b.id]?.order ?? b.index));
  const reorder = (r: Region, target: Region) => {
    const rows = peers(r), from = rows.indexOf(r), to = rows.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    rows.splice(from, 1); rows.splice(to, 0, r);
    const next = { ...draftRef.current };
    rows.forEach((row, index) => { next[row.id] = { span: next[row.id]?.span ?? row.span, order: index }; });
    draftRef.current = next; setDraft(next);
    setMessage(r.title + " moved.");
  };
  const endDrag = (cancel = false) => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    g.region.node.style.removeProperty("transform");
    g.region.node.classList.remove("ss-custom-held");
    scope.current?.querySelectorAll(".ss-custom-target").forEach(node => node.classList.remove("ss-custom-target"));
    if (g.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
    if (cancel) { draftRef.current = g.before; setDraft(g.before); }
    setDragging(false);
    setMessage(cancel ? "Move canceled." : g.moved ? g.region.title + " moved." : "");
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); endDrag(true); } };
    const blur = () => endDrag(true);
    window.addEventListener("keydown", cancel); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", blur); endDrag(true); };
  }, []);
  const start = (event: ReactPointerEvent<HTMLButtonElement>, region: Region) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
    drag.current = { region, x: event.clientX, y: event.clientY, pointer: event.pointerId, handle: event.currentTarget, moved: false, before: draftRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
    region.node.classList.add("ss-custom-held");
    region.node.style.transform = `scale(${window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 1.025})`;
    setDragging(true);
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (Math.hypot(dx, dy) < 5 && !g.moved) return;
    g.moved = true;
    g.region.node.style.transform = `translate(${dx}px,${dy}px) scale(${window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 1.025})`;
    peers(g.region).filter(r => r !== g.region).forEach(r => {
      const box = r.node.getBoundingClientRect();
      r.node.classList.toggle("ss-custom-target", event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom);
    });
  };
  const drop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== event.pointerId) return;
    if (g.moved) {
      const target = peers(g.region).filter(r => r !== g.region).find(r => {
        const box = r.node.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      });
      if (target) reorder(g.region, target);
    }
    endDrag();
  };
  return <>
    <div className="ss-page-editor" aria-label={`${page} layout editor`}>
      <div><strong>{editing ? "Arrange your page" : "Your workspace, your way"}</strong><small>{editing ? "Drag a panel by its handle. Save when it feels right." : "Layouts are saved separately for each page on this browser."}</small></div>
      <div className="ss-page-editor-actions">
        {editing ? <>
          <button disabled={dragging} onClick={() => { setDraft({}); setMessage("Default layout restored. Save to keep it, or cancel."); }}><RotateCcw size={14} /> Reset layout</button>
          <button disabled={dragging} onClick={() => { setDraft(saved); setEditing(false); setMessage("Changes canceled."); }}>Cancel</button>
          <button disabled={dragging} onClick={() => {
            try { localStorage.setItem(key, JSON.stringify(draft)); setSaved(draft); setEditing(false); setMessage("Page layout saved on this browser."); }
            catch { setMessage("Could not save the layout. Browser storage is unavailable; your draft is still here."); }
          }}>Save layout</button>
        </> : <button onClick={() => { setDraft(saved); setEditing(true); setMessage(""); }}><LayoutTemplate size={14} /> Edit page layout</button>}
      </div>
      <span className="ss-page-editor-status" role="status" aria-live="polite">{message}</span>
    </div>
    {editing && regions.map(r => createPortal(<div className="ss-custom-controls" role="group" aria-label={`${r.title} layout controls`}>
      <button className="ss-custom-grip" aria-label={`Drag ${r.title}`} onPointerDown={event => start(event, r)} onPointerMove={move} onPointerUp={drop} onPointerCancel={() => endDrag(true)} onLostPointerCapture={() => endDrag(true)}><GripVertical size={16} /><span>{r.title}</span></button>
      <button disabled={dragging || peers(r).indexOf(r) === 0} aria-label={`Move ${r.title} up`} onClick={() => reorder(r, peers(r)[peers(r).indexOf(r) - 1])}><ArrowUp size={14} /></button>
      <button disabled={dragging || peers(r).indexOf(r) === peers(r).length - 1} aria-label={`Move ${r.title} down`} onClick={() => reorder(r, peers(r)[peers(r).indexOf(r) + 1])}><ArrowDown size={14} /></button>
      <button disabled={dragging} aria-label={`Change ${r.title} width`} onClick={() => setDraft(old => ({ ...old, [r.id]: { order: old[r.id]?.order ?? r.index, span: (old[r.id]?.span ?? r.span) === 12 ? 6 : 12 } }))}>{(draft[r.id]?.span ?? r.span) === 12 ? "Half" : "Full"}</button>
    </div>, r.node, r.id))}
  </>;
}
