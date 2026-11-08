'use client';
import { useId, useRef, type CSSProperties } from 'react';
import { useOptionalPreferences } from './glassyui/glass-provider';
import { GLASS_BOUNDS, GLASS_PRESETS, GLASS_PRESET_LABELS, GLASS_PRESET_COPY, type GlassPreset, type GlassNumericKey, type GlassMaterial } from './glassyui/lib/glass-material';
const controls: GlassNumericKey[] = ['refractionStrength', 'blur', 'tint', 'radius', 'reflectStrength', 'saturate'];
export function GlassMaterialSettings({ compact = false }: { compact?: boolean }) {
  const { preferences, setPreferences } = useOptionalPreferences();
  const material = preferences.material;
  const id = useId(), customize = useRef<HTMLDetailsElement>(null);
  const select = (preset: GlassPreset) => setPreferences({ material: { ...GLASS_PRESETS[preset] } });
  const update = (patch: Partial<GlassMaterial>) => setPreferences({ material: { ...material, ...patch, preset: 'custom' } });
  const custom = material.preset === 'custom' || material.preset === 'frosted';
  return <section className={`glass-material-settings ${compact ? 'glass-material-compact' : ''}`} aria-label="Glass material">
    <div className="glass-material-heading"><strong>Your glass</strong><span>{custom ? 'Custom' : GLASS_PRESET_LABELS[material.preset]}</span></div>
    <div className="glass-presets" role="group" aria-label="Glass presets">
      {(['clear', 'bubbly', 'graphite'] as const).map(preset => <button key={preset} type="button" aria-pressed={material.preset === preset} onClick={() => select(preset)}>{GLASS_PRESET_LABELS[preset]}</button>)}
      <button type="button" aria-pressed={custom} onClick={() => { update({}); if (customize.current) customize.current.open = true; }}>Custom</button>
    </div>
    <p className="glass-preset-description">{custom ? 'Your own balance of refraction, clarity and shape.' : GLASS_PRESET_COPY[material.base]}</p>
    <details ref={customize} className="glass-customize" open={!compact}>
      <summary>Customize glass</summary>
      <div className="material-slider-grid">
        {controls.map(key => {
          const range = GLASS_BOUNDS[key], inputId = `${id}-${key}`;
          return <div key={key} className="material-slider">
            <div><label htmlFor={inputId}>{key === 'refractionStrength' ? 'Refraction' : key === 'reflectStrength' ? 'Reflections' : key === 'saturate' ? 'Color richness' : range.label}</label><output htmlFor={inputId}>{Number(material[key].toFixed(2))}{range.unit}</output></div>
            <input id={inputId} type="range" min={range.min} max={range.max} step={range.step} value={material[key]} style={{ '--range-progress': `${(material[key] - range.min) / (range.max - range.min) * 100}%` } as CSSProperties} onChange={event => update({ [key]: event.currentTarget.valueAsNumber, ...(key === 'radius' ? { pill: false } : {}), ...(key === 'reflectStrength' ? { reflect: true } : {}) })} />
          </div>;
        })}
      </div>
      <button type="button" className="glass-reset" onClick={() => select(material.base === 'frosted' ? 'graphite' : material.base)}>Reset this look</button>
    </details>
  </section>;
}
