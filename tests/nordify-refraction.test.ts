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
    width = 260; height = 40;
    observers.forEach(callback => callback());
    assert.ok(scale(original) < baseline, 'the optical radius clamps to the resized short side');
    assert.equal(original.style.getPropertyValue('--lg-r'), '20px');
  } finally {
    instances.forEach(instance => instance.destroy());
    assert.equal(win.document.querySelectorAll('.lg-pane, .lg-cover, .lg-tick, .lg-defs').length, 0);
    win.close();
  }
});
