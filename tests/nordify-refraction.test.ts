import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('refraction strength scales background displacement independently of reflections and follows resizing', async () => {
  const dom = new JSDOM('<body><div id="stage"></div></body>', { pretendToBeVisual: true });
  const win = dom.window;
  const observers: Array<() => void> = [];
  class Observer {
    constructor(callback: () => void) { observers.push(callback); }
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(win.navigator, 'userAgentData', { value: {} });
  for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator,
    getComputedStyle: win.getComputedStyle.bind(win), ResizeObserver: Observer,
    innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win),
  })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createLiquidGlass, supportsRefraction } = await import('../src/components/glassyui/nordify/liquid-glass');
  assert.equal(supportsRefraction, true);
  let width = 320, height = 220;
  const instances: ReturnType<typeof createLiquidGlass>[] = [];
  const host = () => {
    const element = win.document.createElement('div');
    Object.defineProperties(element, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
    element.getBoundingClientRect = () => ({ x: 100, y: 100, top: 100, left: 100, right: 100 + width, bottom: 100 + height, width, height, toJSON() {} });
    win.document.getElementById('stage')!.append(element);
    return element;
  };
  const scale = (element: HTMLElement) => Number(element.querySelector('filter feDisplacementMap')!.getAttribute('scale'));
  try {
    const original = host();
    instances.push(createLiquidGlass(original, { radius: 30, promote: false }));
    const baseline = scale(original);
    assert.ok(baseline > 0);
    for (const strength of [0, .5, 1, 1.5]) {
      const element = host();
      instances.push(createLiquidGlass(element, { radius: 30, refractionStrength: strength, reflect: false, promote: false }));
      assert.equal(scale(element), baseline * strength, 'reflections can be off while the background still refracts');
      assert.ok(element.querySelector<HTMLElement>('.lg-pane')!.style.backdropFilter.includes('url('));
    }
    const rectangular = host(), demo = host();
    instances.push(createLiquidGlass(rectangular, { radius: 30, lensDepth: 100, reflect: false, promote: false }));
    instances.push(createLiquidGlass(demo, { radius: 9999, reflect: false, promote: false }));
    assert.equal(rectangular.style.borderRadius, '30px', 'deep optics never change the visible panel corners');
    assert.equal(rectangular.style.getPropertyValue('--lg-r'), '30px');
    assert.equal(scale(rectangular), baseline * 1.25, 'depth strengthens the physical rectangular field');
    assert.notEqual(scale(rectangular), scale(demo), 'a rectangular lens must not borrow an oval map');
    assert.ok(scale(rectangular) > baseline, 'depth increases bending without moving its corners');
    const tiles = (element: HTMLElement) => [...element.querySelector('filter')!.querySelectorAll('feImage')].map(image => image.getAttribute('href'));
    assert.deepEqual(tiles(rectangular), tiles(original), 'depth preserves the rectangular corner field');
    width = 260; height = 40;
    observers.forEach(callback => callback());
    assert.ok(scale(original) < baseline, 'the optical radius clamps to the resized short side');
    assert.equal(original.style.getPropertyValue('--lg-r'), '20px');
    assert.equal(rectangular.style.getPropertyValue('--lg-r'), '20px');
    assert.equal(scale(rectangular), scale(demo) * 1.25, 'depth retains its bounded gain after the corners clamp on resize');
    // Non-bubbling scroll events from inside a module must refresh refraction
    // even when the user has disabled reflections.
    await new Promise(resolve => win.requestAnimationFrame(resolve));
    const tick = rectangular.previousElementSibling!;
    const beforeScroll = tick.hasAttribute('data-tick');
    rectangular.dispatchEvent(new win.Event('scroll', { bubbles: false }));
    await new Promise(resolve => win.setTimeout(resolve, 80));
    assert.notEqual(tick.hasAttribute('data-tick'), beforeScroll, 'nested scrolling invalidates the live backdrop');
  } finally {
    instances.forEach(instance => instance.destroy());
    assert.equal(win.document.querySelectorAll('.lg-pane, .lg-cover, .lg-tick, .lg-defs').length, 0);
    win.close();
  }
});
