"use client";
import { useEffect, useRef } from "react";
import { APPEARANCE_KEY, readAppearance, oceanSharkSpecs, type AppearancePreferences } from "@/lib/appearance-preferences";
import { OceanEngine } from "@/lib/ascii-sharks/engine";
export default function SharkBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // Let the renderer create the first context with alpha:false.
    if (!ref.current) return;
    const initial = readAppearance();
    let sharks = initial.sharks;
    const engine = new OceanEngine(ref.current, oceanSharkSpecs(initial));
    engine.refreshAppearance();
    const refresh = (event: Event) => {
      const preferences = (event as CustomEvent<AppearancePreferences>).detail ?? readAppearance();
      if (sharks !== preferences.sharks) {
        engine.setSharks(oceanSharkSpecs(preferences));
        sharks = preferences.sharks;
      }
      engine.refreshAppearance();
    };
    window.addEventListener(APPEARANCE_KEY, refresh);
    return () => { window.removeEventListener(APPEARANCE_KEY, refresh); engine.destroy(); };
  }, []);
  return <div className="shark-background" aria-hidden="true"><canvas ref={ref} /></div>;
}
