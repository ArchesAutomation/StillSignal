"use client";
import { useState, type CSSProperties } from "react";
import { Fish, Plus, Trash2 } from "lucide-react";
import { useAppearance } from "./appearance-context";
import { GlassButton } from "./glassyui/glass-button";
import { DEFAULT_OCEAN_SHARKS, MAX_OCEAN_SHARKS, SHARK_PALETTES, SHARK_SIZE_OPTIONS, SHARK_SPECIES, sharkPalette, type OceanShark } from "@/lib/shark-palettes";

export default function SharkSettings() {
  const { preferences, update } = useAppearance();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = preferences.sharks.find(shark => shark.id === selectedId) ?? preferences.sharks[0];
  const change = (patch: Partial<OceanShark>) => {
    if (selected) update(current => ({ sharks: current.sharks.map(shark => shark.id === selected.id ? { ...shark, ...patch, id: shark.id } : shark) }));
  };
  const add = () => {
    if (preferences.sharks.length >= MAX_OCEAN_SHARKS) return;
    const id = crypto.randomUUID();
    update(current => ({ sharks: current.sharks.length >= MAX_OCEAN_SHARKS ? current.sharks : [...current.sharks, { id, kind: "classic", palette: SHARK_PALETTES[current.sharks.length % SHARK_PALETTES.length].id, size: .77 }] }));
    setSelectedId(id);
  };
  const palette = selected && sharkPalette(selected.palette);
  return <section className="settings-card shark-settings" aria-labelledby="shark-settings-heading">
    <div className="shark-settings-heading"><div><h2 id="shark-settings-heading">Your ocean</h2><p>Give each shark its own look. Start with four; keep up to six.</p></div><output aria-live="polite">{preferences.sharks.length} / {MAX_OCEAN_SHARKS}</output></div>
    <fieldset className="shark-mode"><legend>Light or dark</legend>{(["light", "dark"] as const).map(theme => <GlassButton key={theme} size="sm" lens={false} aria-pressed={preferences.theme === theme} onClick={() => update({ theme })}>{theme === "light" ? "Light mode" : "Dark mode"}</GlassButton>)}</fieldset>
    <div className="ocean-shark-roster" aria-label="Your sharks">{preferences.sharks.map((shark, index) => <button className="ocean-shark-tab" type="button" key={shark.id} aria-pressed={selected?.id === shark.id} onClick={() => setSelectedId(shark.id)} style={{ "--shark-swatch": sharkPalette(shark.palette).color } as CSSProperties}><Fish size={20} aria-hidden="true" /><span>Shark {index + 1}<small>{SHARK_SPECIES.find(species => species.id === shark.kind)?.name} · {sharkPalette(shark.palette).name}</small></span></button>)}</div>
    <div className="ocean-shark-actions"><GlassButton size="sm" lens={false} onClick={add} disabled={preferences.sharks.length >= MAX_OCEAN_SHARKS}><Plus size={14} aria-hidden="true" />Add shark</GlassButton><GlassButton size="sm" lens={false} onClick={() => { update({ sharks: DEFAULT_OCEAN_SHARKS }); setSelectedId(null); }}>Reset ocean</GlassButton></div>
    {selected && palette ? <div className="ocean-shark-editor">
      <div className="ocean-shark-editor-heading"><div><h3>Shark {preferences.sharks.indexOf(selected) + 1}</h3><p>{palette.name}</p></div><GlassButton size="sm" lens={false} aria-label={"Remove shark " + (preferences.sharks.indexOf(selected) + 1)} onClick={() => { update(current => ({ sharks: current.sharks.filter(shark => shark.id !== selected.id) })); setSelectedId(null); }}><Trash2 size={14} aria-hidden="true" />Remove</GlassButton></div>
      <label className="ocean-shark-species">Species<select aria-label="Shark species" value={selected.kind} onChange={e => { const species = SHARK_SPECIES.find(species => species.id === e.target.value); if (species) change({ kind: species.id }); }}>{SHARK_SPECIES.map(species => <option key={species.id} value={species.id}>{species.name}</option>)}</select></label>
      <fieldset className="ocean-shark-sizes"><legend>Size</legend><div>{SHARK_SIZE_OPTIONS.map(option => <button type="button" key={option.value} aria-pressed={selected.size === option.value} onClick={() => change({ size: option.value })}>{option.name}</button>)}</div></fieldset>
      <fieldset className="ocean-shark-colors"><legend>Color palette <span>{SHARK_PALETTES.length} distinct colors</span></legend><div className="ocean-palette-grid">{SHARK_PALETTES.map(color => <button type="button" key={color.id} aria-label={color.name} aria-pressed={selected.palette === color.id} onClick={() => change({ palette: color.id })} style={{ "--shark-swatch": color.color } as CSSProperties}><span className="ocean-palette-swatch" aria-hidden="true"><Fish size={22} /></span><span>{color.name}</span></button>)}</div></fieldset>
    </div> : <p className="shark-settings-note">Your ocean is quiet. Add a shark whenever you like.</p>}
  </section>;
}

