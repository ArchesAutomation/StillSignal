import type { RendererSettings, ShapeOptions } from '../plasma/renderer';

// Keep this module free of the renderer: settings are part of the small default bundle.
export const PLASMA_MATERIALS = ['plasma', 'crystal', 'metal', 'mercury', 'wood', 'stone', 'cloud'] as const;
export const PLASMA_RANGES = {
  refraction: [0, 3, .05, 'Refraction', 'Optics'],
  dispersion: [0, 3, .05, 'Color dispersion', 'Optics'],
  frost: [0, 1, .01, 'Frost', 'Optics'],
  opacity: [0, .9, .01, 'Tint opacity', 'Optics'],
  radius: [4, 40, 1, 'Corner radius', 'Optics'],
  thickness: [1, 40, 1, 'Thickness', 'Optics'],
  rim: [0, 3, .05, 'Rim strength', 'Lighting'],
  rimWidth: [0, 3, .05, 'Rim width', 'Lighting'],
  highlight: [0, 3, .05, 'Pointer highlight', 'Lighting'],
  edgeLine: [0, 3, .05, 'Edge line', 'Lighting'],
  shimmer: [0, 3, .05, 'Shimmer', 'Lighting'],
  shimmerSpeed: [.1, 30, .1, 'Shimmer speed', 'Lighting'],
  glow: [0, 3, .05, 'Glow', 'Lighting'],
  wash: [0, 3, .05, 'Color wash', 'Lighting'],
  elevation: [0, 1, .01, 'Elevation', 'Lighting'],
  lightX: [-1, 1, .05, 'Light horizontal', 'Lighting'],
  lightY: [-1, 1, .05, 'Light vertical', 'Lighting'],
  lightZ: [.1, 1, .05, 'Light depth', 'Lighting'],
  viscosity: [0, 1, .01, 'Viscosity', 'Movement'],
  stretch: [0, 2, .05, 'Stretch', 'Movement'],
  flow: [0, 2, .05, 'Edge flow', 'Movement'],
  tension: [0, 1, .01, 'Surface tension', 'Movement'],
  blend: [0, 60, 1, 'Fusion distance', 'Movement'],
  lean: [0, 12, .5, 'Pointer lean', 'Movement'],
  formSpeed: [.25, 3, .05, 'Formation speed', 'Movement'],
  roughness: [0, 1, .01, 'Roughness', 'Surface'],
  anisotropy: [0, 1, .01, 'Anisotropy', 'Surface'],
  edge: [0, 12, .5, 'Edge displacement', 'Surface'],
  edgeScale: [.005, .1, .005, 'Edge detail scale', 'Surface'],
  edgeSharpness: [0, 1, .05, 'Edge sharpness', 'Surface'],
  smoothness: [.5, 2, .05, 'Outline smoothing', 'Surface'],
  backgroundBlur: [0, 24, .5, 'Backdrop softness', 'Backdrop & quality'],
  grain: [0, 2, .05, 'Background grain', 'Backdrop & quality'],
  quality: [.5, 1.25, .05, 'Render detail', 'Backdrop & quality'],
} as const;
export type PlasmaNumber = keyof typeof PLASMA_RANGES;
export const PLASMA_FLAGS = {
  cleanEdges: 'Keep edges clean',
  pointerDrop: 'Pointer droplet', pointerPull: 'Pointer attraction', ambientDrops: 'Ambient droplets',
  fuse: 'Fuse nearby panels', formIn: 'Animate appearance', formOut: 'Animate disappearance',
  pulse: 'Press ripples', freezeOnScroll: 'Pause during touch scrolling',
  fullBackdrop: 'Apply effects to the entire backdrop',
} as const;
export type PlasmaPreferences = Record<PlasmaNumber, number> & Record<keyof typeof PLASMA_FLAGS, boolean> & {
  enabled: boolean;
  material: typeof PLASMA_MATERIALS[number];
  tint: string;
  rimColor: string;
};
export const DEFAULT_PLASMA: PlasmaPreferences = {
  enabled: false, cleanEdges: true, material: 'plasma', tint: '#9dbcc9', rimColor: 'tint',
  refraction: 1.2, dispersion: .25, frost: .08, opacity: .08, radius: 18, thickness: 18,
  rim: .35, rimWidth: .8, highlight: .6, edgeLine: .6, shimmer: 0, shimmerSpeed: 1,
  glow: 0, wash: 0, elevation: .25, lightX: -.4, lightY: -.6, lightZ: .7,
  viscosity: .65, stretch: .6, flow: .15, tension: .15, blend: 24, lean: 2, formSpeed: 1,
  roughness: .28, anisotropy: 0, edge: 0, edgeScale: .01, edgeSharpness: 0,
  smoothness: 1, backgroundBlur: 0, grain: 0, quality: .75,
  pointerDrop: false, pointerPull: false, ambientDrops: false, fuse: false,
  formIn: false, formOut: false, pulse: false, freezeOnScroll: true,
  fullBackdrop: false,
};
export const PLASMA_LOOKS = {
  'Clean glass': { ...DEFAULT_PLASMA },
  Liquid: { ...DEFAULT_PLASMA, cleanEdges: false, fuse: true, pointerPull: true, pulse: true, formIn: true, formOut: true, stretch: 1, flow: .3 },
  Aurora: { ...DEFAULT_PLASMA, rimColor: 'iridescent', dispersion: 1.2, shimmer: .6, glow: .2, tint: '#b1a4dd' },
  Mercury: { ...DEFAULT_PLASMA, material: 'mercury', tint: '#b9c7cc', opacity: .4, roughness: .12 },
} satisfies Record<string, PlasmaPreferences>;

