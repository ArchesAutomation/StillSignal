"use client";
import { GlassButton } from "@/components/glassyui/glass-button";

import { GlassPanel } from "./glassyui/glass-panel";
import { useAppearance } from "./appearance-context";
import { defaultAppearance } from "@/lib/appearance-preferences";
import { SHARK_PALETTES } from "@/lib/shark-palettes";


export default function Appearance() {
  const { preferences, update } = useAppearance();
  return <details className="appearance-controls">
    <summary>Appearance</summary>
    <GlassPanel preset="subtle" className="appearance-panel">
      <strong>Make it yours</strong>
      <label>Mode<select value={preferences.theme} onChange={e => update({ theme: e.target.value as typeof preferences.theme })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>All sharks<select aria-label="All shark palettes" disabled={!preferences.sharks.length} value={preferences.sharks.length && preferences.sharks.every(shark => shark.palette === preferences.sharks[0].palette) ? preferences.sharks[0].palette : ""} onChange={e => { const palette = SHARK_PALETTES.find(palette => palette.id === e.target.value); if (palette) update(current => ({ sharks: current.sharks.map(shark => ({ ...shark, palette: palette.id })) })); }}><option value="" disabled>Individual palettes</option>{SHARK_PALETTES.map(palette => <option key={palette.id} value={palette.id}>{palette.name}</option>)}</select></label>
      <label>Buttons<input aria-label="Button color" type="color" value={preferences.accent} onChange={e => update({ accent: e.target.value })} /></label>
      <GlassButton type="submit" lens={false} onClick={() => update(defaultAppearance)}>Reset appearance</GlassButton>
    </GlassPanel>
  </details>;
}
