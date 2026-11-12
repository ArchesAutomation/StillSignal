"use client";
import {
  CUSTOM_SWATCHES, DEFAULT_THEME, PALETTE_LABELS, PRESETS, applyTheme, derive, loadTheme, parseTheme, saveTheme,
  type CustomColours, type PaletteId, type ThemeSettings,
} from "@/lib/theme";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Account-scoped theme on this device (ss-theme:<owner>), kept in sync across controls and tabs. */
export function useTheme(owner: string) {
  const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);
  useLayoutEffect(() => { setTheme(loadTheme(owner)); }, [owner]);
  useEffect(() => {
    const changed = (e: Event) => setTheme(parseTheme((e as CustomEvent).detail));
    const storage = (e: StorageEvent) => { if (e.key === `ss-theme:${owner}`) setTheme(loadTheme(owner)); };
    window.addEventListener("ss-theme-change", changed);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener("ss-theme-change", changed); window.removeEventListener("storage", storage); };
  }, [owner]);
  const update = useCallback((patch: Partial<ThemeSettings>) => {
    // Read the saved value so rapid changes from different controls never overwrite each other.
    const current = loadTheme(owner);
    const next = parseTheme({ ...current, ...patch, custom: { ...current.custom, ...patch.custom } });
    setTheme(next);
    saveTheme(owner, next);
  }, [owner]);
  return { theme, update };
}

/** Applies the signed-in account's theme to the page. Renders nothing. */
export function ThemeController({ owner }: { owner: string }) {
  const { theme, update } = useTheme(owner);
  useLayoutEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    // Lets review scripts switch themes the same way the controls do.
    const set = (e: Event) => update(parseTheme((e as CustomEvent).detail));
    window.addEventListener("ss-theme-set", set);
    return () => window.removeEventListener("ss-theme-set", set);
  }, [update]);
  useEffect(() => () => {
    // Signing out returns the page to the default theme.
    const root = document.documentElement;
    applyTheme(DEFAULT_THEME, root);
    delete root.dataset.palette; delete root.dataset.mode; root.style.removeProperty("color-scheme");
  }, []);
  return null;
}

/** Sun / moon switch for the top bar. */
export function ModeSwitch({ owner }: { owner: string }) {
  const { theme, update } = useTheme(owner);
  const dark = theme.mode === "dark";
  return (
    <button type="button" role="switch" aria-checked={dark} className="ss-mode-switch" onClick={() => update({ mode: dark ? "light" : "dark" })}
      aria-label="Dark mode" title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      <span className="ss-mode-switch-track" aria-hidden="true">
        <span className="ss-mode-switch-thumb">
          {dark ? (
            <svg viewBox="0 0 16 16"><path d="M10.8 1.6a6.5 6.5 0 1 0 3.6 10.7A5.6 5.6 0 0 1 10.8 1.6Z" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.2" fill="currentColor" /><g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 .9v1.8M8 13.3v1.8M.9 8h1.8M13.3 8h1.8M3 3l1.3 1.3M11.7 11.7 13 13M3 13l1.3-1.3M11.7 4.3 13 3" /></g></svg>
          )}
        </span>
      </span>
    </button>
  );
}

const SLOTS: [keyof CustomColours, string][] = [
  ["accent", "Stillness and main buttons"],
  ["prep", "Preparation"],
  ["journal", "Daily journal"],
  ["done", "Done for the day"],
];

/** Preset cards, light/dark choice and the four custom colours. Used in Settings and the Home "Colours" dialog. */
export function ThemePicker({ owner }: { owner: string }) {
  const { theme, update } = useTheme(owner);
  // Each card previews that palette's own colours in the current mode, whatever theme is active.
  const preview = (id: PaletteId) => {
    const p = id === "custom" ? derive(theme.custom)[theme.mode] : PRESETS[id][theme.mode];
    return [p.accent, p.prepDot, p.journalDot, p.doneDot];
  };
  return (
    <div className="ss-theme-picker">
      <fieldset>
        <legend>Palette</legend>
        <div className="ss-theme-presets">
          {(Object.keys(PALETTE_LABELS) as PaletteId[]).map(id => (
            <label key={id} className="ss-theme-preset" data-preset={id}>
              <input type="radio" name={`ss-palette-${owner}`} checked={theme.palette === id} onChange={() => update({ palette: id })} />
              <span className="ss-theme-preset-dots" aria-hidden="true">
                {preview(id).map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
              <span>{PALETTE_LABELS[id]}{id === "signature" ? <small>Default</small> : null}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Mode</legend>
        <div className="ss-theme-modes" role="group">
          {(["light", "dark"] as const).map(m => (
            <button key={m} type="button" aria-pressed={theme.mode === m} onClick={() => update({ mode: m })}>{m === "light" ? "Light" : "Dark"}</button>
          ))}
        </div>
      </fieldset>
      {theme.palette === "custom" && (
        <fieldset className="ss-theme-custom">
          <legend>Your colours</legend>
          <p>Pick any colours. Text shades and the dark version are worked out for you, so every label stays readable.</p>
          <div className="ss-theme-slots">
            {SLOTS.map(([key, label]) => (
              <div key={key} className="ss-theme-slot">
                <label htmlFor={`ss-colour-${key}`}>{label}</label>
                <input id={`ss-colour-${key}`} type="color" value={theme.custom[key].toLowerCase()}
                  onChange={e => update({ custom: { ...theme.custom, [key]: e.target.value.toUpperCase() } })} />
                <div className="ss-theme-swatches">
                  {CUSTOM_SWATCHES[key].map(c => (
                    <button key={c} type="button" aria-label={`Use ${c} for ${label}`} aria-pressed={theme.custom[key] === c} style={{ background: c }}
                      onClick={() => update({ custom: { ...theme.custom, [key]: c } })} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** "Colours" button on Home that opens the picker in a dialog. */
export function ColoursButton({ owner }: { owner: string }) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" className="rr-home-colours" onClick={() => dialog.current?.showModal?.()}>
        <span className="rr-home-colours-dots" aria-hidden="true"><i /><i /><i /></span>Colours
      </button>
      <dialog ref={dialog} className="ss-theme-dialog" aria-labelledby="ss-theme-dialog-title" onClose={() => trigger.current?.focus()}>
        <div className="ss-theme-dialog-head">
          <h2 id="ss-theme-dialog-title">Colours</h2>
          <button type="button" onClick={() => dialog.current?.close()}>Done</button>
        </div>
        <ThemePicker owner={owner} />
      </dialog>
    </>
  );
}
