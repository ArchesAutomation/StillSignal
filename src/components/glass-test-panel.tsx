"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { GripVertical, MoveDiagonal2, RotateCcw } from "lucide-react";
import { GlassPanel } from "./glassyui/glass-panel";
import { useOptionalPreferences } from "./glassyui/glass-provider";

type Box = { x: number; y: number; width: number; height: number };
type Bounds = { width: number; height: number };
type Mode = "move" | "resize";
const inset = 16;
const initialBox: Box = { x: inset, y: 52, width: 320, height: 220 };

function fit(box: Box, bounds: Bounds): Box {
  const maxWidth = Math.max(0, bounds.width - inset * 2);
  const maxHeight = Math.max(0, bounds.height - inset * 2);
  const width = Math.max(Math.min(240, maxWidth), Math.min(box.width, maxWidth));
  const height = Math.max(Math.min(200, maxHeight), Math.min(box.height, maxHeight));
  return { width, height, x: Math.max(inset, Math.min(box.x, bounds.width - width - inset)), y: Math.max(inset, Math.min(box.y, bounds.height - height - inset)) };
}

export default function GlassTestPanel({ background, dim }: { background: string; dim: number }) {
  const { preferences } = useOptionalPreferences();
  const stage = useRef<HTMLDivElement>(null);
  const bounds = useRef<Bounds>({ width: 352, height: 384 });
  const measured = useRef(false);
  const live = useRef<{ mode: Mode; pointer: number; x: number; y: number; box: Box } | null>(null);
  const [box, setBox] = useState(initialBox);
  const [mode, setMode] = useState<Mode | null>(null);
  const help = useId();
  const material = preferences.material.preset;
  const materialName = material[0].toUpperCase() + material.slice(1);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const width = element.clientWidth || rect.width, height = element.clientHeight || rect.height;
      bounds.current = { width, height };
      live.current = null;
      setMode(null);
      const first = !measured.current;
      measured.current = true;
      setBox(previous => fit(first ? { ...initialBox, x: (width - initialBox.width) / 2, y: (height - initialBox.height) / 2 } : previous, bounds.current));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cancel = () => {
    const gesture = live.current;
    if (!gesture) return;
    live.current = null;
    setBox(fit(gesture.box, bounds.current));
    setMode(null);
  };
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", cancel); };
  }, []);

  const reset = () => {
    live.current = null;
    setMode(null);
    setBox(fit({ ...initialBox, x: (bounds.current.width - initialBox.width) / 2, y: (bounds.current.height - initialBox.height) / 2 }, bounds.current));
  };
  const start = (event: PointerEvent<HTMLButtonElement>, next: Mode) => {
    if (event.button !== 0 || live.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    live.current = { mode: next, pointer: event.pointerId, x: event.clientX, y: event.clientY, box };
    setMode(next);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = live.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    const next = gesture.mode === "move"
      ? { ...gesture.box, x: gesture.box.x + dx, y: gesture.box.y + dy }
      : { ...gesture.box, width: Math.min(gesture.box.width + dx, bounds.current.width - gesture.box.x - inset), height: Math.min(gesture.box.height + dy, bounds.current.height - gesture.box.y - inset) };
    setBox(fit(next, bounds.current));
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (live.current?.pointer !== event.pointerId) return;
    live.current = null;
    setMode(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, next: Mode) => {
    if (event.key === "Home") { event.preventDefault(); reset(); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 8;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    setBox(previous => fit(next === "move" ? { ...previous, x: previous.x + dx, y: previous.y + dy } : {
      ...previous, width: Math.min(previous.width + dx, bounds.current.width - previous.x - inset), height: Math.min(previous.height + dy, bounds.current.height - previous.y - inset),
    }, bounds.current));
  };
  const handlers = (next: Mode) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, next),
    onPointerMove: move, onPointerUp: finish, onPointerCancel: cancel, onLostPointerCapture: cancel,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyboard(event, next),
    "aria-describedby": help,
  });

  return <div className="glass-test-preview">
    <div ref={stage} className="wallpaper-preview" data-glass-backdrop-root="true" data-preview-interaction={mode ?? undefined} style={{ backgroundImage: background }} aria-label="Interactive glass preview">
      <div className="wallpaper-preview-dim" style={{ backgroundColor: `rgb(0 0 0 / ${dim / 100})` }} aria-hidden="true" />
      <div className="wallpaper-preview-grid" aria-hidden="true" />
      <GlassPanel preset="control" lens className="wallpaper-preview-card" aria-label="Test panel" style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
        <header className="glass-test-toolbar">
          <button type="button" className="glass-test-move" aria-label="Move test panel" {...handlers("move")}><GripVertical size={16} /><span>Move</span></button>
          <output aria-label="Test panel dimensions">{Math.round(box.width)} × {Math.round(box.height)}</output>
        </header>
        <div className="glass-test-copy"><h3>Test panel</h3><p>Move and resize this panel to see your glass against the wallpaper.</p><span>{materialName} glass</span></div>
        <button type="button" className="glass-test-resize" aria-label="Resize test panel" {...handlers("resize")}><MoveDiagonal2 size={16} /><span>Resize</span></button>
      </GlassPanel>
      <span className="wallpaper-preview-caption">LIVE MATERIAL PREVIEW</span>
    </div>
    <div className="glass-test-footer"><p id={help}>Drag Move or Resize. Arrow keys adjust; Shift moves farther. Escape cancels. Home resets.</p><button type="button" onClick={reset}><RotateCcw size={14} /> Reset panel</button></div>
  </div>;
}
