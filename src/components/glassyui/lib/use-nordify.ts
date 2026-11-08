'use client';

import { useEffect, useState, type RefObject } from 'react';
import { createLiquidGlass, supportsRefraction } from '../nordify/liquid-glass';
import { useOptionalPreferences } from '../glass-provider';

// IntersectionObserver limits work to visible, outermost surfaces. A card's
// size or mount order must not silently give it a different glass material.

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
    let disposed = false;
    const placeDecoration = () => {
      if (!decoration) return;
      // The lens belongs to the card's viewport, not its scrolling contents.
      Object.assign(decoration.style, {
        left: `${surface.scrollLeft}px`, top: `${surface.scrollTop}px`,
        width: `${surface.clientWidth}px`, height: `${surface.clientHeight}px`,
        right: 'auto', bottom: 'auto',
      });
    };
    const destroy = () => {
      glass?.destroy();
      glass = undefined;
      decoration?.remove();
      decoration = undefined;
      delete surface.dataset.nordify;
    };
    const reconcile = () => {
      if (disposed) return;
      const box = surface.getBoundingClientRect();
      // Re-read visibility after responsive reparenting: the observer can
      // retain its old intersection state when the same portal host moves.
      const viewport = surface.ownerDocument.documentElement;
      const inView = box.bottom > 0 && box.right > 0 && box.top < (viewport.clientHeight || innerHeight) && box.left < (viewport.clientWidth || innerWidth);
      // Lighting follows the corner radius, not a large card's full height.
      // Otherwise its edge grows into a broad neon band unlike the preview.
      const lightingScale = Math.min(box.width, box.height, optics.pill ? 96 : optics.radius * 2) / 60;
      // Nested controls share the outer material instead of filtering it again.
      const nested = surface.parentElement?.closest('[data-glass-surface]');
      const backdrop = surface.closest('[data-glass-backdrop-root]');
      const sharesMaterial = nested && (!backdrop || backdrop.contains(nested));
      const allowed = !transparency.matches && inView && box.width >= 8 && box.height >= 8 && !sharesMaterial && !opticalAncestorBlocked(surface);
      if (!allowed) { destroy(); return; }
      if (glass) {
        decoration?.style.setProperty('--ss-lens-scale', String(lightingScale));
        placeDecoration();
        glass.update(); glass.refresh(); return;
      }
      decoration = document.createElement('span');
      decoration.className = 'ss-nordify-decoration';
      decoration.style.setProperty('--ss-lens-scale', String(lightingScale));
      decoration.setAttribute('aria-hidden', 'true');
      const host = document.createElement('span');
      host.className = 'ss-nordify-host';
      decoration.append(host);
      surface.prepend(decoration);
      placeDecoration();
      // Promote=false: promoting main would block lenses inside main.
      // The demo uses radius=9999, clamped by Nordify to half the short side.
      // Reflection width and background displacement remain independent.
      glass = createLiquidGlass(host, { ...optics, radius: optics.pill ? 9999 : optics.radius, promote: false });
      surface.dataset.nordify = supportsRefraction ? 'optical' : 'frosted';
    };
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(reconcile, 180); };
    const onScroll = () => {
      if (!glass || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        placeDecoration();
        glass?.update();
        glass?.refresh();
      });
    };
    surface.addEventListener('scroll', onScroll, { passive: true });
    const visibility = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      if (!entries[entries.length - 1].isIntersecting) destroy();
      else schedule();
    });
    visibility?.observe(surface);
    schedule();
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
    return () => { disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); surface.removeEventListener('scroll', onScroll); transparency.removeEventListener('change', mediaChange); visibility?.disconnect(); resize.disconnect(); mutations.disconnect(); destroy(); };
  }, [ref, enabled, reduced, lowQuality, optics]);
}
