'use client';

import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { useOptionalPreferences } from './glassyui/glass-provider';
import { DEFAULT_PLASMA, PLASMA_FLAGS, PLASMA_LOOKS, PLASMA_MATERIALS, PLASMA_RANGES, parsePlasmaPreferences, type PlasmaNumber, type PlasmaPreferences } from './glassyui/lib/plasma-settings';
import { getPlasmaStatus, getServerPlasmaStatus, subscribePlasmaStatus } from './glassyui/lib/plasma-status';
import { parseGlassMaterial } from './glassyui/lib/glass-material';

const GROUPS = ['Optics', 'Lighting', 'Movement', 'Surface', 'Backdrop & quality'];
const LOCKED = new Set(['stretch', 'flow', 'tension', 'blend', 'lean', 'edge', 'pointerDrop', 'pointerPull', 'ambientDrops', 'fuse', 'formIn', 'formOut', 'pulse']);
const STATUS_TEXT = { off: 'Nordify is active. Plasma effects are off.', loading: 'Preparing your effects…', active: 'Plasma effects are active.', fallback: 'Plasma is unavailable here. Your Nordify glass stays active.', paused: 'Plasma is paused for your accessibility or quality settings.' };

export function PlasmaMaterialSettings() {
  const { preferences, setPreferences } = useOptionalPreferences();
  const plasma = preferences.plasma;
  const id = useId();
  const status = useSyncExternalStore(subscribePlasmaStatus, getPlasmaStatus, getServerPlasmaStatus);
  const file = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const update = (patch: Partial<PlasmaPreferences>) => setPreferences({ plasma: parsePlasmaPreferences({ ...plasma, ...patch }) });

  const exportLook = () => {
    const blob = new Blob([JSON.stringify({ kind: 'still-signal-glass', version: 1, material: preferences.material, plasma }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'still-signal-glass.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Your look has been exported.');
  };
  const importLook = async (selected: File | undefined) => {
    if (!selected) return;
    try {
      if (selected.size > 32_768) throw new Error('Choose a glass look smaller than 32 KB.');
      const saved: unknown = JSON.parse(await selected.text());
      if (!saved || typeof saved !== 'object' || !('kind' in saved) || saved.kind !== 'still-signal-glass' || !('version' in saved) || saved.version !== 1 || !('material' in saved) || !('plasma' in saved) || !saved.material || typeof saved.material !== 'object' || !saved.plasma || typeof saved.plasma !== 'object' || Array.isArray(saved.material) || Array.isArray(saved.plasma)) throw new Error('Choose a Still Signal glass look exported from these settings.');
      // An imported look never switches on an engine without the user's toggle.
      setPreferences({ material: parseGlassMaterial(saved.material), plasma: parsePlasmaPreferences({ ...saved.plasma, enabled: plasma.enabled }) });
      setNotice('Look imported and saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not import this look.'); }
  };
  return <details className="glass-customize plasma-customize">
    <summary>Plasma effects</summary>
    <div className="plasma-settings-body">
      <p className="glass-settings-note">Keep Nordify’s clean glass, or enable the full Plasma material and motion engine. Changes save automatically on this device.</p>
      <label className="material-accessibility plasma-enable"><input type="checkbox" checked={plasma.enabled} onChange={event => update({ enabled: event.target.checked })} /> Enable Plasma effects</label>
      <p role="status" className="glass-settings-note">{plasma.enabled && status === 'off' ? STATUS_TEXT.loading : STATUS_TEXT[status]}</p>
      <div className="plasma-looks" role="group" aria-label="Plasma looks">
        {Object.entries(PLASMA_LOOKS).map(([name, look]) => <button key={name} type="button" onClick={() => { setPreferences({ plasma: { ...look, enabled: plasma.enabled } }); setNotice(`${name} applied.`); }}>{name}</button>)}
      </div>
      <label className="material-accessibility"><input type="checkbox" checked={plasma.cleanEdges} onChange={event => update({ cleanEdges: event.target.checked })} /> Keep edges clean</label>
      <p className="glass-settings-note">{plasma.cleanEdges ? 'Straight edges are locked. Switch this off to explore flowing edges, fusion, and pointer movement.' : 'Liquid movement is unlocked. Turn clean edges back on anytime.'}</p>
      <div className="plasma-field-grid">
        <div><label htmlFor={`${id}-material`}>Material</label><select id={`${id}-material`} value={plasma.material} onChange={event => update({ material: event.target.value as PlasmaPreferences['material'] })}>{PLASMA_MATERIALS.map(name => <option key={name} value={name}>{name[0].toUpperCase() + name.slice(1)}</option>)}</select></div>
        <label htmlFor={`${id}-tint`}>Tint color<input id={`${id}-tint`} type="color" value={plasma.tint} onChange={event => update({ tint: event.target.value })} /></label>
        <div><label htmlFor={`${id}-rim-color`}>Rim color</label><select id={`${id}-rim-color`} value={plasma.rimColor === 'tint' || plasma.rimColor === 'iridescent' ? plasma.rimColor : 'custom'} onChange={event => update({ rimColor: event.target.value === 'custom' ? '#c4e3ef' : event.target.value })}><option value="tint">Match tint</option><option value="iridescent">Iridescent</option><option value="custom">Custom</option></select></div>
        {plasma.rimColor.startsWith('#') ? <label htmlFor={`${id}-rim-custom`}>Custom rim color<input id={`${id}-rim-custom`} type="color" value={plasma.rimColor} onChange={event => update({ rimColor: event.target.value })} /></label> : null}
      </div>
      {GROUPS.map(group => <details key={group} className="plasma-control-group">
        <summary>{group}</summary>
        <div className="material-slider-grid">
          {(Object.keys(PLASMA_RANGES) as PlasmaNumber[]).filter(key => PLASMA_RANGES[key][4] === group).map(key => {
            const [min, max, step, label] = PLASMA_RANGES[key];
            const inputId = `${id}-${key}`;
            return <div key={key} className="material-slider"><div><label htmlFor={inputId}>{label}</label><output htmlFor={inputId}>{Number(plasma[key].toFixed(3))}</output></div>
              <input id={inputId} type="range" min={min} max={max} step={step} value={plasma[key]} disabled={plasma.cleanEdges && LOCKED.has(key)} onChange={event => update({ [key]: event.currentTarget.valueAsNumber })} />
            </div>;
          })}
        </div>
        {group === 'Movement' ? <div className="plasma-switch-grid">{(Object.keys(PLASMA_FLAGS) as (keyof typeof PLASMA_FLAGS)[]).filter(key => key !== 'cleanEdges' && key !== 'freezeOnScroll' && key !== 'fullBackdrop').map(key => <label key={key} className="material-accessibility"><input type="checkbox" checked={plasma[key]} disabled={plasma.cleanEdges && LOCKED.has(key)} onChange={event => update({ [key]: event.target.checked })} /> {PLASMA_FLAGS[key]}</label>)}</div> : null}
        {group === 'Backdrop & quality' ? <><label className="material-accessibility"><input type="checkbox" checked={plasma.fullBackdrop} onChange={event => update({ fullBackdrop: event.target.checked })} /> {PLASMA_FLAGS.fullBackdrop}</label><label className="material-accessibility"><input type="checkbox" checked={plasma.freezeOnScroll} onChange={event => update({ freezeOnScroll: event.target.checked })} /> {PLASMA_FLAGS.freezeOnScroll}</label><p className="glass-settings-note">Plasma bends your ocean or wallpaper behind each panel. Charts and text stay readable above it. Enable the entire backdrop for background grain and softness across the page. Higher detail uses more graphics power.</p></> : null}
      </details>)}
      <div className="plasma-actions"><button type="button" onClick={() => { setPreferences({ plasma: { ...DEFAULT_PLASMA, enabled: plasma.enabled } }); setNotice('Plasma settings reset to clean glass.'); }}>Reset effects</button><button type="button" onClick={exportLook}>Export look</button><button type="button" onClick={() => file.current?.click()}>Import look</button></div>
      <input ref={file} hidden type="file" accept="application/json,.json" aria-label="Import glass look file" onChange={event => { void importLook(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
      <p role="status" className="glass-settings-note">{notice}</p>
    </div>
  </details>;
}
