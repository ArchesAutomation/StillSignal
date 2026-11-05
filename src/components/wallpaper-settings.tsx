"use client";
import { useId, useRef, useState, type CSSProperties } from "react";
import { useAppearance } from "./appearance-context";
import { useOptionalPreferences } from "./glassyui/glass-provider";
import { GlassPanel } from "./glassyui/glass-panel";
import { GlassButton } from "./glassyui/glass-button";
import { useWallpaperLibrary } from "./wallpaper-background";
import { BUILTIN_WALLPAPERS, deleteWallpaper, saveWallpaper } from "@/lib/wallpapers";

const PRESETS = [
  { name: "Clear", blur: 4, frost: 3, refraction: 25, thickness: .65 },
  { name: "Balanced", blur: 12, frost: 8, refraction: 35, thickness: 1 },
  { name: "Frosted", blur: 24, frost: 22, refraction: 15, thickness: 1.2 },
];

function MaterialSlider({ label, hint, value, max, min = 0, step = 1, unit = "%", onChange }: {
  label: string; hint: string; value: number; max: number; min?: number; step?: number; unit?: string; onChange: (value: number) => void;
}) {
  const id = useId();
  return <div className="material-slider">
    <div><label htmlFor={id}>{label}</label><output htmlFor={id}>{Number(value.toFixed(2))}{unit}</output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} style={{ "--range-progress": `${(value - min) / (max - min) * 100}%` } as CSSProperties} onChange={event => onChange(Number(event.target.value))} aria-describedby={`${id}-hint`} />
    <small id={`${id}-hint`}>{hint}</small>
  </div>;
}

export default function WallpaperSettings() {
  const { preferences: appearance, update } = useAppearance();
  const { preferences, setPreferences } = useOptionalPreferences();
  const { images, error: storageError } = useWallpaperLibrary();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const choices = [...BUILTIN_WALLPAPERS, ...images.map(image => ({ id: image.id, name: image.name, background: `url("${image.url}")` }))];
  const selected = choices.find(image => image.id === appearance.wallpaper);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError("");
    try { const image = await saveWallpaper(file); update({ wallpaper: image.id }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this wallpaper. Try another image."); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  const remove = async () => {
    setBusy(true); setError("");
    try { await deleteWallpaper(appearance.wallpaper); update({ wallpaper: "ocean" }); }
    catch { setError("Could not remove this wallpaper. Please try again."); }
    finally { setBusy(false); }
  };
  return <section className="settings-card wallpaper-settings" aria-labelledby="wallpaper-heading">
    <header><span className="material-eyebrow">APPEARANCE STUDIO</span><h2 id="wallpaper-heading">Wallpaper & glass</h2><p>A backdrop you love. Glass that feels like you.</p></header>
    <div className="wallpaper-preview" style={{ backgroundImage: selected?.background ?? BUILTIN_WALLPAPERS[0].background }}>
      <div className="wallpaper-preview-dim" style={{ opacity: appearance.wallpaperDim / 100 }} />
      <GlassPanel preset="control" lens className="wallpaper-preview-card"><span>YOUR EVERYDAY, REFINED</span><strong>A little more clarity.</strong><p>Changes appear throughout your workspace.</p><GlassButton type="button" lens={false} onClick={() => setPreferences(PRESETS[1])}>Balanced glass</GlassButton></GlassPanel>
      <span className="wallpaper-preview-caption">LIVE MATERIAL PREVIEW</span>
    </div>
    <div className="wallpaper-section-heading"><h3>Your wallpaper</h3><span>{images.length} / 8 custom</span></div>
    <div className="wallpaper-gallery" aria-label="Wallpaper library">
      {choices.map(choice => <button key={choice.id} type="button" disabled={busy} aria-pressed={appearance.wallpaper === choice.id} onClick={() => update({ wallpaper: choice.id })}><span style={{ backgroundImage: choice.background }} /><span>{choice.name}</span></button>)}
    </div>
    <div className="wallpaper-actions"><GlassButton type="button" lens={false} disabled={busy || images.length >= 8 || Boolean(storageError)} onClick={() => fileInput.current?.click()}>{busy ? "Working…" : "Upload wallpaper"}</GlassButton>{appearance.wallpaper.startsWith("custom-") && <GlassButton type="button" lens={false} disabled={busy} onClick={remove}>Remove selected</GlassButton>}</div>
    <input ref={fileInput} type="file" hidden aria-label="Upload custom wallpaper" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => void upload(event.target.files?.[0])} />
    <p className="wallpaper-local-note">JPG, PNG, WebP or AVIF · Up to 12 MB · Saved on this browser only</p>
    {(error || storageError) && <p role="alert">{error || storageError}</p>}
    {appearance.wallpaper !== "ocean" && <MaterialSlider label="Wallpaper dimming" hint="Soften bright images behind your workspace." value={appearance.wallpaperDim} max={80} onChange={wallpaperDim => update({ wallpaperDim })} />}
    <div className="wallpaper-section-heading"><h3>Your glass</h3><GlassButton type="button" variant="ghost" lens={false} onClick={() => setPreferences(PRESETS[1])}>Reset glass</GlassButton></div>
    <div className="glass-presets" aria-label="Glass presets">{PRESETS.map(preset => <button key={preset.name} type="button" aria-pressed={preferences.blur === preset.blur && preferences.frost === preset.frost && preferences.refraction === preset.refraction && preferences.thickness === preset.thickness} onClick={() => setPreferences(preset)}>{preset.name}</button>)}</div>
    <div className="material-slider-grid">
      <MaterialSlider label="Refraction" hint="How strongly the glass edges bend the backdrop." value={preferences.refraction} max={100} onChange={refraction => setPreferences({ refraction })} />
      <MaterialSlider label="Blur" hint="How much detail passes through the surface." value={preferences.blur} max={32} unit=" px" onChange={blur => setPreferences({ blur })} />
      <MaterialSlider label="Frostiness" hint="A soft veil that gives text more breathing room." value={preferences.frost} max={40} onChange={frost => setPreferences({ frost })} />
      <MaterialSlider label="Thickness" hint="The depth and curvature of the glass rim." value={preferences.thickness} min={.25} max={2} step={.05} unit="×" onChange={thickness => setPreferences({ thickness })} />
    </div>
    <p className="wallpaper-local-note">Live edge refraction is available in Chromium browsers. Other browsers retain the frosted glass finish.</p>
    <label className="material-accessibility"><input type="checkbox" checked={preferences.reduceTransparency} onChange={event => setPreferences({ reduceTransparency: event.target.checked })} /> Reduce transparency for easier reading</label>
  </section>;
}
