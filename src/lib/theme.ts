// Shared colour themes. Every colour in the app's CSS reads one of these tokens
// (exposed as --theme-* custom properties). Presets are hand-tuned; "custom"
// derives a full light + dark set from four picked colours with WCAG AA text.

export const TOKEN_NAMES = [
  "bg", "surface", "recess", "heading", "text", "muted", "link", "accent", "onAccent", "line",
  "prepTint", "prepInk", "journalTint", "journalInk", "doneTint", "doneInk",
  "prepDot", "journalDot", "doneDot", "danger", "dangerTint", "warning", "shadow",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Palette = Record<TokenName, string>;
export type Mode = "light" | "dark";
export type PaletteId = "signature" | "berry" | "custom";
export type CustomColours = { accent: string; prep: string; journal: string; done: string };
export type ThemeSettings = { palette: PaletteId; mode: Mode; custom: CustomColours };

export const PALETTE_LABELS: Record<PaletteId, string> = { signature: "Signature", berry: "Berry Sky", custom: "Customise" };
export const DEFAULT_CUSTOM: CustomColours = { accent: "#A3326E", prep: "#F0A8C6", journal: "#C3B4EE", done: "#8FBCEB" };
export const DEFAULT_THEME: ThemeSettings = { palette: "signature", mode: "light", custom: DEFAULT_CUSTOM };
export const CUSTOM_SWATCHES: Record<keyof CustomColours, string[]> = {
  accent: ["#6A55A3", "#A3326E", "#2A5FAF", "#2F7A45", "#C0482F", "#4B3FD1"],
  prep: ["#B9A8E4", "#F0A8C6", "#8FBCEB", "#8FD0A4", "#F2B58F", "#E9D27A"],
  journal: ["#8FC79A", "#C3B4EE", "#7FD3C4", "#9DB8F2", "#F1C27D", "#E8A0B8"],
  done: ["#E8A3BF", "#8FBCEB", "#B9A8E4", "#F2B58F", "#8FD0A4", "#C3B4EE"],
};

const hx = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const toH = (a: number[]) => "#" + a.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("").toUpperCase();
export const mix = (a: string, b: string, t: number) => { const A = hx(a), B = hx(b); return toH(A.map((x, i) => x + (B[i] - x) * t)); };
export const luminance = (s: string) => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = hx(s);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Moves `colour` towards `target` until it reaches `min` contrast against every background. */
function until(colour: string, target: string, against: string[], min: number) {
  let x = colour;
  for (let i = 0; i < 60 && against.some(g => contrast(x, g) < min); i++) x = mix(x, target, 0.08);
  return against.every(g => contrast(x, g) >= min) ? x : target;
}
export const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);

type Core = Omit<Palette, "recess" | "prepDot" | "journalDot" | "doneDot" | "danger" | "dangerTint" | "warning" | "shadow">;
function complete(c: Core, mode: Mode): Palette {
  const dark = mode === "dark";
  const dot = (tint: string, ink: string) => (dark ? ink : mix(tint, ink, 0.45));
  const dangerBase = dark ? "#FFB4A6" : "#A3361F";
  const dangerTint = mix(c.surface, dangerBase, dark ? 0.22 : 0.12);
  const danger = until(dangerBase, dark ? "#FFFFFF" : "#000000", [c.surface, c.bg, dangerTint], 4.6);
  return {
    ...c,
    recess: mix(c.bg, c.surface, 0.5),
    prepDot: dot(c.prepTint, c.prepInk),
    journalDot: dot(c.journalTint, c.journalInk),
    doneDot: dot(c.doneTint, c.doneInk),
    danger,
    dangerTint,
    warning: until(dark ? "#F2CC72" : "#8A5A00", dark ? "#FFFFFF" : "#000000", [c.surface, c.bg], 4.6),
    shadow: dark ? "#000000" : "#1F1A2B",
  };
}

