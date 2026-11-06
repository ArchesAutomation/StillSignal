"use client";
import { useEffect, useState } from "react";
import { useAppearance } from "./appearance-context";
import { BUILTIN_WALLPAPERS, listWallpapers, WALLPAPER_EVENT } from "@/lib/wallpapers";

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
  const { images } = useWallpaperLibrary();
  const custom = images.find(image => image.id === preferences.wallpaper);
  const builtin = BUILTIN_WALLPAPERS.find(image => image.id === preferences.wallpaper);
  const active = preferences.wallpaper !== "ocean" && Boolean(custom || builtin);
  useEffect(() => {
    document.documentElement.dataset.wallpaper = active ? "image" : "ocean";
    return () => { delete document.documentElement.dataset.wallpaper; };
  }, [active]);
  if (!active) return null;
  return <div aria-hidden="true" className="wallpaper-background" style={{ backgroundImage: custom ? `url("${custom.url}")` : builtin?.background }}><div style={{ opacity: preferences.wallpaperDim / 100 }} /></div>;
}
