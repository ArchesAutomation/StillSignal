"use client";
import { useEffect, useRef } from "react";
import { GlassButton } from "@/components/glassyui/glass-button";

import { GlassPanel } from "./glassyui/glass-panel";
import { useAppearance } from "./appearance-context";
import { defaultAppearance } from "@/lib/appearance-preferences";
import { GlassMaterialSettings } from "./glass-material-settings";
import { SHARK_PALETTES } from "@/lib/shark-palettes";


export default function Appearance() {
  const { preferences, update } = useAppearance();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.current?.open) return;
      const restoreFocus = menu.current.contains(document.activeElement);
      menu.current.open = false;
      if (restoreFocus) menu.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return <details ref={menu} className="appearance-controls">
    <summary>Appearance</summary>
    <GlassPanel preset="subtle" className="appearance-panel">
      <strong>Make it yours</strong>
      <label>Mode<select value={preferences.theme} onChange={e => update({ theme: e.target.value as typeof preferences.theme })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <GlassMaterialSettings compact />
      <label>All sharks<select aria-label="All shark palettes" disabled={!preferences.sharks.length} value={preferences.sharks.length && preferences.sharks.every(shark => shark.palette === preferences.sharks[0].palette) ? preferences.sharks[0].palette : ""} onChange={e => { const palette = SHARK_PALETTES.find(palette => palette.id === e.target.value); if (palette) update(current => ({ sharks: current.sharks.map(shark => ({ ...shark, palette: palette.id })) })); }}><option value="" disabled>Individual palettes</option>{SHARK_PALETTES.map(palette => <option key={palette.id} value={palette.id}>{palette.name}</option>)}</select></label>
      <label>Buttons<input aria-label="Button color" type="color" value={preferences.accent} onChange={e => update({ accent: e.target.value })} /></label>
      <GlassButton type="submit" lens={false} onClick={() => update(defaultAppearance)}>Reset appearance</GlassButton>
    </GlassPanel>
  </details>;
}
