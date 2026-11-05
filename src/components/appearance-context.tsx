"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePreferences } from "./glassyui/glass-provider";
import { APPEARANCE_KEY, defaultAppearance, parseAppearance, readAppearance, type AppearancePreferences } from "@/lib/appearance-preferences";
import { sameOceanSharks } from "@/lib/shark-palettes";

type AppearanceUpdate = Partial<AppearancePreferences> | ((current: AppearancePreferences) => Partial<AppearancePreferences>);
type AppearanceState = { preferences: AppearancePreferences; update: (value: AppearanceUpdate) => void };
const Context = createContext<AppearanceState>({ preferences: defaultAppearance, update: () => {} });
export const useAppearance = () => useContext(Context);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaultAppearance);
  const [ready, setReady] = useState(false);
  const latest = useRef(defaultAppearance);
  const pendingFrame = useRef(0);
  const { setPreferences: setGlassPreferences } = usePreferences();
  const update = useCallback((value: AppearanceUpdate) => {
    const patch = typeof value === "function" ? value(latest.current) : value;
    const next = parseAppearance({ ...latest.current, ...patch });
    if (sameOceanSharks(next.sharks, latest.current.sharks)) next.sharks = latest.current.sharks;
    latest.current = next;
    // Native color pickers can emit many inputs in one frame. Apply only the last.
    if (!pendingFrame.current) pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = 0;
      const next = latest.current;
      setPreferences(previous => previous.theme === next.theme && previous.shark === next.shark && previous.accent === next.accent && previous.sharks === next.sharks && previous.wallpaper === next.wallpaper && previous.wallpaperDim === next.wallpaperDim ? previous : next);
    });
  }, []);
  useEffect(() => {
    const saved = readAppearance();
    latest.current = saved;
    setPreferences(saved);
    setReady(true);
    const save = () => {
      try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(latest.current)); } catch { /* Keep working without storage. */ }
    };
    window.addEventListener("pagehide", save);
    return () => { cancelAnimationFrame(pendingFrame.current); pendingFrame.current = 0; window.removeEventListener("pagehide", save); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Only theme changes should update every consumer of the glass provider.
    document.documentElement.dataset.theme = preferences.theme;
    setGlassPreferences({ theme: preferences.theme });
  }, [preferences.theme, ready, setGlassPreferences]);
  useEffect(() => {
    if (!ready) return;
    const style = document.documentElement.style;
    if (style.getPropertyValue("--shark-color") !== preferences.shark) style.setProperty("--shark-color", preferences.shark);
    window.dispatchEvent(new CustomEvent(APPEARANCE_KEY, { detail: preferences }));
  }, [preferences.shark, preferences.sharks, preferences.theme, ready]);
  useEffect(() => {
    if (ready) document.documentElement.style.setProperty("--accent-color", preferences.accent);
  }, [preferences.accent, ready]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(preferences)); } catch { /* Keep working without storage. */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [preferences, ready]);
  const value = useMemo(() => ({ preferences, update }), [preferences, update]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
