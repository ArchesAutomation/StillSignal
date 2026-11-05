import { DEFAULT_OCEAN_SHARKS, parseOceanSharks, sharkPalette, type OceanShark } from "./shark-palettes";
import type { SharkSpec } from "./ascii-sharks/world";

export const APPEARANCE_KEY = "still-signal-appearance";
export type AppearancePreferences = {
  theme: "light" | "dark";
  shark: string;
  accent: string;
  sharks: OceanShark[];
  wallpaper: string;
  wallpaperDim: number;
};
export const defaultAppearance: AppearancePreferences = {
  theme: "dark", shark: "#87b9ca", accent: "#c5d7df",
  sharks: DEFAULT_OCEAN_SHARKS,
  wallpaper: "ocean", wallpaperDim: 25,
};
const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export function parseAppearance(value: unknown, light = false): AppearancePreferences {
  const saved = value && typeof value === "object" ? value as Partial<AppearancePreferences> : {};
  const shark = color(saved.shark, defaultAppearance.shark);
  let accent = color(saved.accent, defaultAppearance.accent);
  if (["#fc7c59", "#ff7654", "#ee957d"].includes(accent.toLowerCase())) accent = defaultAppearance.accent;
  return {
    theme: saved.theme === "light" || saved.theme === "dark" ? saved.theme : light ? "light" : "dark",
    shark, accent,
    sharks: parseOceanSharks(saved.sharks),
    wallpaper: typeof saved.wallpaper === "string" && /^(ocean|aurora|dusk|custom-[a-z0-9-]+)$/.test(saved.wallpaper) ? saved.wallpaper : "ocean",
    wallpaperDim: typeof saved.wallpaperDim === "number" && Number.isFinite(saved.wallpaperDim) ? Math.min(80, Math.max(0, saved.wallpaperDim)) : 25,
  };
}

export function oceanSharkSpecs(preferences: AppearancePreferences): SharkSpec[] {
  return preferences.sharks.map(shark => ({ key: shark.id, kind: shark.kind, size: shark.size, color: sharkPalette(shark.palette).color }));
}

export function readAppearance(): AppearancePreferences {
  if (typeof window === "undefined") return parseAppearance(null);
  let saved: unknown;
  try { saved = JSON.parse(window.localStorage.getItem(APPEARANCE_KEY) || "null"); } catch { /* Use defaults without storage. */ }
  return parseAppearance(saved, window.matchMedia("(prefers-color-scheme: light)").matches);
}

