'use client';

import { useEffect, useState, type RefObject } from 'react';
import { createLiquidGlass, supportsRefraction } from '../nordify/liquid-glass';
import { useOptionalPreferences } from '../glass-provider';

// Limit simultaneously visible lenses, independently of the number of cards.
const lenses = new Set<HTMLElement>();
export const MAX_OPTICAL_SURFACES = 6;
export const MAX_OPTICAL_AREA = 180_000;
// Only the single wallpaper test panel may use a larger, bounded lens.
const MAX_PREVIEW_AREA = 480_000;

export function opticalAncestorBlocked(host: HTMLElement): boolean {
  if (host.closest('.cc-canvas-editing, .ss-free-board-editing, [data-glass-suspended="true"]')) return true;
  // The wallpaper preview paints its own complete backdrop. It does not need
  // access to page pixels outside that explicitly scoped preview.
  const backdrop = host.closest('[data-glass-backdrop-root]');
  for (let node: HTMLElement | null = host; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (Number(style.opacity) < 1 || style.filter && style.filter !== 'none' ||
      style.backdropFilter && style.backdropFilter !== 'none' ||
      style.transform && style.transform !== 'none' || style.isolation === 'isolate' ||
      style.clipPath && style.clipPath !== 'none' || style.maskImage && style.maskImage !== 'none' ||
      style.mixBlendMode && style.mixBlendMode !== 'normal' ||
      /transform|filter|opacity|mask/.test(style.willChange) ||
      /paint|strict|content/.test(style.contain) ||
      style.overflowX === 'hidden' || style.overflowY === 'hidden' || style.overflowX === 'clip' || style.overflowY === 'clip') return true;
    if (node === backdrop) break;
  }
  return false;
}

/** React owns the content; Nordify owns only a dedicated, empty decoration tree. */
export function useNordify(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const { preferences } = useOptionalPreferences();
  const { blur, rim, radius, pill, reflect, reflectStrength, refractionStrength, lensDepth, saturate } = preferences.material;
  // Commit optical map changes after the slider pauses; CSS lighting and tint
  // stay live. Dragging never allocates new SVG maps on every pointer event.
  const [optics, setOptics] = useState({ blur, rim, radius, pill, reflect, reflectStrength, refractionStrength, lensDepth, saturate });
  useEffect(() => {
    const timer = window.setTimeout(() => setOptics({ blur, rim, radius, pill, reflect, reflectStrength, refractionStrength, lensDepth, saturate }), 150);
    return () => window.clearTimeout(timer);
  }, [blur, rim, radius, pill, reflect, reflectStrength, refractionStrength, lensDepth, saturate]);
  const reduced = preferences.reduceTransparency;
  const lowQuality = preferences.quality === 'low';
  useEffect(() => {
    const surface = ref.current;
    if (!surface || surface.ownerDocument !== document || !enabled || reduced || lowQuality || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    let glass: ReturnType<typeof createLiquidGlass> | undefined;
    let decoration: HTMLElement | undefined;
    let timer = 0;
    let frame = 0;
    let inView = false;
    let disposed = false;
    const destroy = () => {
      glass?.destroy();
      glass = undefined;
      decoration?.remove();
      decoration = undefined;
      lenses.delete(surface);
      delete surface.dataset.nordify;
    };
    const reconcile = () => {
      if (disposed) return;
      const box = surface.getBoundingClientRect();
      // Nested controls share the outer material instead of filtering it again.
      const nested = surface.parentElement?.closest('[data-glass-surface]');
      const backdrop = surface.closest('[data-glass-backdrop-root]');
      const sharesMaterial = nested && (!backdrop || backdrop.contains(nested));
      const allowed = !transparency.matches && inView && box.width >= 8 && box.height >= 8 && box.width * box.height <= (backdrop ? MAX_PREVIEW_AREA : MAX_OPTICAL_AREA) && !sharesMaterial && !opticalAncestorBlocked(surface);
      if (!allowed) { destroy(); return; }
      if (glass) {
        decoration?.style.setProperty('--ss-lens-scale', String(Math.min(box.width, box.height) / 60));
        glass.update(); glass.refresh(); return;
      }
      if (lenses.size >= MAX_OPTICAL_SURFACES && !backdrop) return;
      decoration = document.createElement('span');
      decoration.className = 'ss-nordify-decoration';
      decoration.style.setProperty('--ss-lens-scale', String(Math.min(box.width, box.height) / 60));
      decoration.setAttribute('aria-hidden', 'true');
      const host = document.createElement('span');
      host.className = 'ss-nordify-host';
      decoration.append(host);
      surface.prepend(decoration);
      // Promote=false: promoting main would block lenses inside main.
      // The demo uses radius=9999, clamped by Nordify to half the short side.
      // Reflection width and background displacement remain independent.
      glass = createLiquidGlass(host, { ...optics, radius: optics.pill ? 9999 : optics.radius, promote: false });
      lenses.add(surface);
      surface.dataset.nordify = supportsRefraction ? 'optical' : 'frosted';
    };
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(reconcile, 180); };
    const visibility = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!inView) destroy();
      schedule();
    });
    visibility?.observe(surface);
    if (!visibility) { inView = true; schedule(); }
    const resize = new ResizeObserver(schedule);
    resize.observe(surface);
    // Watch only the ancestry, never the optical layers being written by Nordify.
    const mutations = new MutationObserver(() => {
      if (opticalAncestorBlocked(surface)) destroy();
      // Position changes do not trigger ResizeObserver. Update the real lens
      // while dragging, without rebuilding its SVG maps or using a transform.
      if (glass && !frame) frame = requestAnimationFrame(() => { frame = 0; glass?.update(); glass?.refresh(); });
      schedule();
    });
    for (let node: HTMLElement | null = surface; node; node = node.parentElement) {
      mutations.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-glass-suspended'] });
    }
    const mediaChange = () => { if (transparency.matches) destroy(); else schedule(); };
    transparency.addEventListener('change', mediaChange);
    return () => { disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); transparency.removeEventListener('change', mediaChange); visibility?.disconnect(); resize.disconnect(); mutations.disconnect(); destroy(); };
  }, [ref, enabled, reduced, lowQuality, optics]);
}
