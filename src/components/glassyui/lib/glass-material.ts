export const GLASS_BOUNDS = {
  blur: { min: 0, max: 32, step: .5, label: 'Blur', unit: ' px', group: 'Optics' },
  refractionStrength: { min: 0, max: 2, step: .05, label: 'Refraction Edge', unit: '×', group: 'Optics' },
  lensDepth: { min: 0, max: 100, step: 1, label: 'Lens Depth', unit: '%', group: 'Optics' },
  radius: { min: 4, max: 160, step: 1, label: 'Corner Roundness', unit: ' px', group: 'Optics' },
  saturate: { min: 0, max: 3, step: .05, label: 'Background Saturation', unit: '×', group: 'Optics' },
  rim: { min: .4, max: 2, step: .05, label: 'Reflection Width', unit: '×', group: 'Reflections' },
  reflectStrength: { min: 0, max: 5, step: .1, label: 'Reflection Intensity', unit: '×', group: 'Reflections' },
  tint: { min: 0, max: 95, step: 1, label: 'Tint', unit: '%', group: 'Surface' },
  underlay: { min: 0, max: 50, step: .5, label: 'Surface Veil', unit: '%', group: 'Surface' },
  specular: { min: 0, max: 100, step: 1, label: 'Edge Highlight', unit: '%', group: 'Edge lighting' },
  glintBrightness: { min: .5, max: 3, step: .05, label: 'Lit Edge Brightness', unit: '×', group: 'Edge lighting' },
  glintSaturation: { min: 0, max: 5, step: .1, label: 'Lit Edge Saturation', unit: '×', group: 'Edge lighting' },
  rimBrightness: { min: .3, max: 2, step: .05, label: 'Unlit Edge Brightness', unit: '×', group: 'Edge lighting' },
  rimSaturation: { min: 0, max: 5, step: .1, label: 'Unlit Edge Saturation', unit: '×', group: 'Edge lighting' },
  foldBrightness: { min: .5, max: 2, step: .05, label: 'Fold Brightness', unit: '×', group: 'Edge lighting' },
  foldSaturation: { min: 0, max: 5, step: .1, label: 'Fold Saturation', unit: '×', group: 'Edge lighting' },
  causticOpacity: { min: 0, max: 100, step: 1, label: 'Caustic Glow', unit: '%', group: 'Light & shadow' },
  shadowOpacity: { min: 0, max: 100, step: 1, label: 'Shadow', unit: '%', group: 'Light & shadow' },
  lightingScale: { min: .25, max: 2, step: .05, label: 'Lighting Size', unit: '×', group: 'Light & shadow' },
} as const;
export type GlassNumericKey = keyof typeof GLASS_BOUNDS;
export type GlassPreset = 'frosted' | 'bubbly' | 'clear' | 'graphite';
// Keep persisted material IDs stable while swapping the two display names.
export const GLASS_PRESET_LABELS: Record<GlassPreset | 'custom', string> = {
  frosted: 'Frosted', bubbly: 'Clear', clear: 'Bubbly', graphite: 'Graphite', custom: 'Custom',
};
export type GlassMaterial = Record<GlassNumericKey, number> & {
  preset: GlassPreset | 'custom'; base: GlassPreset; reflect: boolean; pill: boolean;
  lighting: 'auto' | 'light' | 'dark'; tintColor: string; shadowColor: string; causticColor: string;
};
const optics = {
  blur: 2.5, refractionStrength: 1, lensDepth: 0, rim: 1.1, radius: 30, saturate: 1.1,
  reflectStrength: 2.5, tint: 0, underlay: 14, specular: 13,
  glintBrightness: 1.35, glintSaturation: 3.1, rimBrightness: .84, rimSaturation: 2.2,
  foldBrightness: 1.08, foldSaturation: 1.3, causticOpacity: 70, shadowOpacity: 35,
  lightingScale: 1, reflect: true, pill: false, lighting: 'auto' as const,
  tintColor: 'theme', shadowColor: '#20313d', causticColor: '#ffffff',
};
export const GLASS_PRESETS: Record<GlassPreset, GlassMaterial> = {
  frosted: { ...optics, preset: 'frosted', base: 'frosted', blur: 20, refractionStrength: .25, rim: .7, radius: 18, saturate: .95, reflectStrength: .8, tint: 82, underlay: 10, specular: 12, causticOpacity: 3, shadowOpacity: 8 },
  bubbly: { ...optics, preset: 'bubbly', base: 'bubbly', lensDepth: 100, radius: 48, pill: false, refractionStrength: 1.4, blur: 1, underlay: 3, shadowOpacity: 10, causticOpacity: 15, lighting: 'auto' },
  clear: { ...optics, preset: 'clear', base: 'clear', blur: 2, refractionStrength: .65, rim: 1.05, reflectStrength: 1.6, tint: 4, underlay: 3, specular: 18, causticOpacity: 8, shadowOpacity: 10 },
  graphite: { ...optics, preset: 'graphite', base: 'graphite', blur: 6, refractionStrength: 1.05 / 1.3, rim: 1.05, radius: 18, reflectStrength: 1.6, tint: 26, underlay: 1.5, specular: 16.4, glintBrightness: 1.45, glintSaturation: 1.2, rimBrightness: 1.25, rimSaturation: 1.1, causticOpacity: 3.5, shadowOpacity: 6, lighting: 'dark' },
};
export const GLASS_PRESET_COPY: Record<GlassPreset, string> = {
  frosted: 'Opaque and calm. Easier to read.', bubbly: 'Clear with pronounced refraction and reflections.',
  clear: 'Transparent with gentler distortion.', graphite: 'A darker tint with balanced reflections.',
};
const color = (value: unknown, fallback: string, theme = false) => typeof value === 'string' && (/^#[0-9a-f]{6}$/i.test(value) || theme && value === 'theme') ? value : fallback;
export function parseGlassMaterial(value: unknown): GlassMaterial {
  const saved: Record<string, unknown> = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const presetKey = (key: unknown): GlassPreset | undefined => key === 'crystal' ? 'clear' : key === 'frosted' || key === 'bubbly' || key === 'clear' || key === 'graphite' ? key : undefined;
  const base = presetKey(saved.base) ?? presetKey(saved.preset) ?? 'graphite';
  const result: GlassMaterial = { ...GLASS_PRESETS[base], preset: saved.preset === 'custom' ? 'custom' : base, base };
  for (const key of Object.keys(GLASS_BOUNDS) as GlassNumericKey[]) {
    const number = saved[key], range = GLASS_BOUNDS[key];
    if (typeof number === 'number' && Number.isFinite(number)) result[key] = Math.min(range.max, Math.max(range.min, number));
  }
  // Preserve the previous coupling when loading a saved pre-upgrade material.
  if (saved.refractionStrength === undefined && typeof saved.rim === 'number' && Number.isFinite(saved.rim)) result.refractionStrength = result.rim / 1.3;
  for (const key of ['reflect', 'pill'] as const) if (typeof saved[key] === 'boolean') result[key] = saved[key];
  // Named Bubbly uses rounder physical corners; explicit Custom shapes stay intact.
  if (saved.preset === 'bubbly') { result.pill = false; result.radius = GLASS_PRESETS.bubbly.radius; }
  if (saved.lighting === 'auto' || saved.lighting === 'light' || saved.lighting === 'dark') result.lighting = saved.lighting;
  result.tintColor = color(saved.tintColor, result.tintColor, true);
  result.shadowColor = color(saved.shadowColor, result.shadowColor);
  result.causticColor = color(saved.causticColor, result.causticColor);
  if ((Object.keys(result) as (keyof GlassMaterial)[]).some(key => key !== 'preset' && key !== 'base' && result[key] !== GLASS_PRESETS[base][key])) result.preset = 'custom';
  return result;
}
export function migrateGlassMaterial(saved: { blur?: number; frost?: number; refraction?: number; thickness?: number }): GlassMaterial {
  if (!Object.values(saved).some(value => typeof value === 'number')) return { ...GLASS_PRESETS.graphite };
  const rim = saved.refraction === undefined ? 1.05 : .4 + saved.refraction / 100 * 1.1;
  return parseGlassMaterial({ ...GLASS_PRESETS.graphite, preset: 'custom', blur: saved.blur ?? 6,
    tint: saved.frost ?? 26, rim, refractionStrength: rim / 1.3, radius: saved.thickness === undefined ? 18 : 18 * saved.thickness });
}
export function applyGlassMaterial(root: HTMLElement, material: GlassMaterial) {
  root.dataset.glassMaterial = material.preset;
  root.dataset.glassPill = String(material.pill);
  root.dataset.glassLighting = material.lighting;
  const css: Record<string, string | number> = {
    blur: `${material.blur}px`, radius: `${material.pill ? 9999 : material.radius}px`, tint: material.tint / 100,
    reflection: material.reflect ? material.reflectStrength / 5 : 0, rim: material.rim, saturation: material.saturate,
    underlay: material.underlay / 100, specular: material.specular / 100,
    'glint-brightness': material.glintBrightness, 'glint-saturation': material.glintSaturation,
    'rim-brightness': material.rimBrightness, 'rim-saturation': material.rimSaturation,
    'fold-brightness': material.foldBrightness, 'fold-saturation': material.foldSaturation,
    caustic: material.causticOpacity / 100, shadow: material.shadowOpacity / 100, 'lighting-scale': material.lightingScale,
    'shadow-color': material.shadowColor, 'caustic-color': material.causticColor,
    rgb: material.tintColor === 'theme' ? '' : `${parseInt(material.tintColor.slice(1, 3), 16)} ${parseInt(material.tintColor.slice(3, 5), 16)} ${parseInt(material.tintColor.slice(5, 7), 16)}`,
  };
  for (const [key, value] of Object.entries(css)) {
    if (value === '') root.style.removeProperty(`--ss-glass-${key}`);
    else root.style.setProperty(`--ss-glass-${key}`, String(value));
  }
}
