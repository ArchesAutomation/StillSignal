'use client';

import { useId, type CSSProperties } from 'react';
import { useOptionalPreferences } from './glassyui/glass-provider';
import { GLASS_BOUNDS, GLASS_PRESETS, GLASS_PRESET_COPY, type GlassPreset, type GlassNumericKey, type GlassMaterial } from './glassyui/lib/glass-material';

export function GlassMaterialSettings({ compact = false }: { compact?: boolean }) {
  const { preferences, setPreferences } = useOptionalPreferences();
  const material = preferences.material;
  const id = useId();
  const select = (preset: GlassPreset) => setPreferences({ material: { ...GLASS_PRESETS[preset] } });
  const update = (patch: Partial<GlassMaterial>) => setPreferences({ material: { ...material, ...patch, preset: 'custom' } });
  const groups = [...new Set(Object.values(GLASS_BOUNDS).map(range => range.group))];
  return <section className={`glass-material-settings ${compact ? 'glass-material-compact' : ''}`} aria-label="Glass material">
    <div className="glass-material-heading"><strong>Your glass</strong><span>{material.preset === 'custom' ? 'Custom' : material.preset[0].toUpperCase() + material.preset.slice(1)}</span></div>
    <div className="glass-presets" role="group" aria-label="Glass presets">
      {(Object.keys(GLASS_PRESETS) as GlassPreset[]).map(preset => <button key={preset} type="button" aria-pressed={material.preset === preset} onClick={() => select(preset)} title={GLASS_PRESET_COPY[preset]}>{preset[0].toUpperCase() + preset.slice(1)}</button>)}
    </div>
    <p className="glass-preset-description">{GLASS_PRESET_COPY[material.base]}</p>
    <details className="glass-customize">
      <summary>Customize Glass</summary>
      <p className="glass-control-help">Shape controls how deep the curved edge reaches. Refraction changes the bending; reflections mirror the surroundings.</p>
      <label className="material-accessibility"><input type="checkbox" checked={material.pill} onChange={event => update({ pill: event.target.checked })} /> Full roundness (Nordify demo)</label>
      {groups.map(group => <fieldset className="glass-control-group" key={group}><legend>{group}</legend><div className="material-slider-grid">
        {(Object.keys(GLASS_BOUNDS) as GlassNumericKey[]).filter(key => GLASS_BOUNDS[key].group === group).map(key => {
          const range = GLASS_BOUNDS[key], inputId = `${id}-${key}`;
          const disabled = key === 'radius' && material.pill || (key === 'rim' || key === 'reflectStrength') && !material.reflect;
          return <div key={key} className="material-slider">
            <div><label htmlFor={inputId}>{range.label}</label><output htmlFor={inputId}>{key === 'radius' && material.pill ? 'Full' : `${Number(material[key].toFixed(2))}${range.unit}`}</output></div>
            <input id={inputId} type="range" min={range.min} max={range.max} step={range.step} value={material[key]} disabled={disabled} style={{ '--range-progress': `${(material[key] - range.min) / (range.max - range.min) * 100}%` } as CSSProperties} onChange={event => update({ [key]: event.currentTarget.valueAsNumber })} />
          </div>;
        })}
      </div></fieldset>)}
      <label className="material-accessibility"><input type="checkbox" checked={material.reflect} onChange={event => update({ reflect: event.target.checked })} /> Reflections</label>
      <div className="glass-color-controls">
        <label>Lighting treatment<select value={material.lighting} onChange={event => update({ lighting: event.target.value as GlassMaterial['lighting'] })}><option value="auto">Match theme</option><option value="light">Light background</option><option value="dark">Dark background</option></select></label>
        <label className="material-accessibility"><input type="checkbox" checked={material.tintColor === 'theme'} onChange={event => update({ tintColor: event.target.checked ? 'theme' : '#0c161d' })} /> Use theme tint</label>
        {(['tintColor', 'shadowColor', 'causticColor'] as const).map(key => <label key={key}>{key === 'tintColor' ? 'Tint Color' : key === 'shadowColor' ? 'Shadow Color' : 'Caustic Color'}<input type="color" value={material[key] === 'theme' ? '#0c161d' : material[key]} disabled={key === 'tintColor' && material.tintColor === 'theme'} onChange={event => update({ [key]: event.target.value })} /></label>)}
      </div>
      <button type="button" className="glass-reset" onClick={() => select(material.base)}>Reset to {material.base[0].toUpperCase() + material.base.slice(1)}</button>
    </details>
  </section>;
}