const SIGNATURE: Record<Mode, Core> = {
  light: { bg: "#F6F4EF", surface: "#FFFDF8", heading: "#2B2836", text: "#3A3646", muted: "#5E5869", link: "#5A4791", accent: "#6A55A3", onAccent: "#FFFFFF", line: "#E4DFE8", prepTint: "#ECE6F6", prepInk: "#4A3C78", journalTint: "#DDEADF", journalInk: "#2E4A33", doneTint: "#F3E2E9", doneInk: "#7A3354" },
  dark: { bg: "#1B1922", surface: "#25222E", heading: "#F3EFF8", text: "#E2DDEA", muted: "#B5AEC2", link: "#CDBDF6", accent: "#BBA5F2", onAccent: "#1B1922", line: "#3A3648", prepTint: "#332C4A", prepInk: "#D9CBFF", journalTint: "#24362B", journalInk: "#A9D9B4", doneTint: "#43293A", doneInk: "#F5B8CF" },
};
const BERRY: Record<Mode, Core> = {
  light: { bg: "#FAF5F8", surface: "#FFFFFF", heading: "#2E1A27", text: "#422A3A", muted: "#6A5263", link: "#9A2C66", accent: "#A3326E", onAccent: "#FFFFFF", line: "#EEDFE8", prepTint: "#F9DDE9", prepInk: "#842657", journalTint: "#E8E1F7", journalInk: "#4F3D86", doneTint: "#DCEAF9", doneInk: "#1F4F8C" },
  dark: { bg: "#1C1219", surface: "#291B25", heading: "#F9EDF4", text: "#EBD9E3", muted: "#C2A9B8", link: "#F5A3CB", accent: "#F08DBE", onAccent: "#1C1219", line: "#3E2A37", prepTint: "#4A2238", prepInk: "#F8B6D5", journalTint: "#2E2847", journalInk: "#C7BCF5", doneTint: "#1B3354", doneInk: "#AFCFF7" },
};

export const PRESETS: Record<Exclude<PaletteId, "custom">, Record<Mode, Palette>> = {
  signature: { light: complete(SIGNATURE.light, "light"), dark: complete(SIGNATURE.dark, "dark") },
  berry: { light: complete(BERRY.light, "light"), dark: complete(BERRY.dark, "dark") },
};

/** Same derivation as the approved mockup: text shades and dark mode follow from four colours. */
export function derive(cu: CustomColours): Record<Mode, Palette> {
  const accent = isHex(cu.accent) ? cu.accent : DEFAULT_CUSTOM.accent;
  const slots = [cu.prep, cu.journal, cu.done].map((s, i) => (isHex(s) ? s : [DEFAULT_CUSTOM.prep, DEFAULT_CUSTOM.journal, DEFAULT_CUSTOM.done][i]));
  const L = {} as Core, D = {} as Core;
  L.bg = mix("#F8F7F4", accent, 0.03); L.surface = mix("#FFFFFF", accent, 0.012);
  L.heading = until(mix("#1F1C29", accent, 0.12), "#000000", [L.bg, L.surface], 7);
  L.text = until(mix("#33303F", accent, 0.1), "#000000", [L.bg, L.surface], 7);
  L.muted = until(mix("#5E5A6B", accent, 0.1), "#000000", [L.bg, L.surface], 4.6);
  L.line = mix(L.bg, accent, 0.12);
  L.accent = until(accent, "#000000", ["#FFFFFF"], 4.6); L.onAccent = "#FFFFFF";
  L.link = until(L.accent, "#000000", [L.surface, L.bg], 4.6);
  D.bg = mix("#121118", accent, 0.07); D.surface = mix(D.bg, "#FFFFFF", 0.06);
  D.heading = "#F3F1F8"; D.text = "#DEDBE8";
  D.muted = until("#ABA7BB", "#FFFFFF", [D.bg, D.surface], 4.6);
  D.line = mix(D.surface, "#FFFFFF", 0.1);
  D.accent = until(mix(accent, "#FFFFFF", 0.35), "#FFFFFF", [D.bg], 6); D.onAccent = D.bg;
  D.link = until(D.accent, "#FFFFFF", [D.surface, D.bg], 4.6);
  const keys = [["prepTint", "prepInk"], ["journalTint", "journalInk"], ["doneTint", "doneInk"]] as const;
  keys.forEach(([t, k], i) => {
    const s = slots[i];
    // Tints are pulled back towards the page colour until body text still reads on them.
    L[t] = until(mix("#FFFFFF", s, 0.24), "#FFFFFF", [L.text, L.heading], 4.8);
    L[k] = until(s, "#000000", [L[t], L.surface, L.bg], 4.8);
    D[t] = until(mix(D.bg, s, 0.3), D.bg, [D.text, D.heading], 4.8);
    D[k] = until(mix(s, "#FFFFFF", 0.25), "#FFFFFF", [D[t], D.surface, D.bg], 4.8);
  });
  // Quieter text and links also sit on the tinted cards, so they must read there too.
  L.muted = until(L.muted, "#000000", [L.bg, L.surface, L.prepTint, L.journalTint, L.doneTint], 4.6);
  L.link = until(L.link, "#000000", [L.bg, L.surface, L.prepTint, L.journalTint, L.doneTint], 4.6);
  D.muted = until(D.muted, "#FFFFFF", [D.bg, D.surface, D.prepTint, D.journalTint, D.doneTint], 4.6);
  D.link = until(D.link, "#FFFFFF", [D.bg, D.surface, D.prepTint, D.journalTint, D.doneTint], 4.6);
  // Text on an accent button must stay readable even for very light or very dark picks.
  if (contrast(D.onAccent, D.accent) < 4.6) D.onAccent = contrast("#FFFFFF", D.accent) > contrast(D.bg, D.accent) ? "#FFFFFF" : "#000000";
  return { light: complete(L, "light"), dark: complete(D, "dark") };
}

