'use client';

import { useEffect, useRef } from 'react';
import { useOptionalPreferences } from './glass-provider';
import { plasmaRendererSettings, plasmaShapeSettings } from './lib/plasma-settings';
import { setPlasmaStatus } from './lib/plasma-status';
import { PlasmaRenderer, type ShapeHandle } from './plasma/renderer';

const SELECTOR = '[data-glass-surface="panel"]';
const SUSPENDED = '.cc-canvas-editing,.cc-canvas-interacting,.ss-free-board-editing,[data-glass-suspended="true"]';

/** One optional canvas, below DOM content. The existing dashboard owns every gesture. */
export default function PlasmaEngine() {
  const { preferences } = useOptionalPreferences();
  const latest = useRef(preferences);
  const reconcileRef = useRef<(() => void) | null>(null);
  useEffect(() => { latest.current = preferences; reconcileRef.current?.(); }, [preferences]);

  useEffect(() => {
    const root = document.documentElement;
    const canvas = document.createElement('canvas');
    canvas.className = 'ss-plasma-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-plasma-engine', '');
    document.body.append(canvas);
    const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const forcedColors = matchMedia('(forced-colors: active)');
    const handles = new Map<HTMLElement, ShapeHandle>();
    const containers = new Set<HTMLElement>();
    let renderer: PlasmaRenderer | null = null;
    let failed = false, disposed = false, timer = 0, contextLost = false;

    const removeSurfaces = () => {
      handles.forEach((handle, element) => { handle.update({ formOut: false }); handle.remove(); delete element.dataset.plasmaSurface; });
      handles.clear();
      containers.forEach(element => { delete element.dataset.plasmaContainer; });
      containers.clear();
    };
    const suspend = () => {
      removeSurfaces(); renderer?.destroy(); renderer = null;
      canvas.hidden = true;
      delete root.dataset.plasmaActive;
    };
    const reconcile = () => {
      if (disposed) return;
      const p = latest.current;
      if (p.reduceTransparency || reducedTransparency.matches || forcedColors.matches || p.quality === 'low') {
        suspend(); setPlasmaStatus('paused'); return;
      }
      if (failed || contextLost) { setPlasmaStatus('fallback'); return; }
      // Canvas sampling uses the real ocean, never a screenshot of charts or text.
      // Wallpaper sources hand off their matching canvas through this event contract.
      const background = document.querySelector<HTMLCanvasElement>('[data-glass-backdrop]')
        ?? document.querySelector<HTMLCanvasElement>('.shark-background canvas');
      const theme = root.dataset.theme === 'light' ? 'light' : 'dark';
      const reduced = p.reduceMotion || reducedMotion.matches;
      const settings = plasmaRendererSettings(p.plasma, background, theme, reduced);
      settings.quality = Math.min(settings.quality, p.quality === 'medium' ? .75 : 1.25);
      if (!renderer) {
        setPlasmaStatus('loading');
        try { renderer = PlasmaRenderer.create(canvas, settings); } catch { renderer = null; }
        if (!renderer) { failed = true; suspend(); setPlasmaStatus('fallback'); return; }
      }
      renderer.configure(settings);
      canvas.hidden = false;
      root.dataset.plasmaActive = 'true';
      const candidates = [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter(element => {
        if (element.closest('.appearance-controls,dialog,[role="dialog"],.wallpaper-preview')) return false;
        if (element.closest(SUSPENDED)) return false;
        const card = element.closest('.cc-dashboard-card');
        if (card && card !== element) return false;
        if (!card && element.querySelector(SELECTOR)) return false;
        const box = element.getBoundingClientRect();
        return box.width > 8 && box.height > 8 && box.top < innerHeight && box.bottom > 0 && box.left < innerWidth && box.right > 0 && getComputedStyle(element).visibility !== 'hidden';
      }).slice(0, 12);
      for (const [element, handle] of handles) {
        if (!candidates.includes(element)) {
          // Suspend immediately during editing; ordinary unmounts may form out.
          if (element.closest(SUSPENDED)) handle.update({ formOut: false });
          handle.remove(); handles.delete(element); delete element.dataset.plasmaSurface;
        }
      }
      containers.forEach(element => { delete element.dataset.plasmaContainer; });
      containers.clear();
      for (const element of candidates) {
        const shape = plasmaShapeSettings(p.plasma, reduced, Boolean(element.closest('.cc-canvas,.ss-free-board')));
        const handle = handles.get(element);
        if (handle) handle.update(shape);
        else handles.set(element, renderer.register(element, shape));
        element.dataset.plasmaSurface = 'true';
        for (let parent = element.parentElement?.closest<HTMLElement>(SELECTOR); parent; parent = parent.parentElement?.closest<HTMLElement>(SELECTOR)) {
          parent.dataset.plasmaContainer = 'true'; containers.add(parent);
        }
      }
      setPlasmaStatus('active');
    };
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(reconcile, 90); };
    const onContextLost = () => {
      contextLost = true; removeSurfaces(); canvas.hidden = true;
      delete root.dataset.plasmaActive; setPlasmaStatus('fallback');
    };
    const onContextRestored = () => { contextLost = false; schedule(); };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'open', 'hidden'] });
    mutations.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-wallpaper'] });
    const pulse = (event: MouseEvent) => {
      const p = latest.current;
      if (!renderer || !p.plasma.pulse || p.plasma.cleanEdges || p.reduceMotion || reducedMotion.matches) return;
      const target = (event.target as Element).closest<HTMLElement>('[data-plasma-surface]');
      if (!target || !(event.target as Element).closest('button,a')) return;
      const box = target.getBoundingClientRect();
      renderer.pulse(event.detail === 0 ? box.left + box.width / 2 : event.clientX, event.detail === 0 ? box.top + box.height / 2 : event.clientY, .35);
    };
    document.addEventListener('click', pulse);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('still-signal-glass-backdrop', schedule);
    for (const media of [reducedTransparency, reducedMotion, forcedColors]) media.addEventListener('change', reconcile);
    reconcileRef.current = reconcile;
    reconcile();
    return () => {
      disposed = true; reconcileRef.current = null; clearTimeout(timer); mutations.disconnect();
      document.removeEventListener('click', pulse);
      window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
      window.removeEventListener('still-signal-glass-backdrop', schedule);
      for (const media of [reducedTransparency, reducedMotion, forcedColors]) media.removeEventListener('change', reconcile);
      canvas.removeEventListener('webglcontextlost', onContextLost); canvas.removeEventListener('webglcontextrestored', onContextRestored);
      suspend(); canvas.remove(); setPlasmaStatus('off');
    };
  }, []);
  return null;
}
