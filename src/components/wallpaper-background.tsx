"use client";
import { useEffect, useState } from "react";
import { useAppearance } from "./appearance-context";
import { BUILTIN_WALLPAPERS, listWallpapers, WALLPAPER_EVENT } from "@/lib/wallpapers";
import { useOptionalPreferences } from './glassyui/glass-provider';
import { paintWallpaperBackdrop } from './glassyui/lib/wallpaper-backdrop';

export function useWallpaperLibrary() {
  const [images, setImages] = useState<{ id: string; name: string; url: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    let urls: string[] = [];
    const refresh = async () => {
      const request = ++revision;
      try {
        const saved = await listWallpapers();
        if (disposed || request !== revision) return;
        const next = saved.map(image => ({ id: image.id, name: image.name, url: URL.createObjectURL(image.image) }));
        urls.forEach(url => URL.revokeObjectURL(url));
        urls = next.map(image => image.url);
        setImages(next);
        setError("");
      } catch { if (!disposed) setError("Wallpaper storage is unavailable in this browser."); }
    };
    void refresh();
    window.addEventListener(WALLPAPER_EVENT, refresh);
    return () => { disposed = true; urls.forEach(url => URL.revokeObjectURL(url)); window.removeEventListener(WALLPAPER_EVENT, refresh); };
  }, []);
  return { images, error };
}

export default function WallpaperBackground() {
  const { preferences } = useAppearance();
  const { preferences: glass } = useOptionalPreferences();
  const { images } = useWallpaperLibrary();
  const custom = images.find(image => image.id === preferences.wallpaper);
  const builtin = BUILTIN_WALLPAPERS.find(image => image.id === preferences.wallpaper);
  const active = preferences.wallpaper !== "ocean" && Boolean(custom || builtin);
  useEffect(() => {
    if (!active || !glass.plasma.enabled) return;
    const canvas = document.createElement('canvas');
    canvas.hidden = true;
    canvas.setAttribute('aria-hidden', 'true');
    const image = custom ? new Image() : undefined;
    let disposed = false;
    const paint = () => {
      if (disposed || image && !image.naturalWidth) return;
      paintWallpaperBackdrop(canvas, preferences.wallpaper, preferences.wallpaperDim, image);
      canvas.setAttribute('data-glass-backdrop', '');
      if (!canvas.isConnected) document.body.append(canvas);
      window.dispatchEvent(new Event('still-signal-glass-backdrop'));
    };
    if (image) { image.onload = paint; image.src = custom!.url; } else paint();
    window.addEventListener('resize', paint);
    return () => {
      disposed = true; window.removeEventListener('resize', paint);
      if (image) image.onload = null;
      canvas.remove(); window.dispatchEvent(new Event('still-signal-glass-backdrop'));
    };
  }, [active, glass.plasma.enabled, custom, preferences.wallpaper, preferences.wallpaperDim]);
  useEffect(() => {
    document.documentElement.dataset.wallpaper = active ? "image" : "ocean";
    return () => { delete document.documentElement.dataset.wallpaper; };
  }, [active]);
  if (!active) return null;
  return <div aria-hidden="true" className="wallpaper-background" style={{ backgroundImage: custom ? `url("${custom.url}")` : builtin?.background }}><div style={{ opacity: preferences.wallpaperDim / 100 }} /></div>;
}