export function palette(settings: ThemeSettings): Palette {
  return settings.palette === "custom" ? derive(settings.custom)[settings.mode] : PRESETS[settings.palette][settings.mode];
}

export const cssName = (t: TokenName) => "--theme-" + t.replace(/[A-Z]/g, c => "-" + c.toLowerCase());

/** Pairs of (foreground, background) tokens that must meet WCAG AA (4.5:1) for normal text. */
export const TEXT_PAIRS: [TokenName, TokenName][] = [
  ["heading", "bg"], ["heading", "surface"], ["text", "bg"], ["text", "surface"], ["text", "recess"],
  ["muted", "bg"], ["muted", "surface"], ["muted", "recess"], ["link", "bg"], ["link", "surface"],
  ["onAccent", "accent"], ["prepInk", "prepTint"], ["prepInk", "surface"], ["journalInk", "journalTint"],
  ["journalInk", "surface"], ["doneInk", "doneTint"], ["doneInk", "surface"], ["heading", "prepTint"],
  ["heading", "journalTint"], ["heading", "doneTint"], ["text", "prepTint"], ["text", "journalTint"],
  ["text", "doneTint"], ["danger", "surface"], ["danger", "bg"], ["danger", "dangerTint"], ["warning", "surface"],
  ["muted", "prepTint"], ["muted", "journalTint"], ["muted", "doneTint"],
  ["link", "prepTint"], ["link", "journalTint"], ["link", "doneTint"],
];

export const themeKey = (owner: string) => `ss-theme:${owner}`;
export function parseTheme(raw: unknown): ThemeSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemeSettings>;
  const c = (v.custom && typeof v.custom === "object" ? v.custom : {}) as Partial<CustomColours>;
  return {
    palette: v.palette === "berry" || v.palette === "custom" ? v.palette : "signature",
    mode: v.mode === "dark" ? "dark" : "light",
    custom: {
      accent: isHex(c.accent) ? c.accent.toUpperCase() : DEFAULT_CUSTOM.accent,
      prep: isHex(c.prep) ? c.prep.toUpperCase() : DEFAULT_CUSTOM.prep,
      journal: isHex(c.journal) ? c.journal.toUpperCase() : DEFAULT_CUSTOM.journal,
      done: isHex(c.done) ? c.done.toUpperCase() : DEFAULT_CUSTOM.done,
    },
  };
}
export function loadTheme(owner: string): ThemeSettings {
  try { return parseTheme(JSON.parse(localStorage.getItem(themeKey(owner)) || "{}")); } catch { return DEFAULT_THEME; }
}
export function saveTheme(owner: string, settings: ThemeSettings) {
  try { localStorage.setItem(themeKey(owner), JSON.stringify(settings)); } catch {}
  window.dispatchEvent(new CustomEvent("ss-theme-change", { detail: settings }));
}

/** Applies a theme to <html>. Presets come from theme.css; custom colours are set inline. */
export function applyTheme(settings: ThemeSettings, root: HTMLElement = document.documentElement) {
  root.dataset.palette = settings.palette;
  root.dataset.mode = settings.mode;
  root.style.colorScheme = settings.mode;
  const custom = settings.palette === "custom" ? palette(settings) : undefined;
  for (const t of TOKEN_NAMES) {
    if (custom) root.style.setProperty(cssName(t), custom[t]);
    else root.style.removeProperty(cssName(t));
  }
}
