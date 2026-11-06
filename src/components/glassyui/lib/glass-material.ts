export type GlassPreset = 'crystal' | 'graphite' | 'frosted';
export type GlassMaterial = {
  preset: GlassPreset | 'custom';
  base: GlassPreset;
  blur: number;
  rim: number;
  radius: number;
  reflectStrength: number;
  tint: number;
  reflect: boolean;
};

export const GLASS_PRESETS: Record<GlassPreset, GlassMaterial> = {
  crystal: { preset: 'crystal', base: 'crystal', blur: 2, rim: 1.3, radius: 18, reflectStrength: 2.5, tint: 5, reflect: true },
  graphite: { preset: 'graphite', base: 'graphite', blur: 6, rim: 1.05, radius: 18, reflectStrength: 1.6, tint: 26, reflect: true },
  frosted: { preset: 'frosted', base: 'frosted', blur: 18, rim: .7, radius: 18, reflectStrength: .8, tint: 42, reflect: true },
};

export const GLASS_BOUNDS = {
  blur: { min: 0, max: 24, step: .5, label: 'Blur', unit: ' px' },
  rim: { min: .4, max: 1.5, step: .05, label: 'Refraction Edge', unit: '×' },
  radius: { min: 4, max: 28, step: 1, label: 'Corner Roundness', unit: ' px' },
  reflectStrength: { min: 0, max: 3, step: .1, label: 'Reflection Intensity', unit: '×' },
  tint: { min: 0, max: 65, step: 1, label: 'Tint', unit: '%' },
} as const;

export function parseGlassMaterial(value: unknown): GlassMaterial {
  const saved = value && typeof value === 'object' ? value as Partial<GlassMaterial> : {};
  const isPreset = (key: unknown): key is GlassPreset => key === 'crystal' || key === 'graphite' || key === 'frosted';
  const base = isPreset(saved.base) ? saved.base : isPreset(saved.preset) ? saved.preset : 'graphite';
  const result = { ...GLASS_PRESETS[base], preset: saved.preset === 'custom' ? 'custom' : base, base } as GlassMaterial;
  for (const key of Object.keys(GLASS_BOUNDS) as (keyof typeof GLASS_BOUNDS)[]) {
    const number = saved[key], range = GLASS_BOUNDS[key];
    if (typeof number === 'number' && Number.isFinite(number)) result[key] = Math.min(range.max, Math.max(range.min, number));
  }
  if (typeof saved.reflect === 'boolean') result.reflect = saved.reflect;
  // A named preset always describes its documented values; overrides are Custom.
  if ((Object.keys(GLASS_BOUNDS) as (keyof typeof GLASS_BOUNDS)[]).some(key => result[key] !== GLASS_PRESETS[base][key]) || result.reflect !== GLASS_PRESETS[base].reflect) result.preset = 'custom';
  return result;
}

/** Convert only explicitly saved legacy values, without writing over the old keys. */
export function migrateGlassMaterial(saved: { blur?: number; frost?: number; refraction?: number; thickness?: number }): GlassMaterial {
  if (!Object.values(saved).some(value => typeof value === 'number')) return { ...GLASS_PRESETS.graphite };
  return parseGlassMaterial({ ...GLASS_PRESETS.graphite, preset: 'custom',
    blur: saved.blur ?? 6, tint: saved.frost === undefined ? 26 : saved.frost,
    rim: saved.refraction === undefined ? 1.05 : .4 + saved.refraction / 100 * 1.1,
    radius: saved.thickness === undefined ? 18 : 18 * saved.thickness,
  });
}

export function applyGlassMaterial(root: HTMLElement, material: GlassMaterial) {
  root.dataset.glassMaterial = material.preset;
  root.style.setProperty('--ss-glass-blur', `${material.blur}px`);
  root.style.setProperty('--ss-glass-radius', `${material.radius}px`);
  root.style.setProperty('--ss-glass-tint', String(material.tint / 100));
  root.style.setProperty('--ss-glass-reflection', String(material.reflect ? material.reflectStrength / 3 : 0));
}
