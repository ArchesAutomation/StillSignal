import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { GLASS_PRESETS, GLASS_BOUNDS, parseGlassMaterial, migrateGlassMaterial, applyGlassMaterial } from '../src/components/glassyui/lib/glass-material';
import { loadPreferences, persistPreferences, computeAutomaticSafeguards } from '../src/components/glassyui/lib/preferences';

test('Nordify presets use one bounded material model and overrides become Custom', () => {
  for (const material of Object.values(GLASS_PRESETS)) {
    assert.deepEqual(parseGlassMaterial(material), material);
    for (const [key, bounds] of Object.entries(GLASS_BOUNDS)) assert.ok(material[key as keyof typeof GLASS_BOUNDS] >= bounds.min && material[key as keyof typeof GLASS_BOUNDS] <= bounds.max);
  }
  const invalid = parseGlassMaterial({ preset: 'crystal', blur: Infinity, rim: -20, radius: 100, reflectStrength: NaN, tint: 100, reflect: 'false' });
  assert.equal(invalid.blur, 2);
  assert.equal(invalid.rim, .4);
  assert.equal(invalid.radius, 48);
  assert.equal(invalid.reflectStrength, 2.5);
  assert.equal(invalid.tint, 65);
  assert.equal(invalid.reflect, true);
  assert.equal(invalid.preset, 'custom');
  assert.deepEqual(parseGlassMaterial({ preset: '__proto__', base: 'constructor' }), GLASS_PRESETS.graphite);
  assert.equal(GLASS_PRESETS.crystal.radius, 30, 'Crystal uses the original Nordify demo geometry');
  const savedCrystal = parseGlassMaterial({ ...GLASS_PRESETS.crystal, radius: 18 });
  assert.equal(savedCrystal.radius, 18, 'previously saved geometry is preserved');
  assert.equal(savedCrystal.preset, 'custom');
});

test('legacy preferences migrate without rewriting stored choices or other appearance fields', () => {
  let raw = JSON.stringify({ theme: 'light', blur: 12, frost: 22, refraction: 15, thickness: 1.2, reduceMotion: true });
  const storage: Storage = { length: 1, clear() { raw = ''; }, key: () => 'glassy-ui-preferences', removeItem() { raw = ''; }, getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  const before = raw;
  const migrated = loadPreferences(storage);
  assert.equal(raw, before);
  assert.equal(migrated.material?.preset, 'custom');
  assert.equal(migrated.material?.blur, 12);
  assert.equal(migrated.material?.tint, 22);
  persistPreferences({ material: GLASS_PRESETS.crystal }, storage);
  const reloaded = loadPreferences(storage);
  assert.deepEqual(reloaded.material, GLASS_PRESETS.crystal);
  assert.equal(reloaded.blur, 12);
  assert.equal(reloaded.theme, 'light');
  assert.equal(reloaded.reduceMotion, true);
  assert.deepEqual(migrateGlassMaterial({}), GLASS_PRESETS.graphite);
});

test('material updates apply immediate tint and radius without constructing optical filters', () => {
  const dom = new JSDOM('<html><body></body></html>');
  applyGlassMaterial(dom.window.document.documentElement, GLASS_PRESETS.frosted);
  const root = dom.window.document.documentElement;
  assert.equal(root.dataset.glassMaterial, 'frosted');
  assert.equal(root.style.getPropertyValue('--ss-glass-blur'), '18px');
  assert.equal(root.style.getPropertyValue('--ss-glass-tint'), '0.42');
  assert.equal(dom.window.document.querySelectorAll('filter').length, 0);
  dom.window.close();
});

test('automatic safeguards preserve operating system reduced motion and transparency', () => {
  const dom = new JSDOM('<body></body>');
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  dom.window.matchMedia = (query: string) => ({ matches: query.includes('reduced'), media: query, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} });
  assert.deepEqual(computeAutomaticSafeguards(), { reduceMotion: true, reduceTransparency: true, quality: 'low' });
  dom.window.close();
});
