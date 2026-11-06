import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLiquidGlass, supportsRefraction } from '../src/components/glassyui/nordify/liquid-glass';

test('Nordify fallback initializes independent instances and destroys only owned resources', () => {
  const dom = new JSDOM('<body><div id="parent"><button id="one"><span>Keep label</span></button><div id="two"><input value="Keep input" /></div></div></body>', { pretendToBeVisual: true });
  const win = dom.window;
  let observed = 0, disconnected = 0, listeners = 0;
  class Observer {
    observe() { observed++; }
    disconnect() { disconnected++; }
  }
  for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator,
    getComputedStyle: win.getComputedStyle.bind(win), ResizeObserver: Observer,
    innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1,
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    addEventListener: (...args: Parameters<typeof addEventListener>) => { listeners++; win.addEventListener(...args); },
    removeEventListener: (...args: Parameters<typeof removeEventListener>) => { listeners--; win.removeEventListener(...args); },
  })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const one = win.document.getElementById('one')!, two = win.document.getElementById('two')!;
  assert.equal(supportsRefraction, false, 'Node and non-Chromium browsers must not select SVG backdrop optics');
  const first = createLiquidGlass(one, { blur: 6, radius: 18, promote: false });
  const second = createLiquidGlass(two, { blur: 18, radius: 12, promote: false });
  assert.equal(observed, 2);
  assert.equal(win.document.querySelectorAll('.lg-pane').length, 2);
  const ids = [...win.document.querySelectorAll('filter')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(one.querySelector('.lg-pane')?.getAttribute('style')?.includes('url('), false);
  assert.equal(win.document.querySelectorAll('.lg-cover, .lg-tick').length, 4);
  assert.equal(win.document.querySelector('#lg-promote'), null);
  first.destroy();
  assert.equal(one.textContent, 'Keep label');
  assert.equal(two.querySelector('input')?.value, 'Keep input');
  assert.equal(two.querySelectorAll('.lg-pane').length, 1);
  second.destroy();
  assert.equal(disconnected, 2);
  assert.equal(listeners, 0);
  assert.equal(win.document.querySelectorAll('.lg-layer, .lg-defs, .lg-cover, .lg-tick').length, 0);
  // Reinitialization, including React Strict Mode, never duplicates a live tree.
  const again = createLiquidGlass(one, { promote: false });
  assert.equal(one.querySelectorAll('.lg-pane').length, 1);
  again.destroy();
  win.close();
});