export function parsePlasmaPreferences(value: unknown): PlasmaPreferences {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_PLASMA };
  for (const key of Object.keys(PLASMA_RANGES) as PlasmaNumber[]) {
    const number = saved[key], [min, max] = PLASMA_RANGES[key];
    if (typeof number === 'number' && Number.isFinite(number)) result[key] = Math.max(min, Math.min(max, number));
  }
  for (const key of ['enabled', ...Object.keys(PLASMA_FLAGS)] as ('enabled' | keyof typeof PLASMA_FLAGS)[]) {
    if (typeof saved[key] === 'boolean') result[key] = saved[key];
  }
  if (PLASMA_MATERIALS.some(material => material === saved.material)) result.material = saved.material as PlasmaPreferences['material'];
  if (typeof saved.tint === 'string' && /^#[\da-f]{6}$/i.test(saved.tint)) result.tint = saved.tint;
  if (typeof saved.rimColor === 'string' && (/^#[\da-f]{6}$/i.test(saved.rimColor) || ['tint', 'iridescent'].includes(saved.rimColor))) result.rimColor = saved.rimColor;
  return result;
}

export function plasmaRendererSettings(p: PlasmaPreferences, background: RendererSettings['background'], theme: 'dark' | 'light', reduceMotion: boolean): RendererSettings {
  const rigid = p.cleanEdges || reduceMotion;
  return {
    ...p, background, theme, reducedMotion: reduceMotion,
    colors: ['#080c0e', '#17343d', '#9dbcc9'], ground: p.fullBackdrop ? 'field' : 'clear', preserveDrawingBuffer: false,
    lightDir: [p.lightX, p.lightY, p.lightZ], maxSurfaces: 12,
    blend: rigid || !p.fuse ? 0 : p.blend,
    stretch: rigid ? 0 : p.stretch, flow: rigid ? 0 : p.flow, tension: rigid ? 0 : p.tension,
    edge: p.cleanEdges ? 0 : p.edge,
    pointerPull: !rigid && p.pointerPull, pointerDrop: !rigid && p.pointerDrop,
    ambientDrops: !rigid && p.ambientDrops, shimmer: reduceMotion ? 0 : p.shimmer,
    formIn: !rigid && p.formIn, formOut: !rigid && p.formOut,
  };
}

export function plasmaShapeSettings(p: PlasmaPreferences, reduceMotion: boolean, dashboard: boolean): ShapeOptions {
  return { radius: p.radius, lean: p.cleanEdges || reduceMotion || dashboard ? 0 : p.lean,
    fuse: !p.cleanEdges && !reduceMotion && p.fuse, formIn: !p.cleanEdges && !reduceMotion && p.formIn,
    formOut: !p.cleanEdges && !reduceMotion && p.formOut };
}
