'use client';

import { useId, type CSSProperties } from 'react';
import { useOptionalPreferences } from './glassyui/glass-provider';
import { GLASS_BOUNDS, GLASS_PRESETS, type GlassPreset } from './glassyui/lib/glass-material';
import { PlasmaMaterialSettings } from './plasma-material-settings';

export function GlassMaterialSettings({ compact = false }: { compact?: boolean }) {
  const { preferences, setPreferences } = useOptionalPreferences();
  const material = preferences.material;
  const id = useId();
  const select = (preset: GlassPreset) => setPreferences({ material: { ...GLASS_PRESETS[preset] } });
  return <section className={`glass-material-settings ${compact ? 'glass-material-compact' : ''}`} aria-label="Glass material">
    <div className="glass-material-heading"><strong>Your glass</strong><span>{material.preset === 'custom' ? 'Custom' : material.preset[0].toUpperCase() + material.preset.slice(1)}</span></div>
    <div className="glass-presets" role="group" aria-label="Glass presets">
      {(Object.keys(GLASS_PRESETS) as GlassPreset[]).map(preset => <button key={preset} type="button" aria-pressed={material.preset === preset} onClick={() => select(preset)}>{preset[0].toUpperCase() + preset.slice(1)}</button>)}
    </div>
    <details className="glass-customize">
      <summary>Customize Glass</summary>
      <div className="material-slider-grid">
        {(Object.keys(GLASS_BOUNDS) as (keyof typeof GLASS_BOUNDS)[]).map(key => {
          const range = GLASS_BOUNDS[key], inputId = `${id}-${key}`;
          return <div key={key} className="material-slider">
            <div><label htmlFor={inputId}>{range.label}</label><output htmlFor={inputId}>{Number(material[key].toFixed(2))}{range.unit}</output></div>
            <input id={inputId} type="range" min={range.min} max={range.max} step={range.step} value={material[key]} style={{ '--range-progress': `${(material[key] - range.min) / (range.max - range.min) * 100}%` } as CSSProperties} onChange={event => setPreferences({ material: { ...material, preset: 'custom', [key]: event.currentTarget.valueAsNumber } })} />
          </div>;
        })}
      </div>
      <label className="material-accessibility"><input type="checkbox" checked={material.reflect} onChange={event => setPreferences({ material: { ...material, preset: 'custom', reflect: event.target.checked } })} /> Reflections</label>
      <button type="button" className="glass-reset" onClick={() => select(material.base)}>Reset to {material.base[0].toUpperCase() + material.base.slice(1)}</button>
    </details>
    <PlasmaMaterialSettings />
  </section>;
}
