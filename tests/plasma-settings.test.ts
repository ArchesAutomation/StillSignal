import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLASMA, PLASMA_LOOKS, parsePlasmaPreferences, plasmaRendererSettings, plasmaShapeSettings } from '../src/components/glassyui/lib/plasma-settings';
import { GLASS_PRESETS } from '../src/components/glassyui/lib/glass-material';
import { loadPreferences, persistPreferences } from '../src/components/glassyui/lib/preferences';

test('Plasma is opt-in; existing Nordify choices do not activate or migrate into a second engine', () => {
  const storage = { getItem: () => JSON.stringify({ material: GLASS_PRESETS.crystal, reduceMotion: true }) };
  const loaded = loadPreferences(storage);
  assert.equal(loaded.plasma, undefined);
  assert.deepEqual(loaded.material, GLASS_PRESETS.crystal);
  assert.equal(loaded.reduceMotion, true);
  assert.equal(DEFAULT_PLASMA.enabled, false);
  assert.equal(DEFAULT_PLASMA.cleanEdges, true);
});

test('malformed and hostile optical input cannot escape bounded engine settings', () => {
  const parsed = parsePlasmaPreferences({ enabled: 'true', cleanEdges: 0, quality: 100, blend: -1, lightZ: 0,
    refraction: Infinity, stretch: NaN, material: 'constructor', tint: 'url(bad)', rimColor: 'red', ambientDrops: 'false' });
  assert.equal(parsed.enabled, false); assert.equal(parsed.cleanEdges, true);
  assert.equal(parsed.quality, 1.25); assert.equal(parsed.blend, 0); assert.equal(parsed.lightZ, .1);
  assert.equal(parsed.refraction, DEFAULT_PLASMA.refraction); assert.equal(parsed.stretch, DEFAULT_PLASMA.stretch);
  assert.equal(parsed.material, 'plasma'); assert.equal(parsed.tint, DEFAULT_PLASMA.tint); assert.equal(parsed.rimColor, 'tint');
  assert.equal(parsed.ambientDrops, false);
  assert.deepEqual(parsePlasmaPreferences(null), DEFAULT_PLASMA);
  assert.deepEqual(parsePlasmaPreferences([]), DEFAULT_PLASMA);
});

test('clean-edge lock neutralizes deformation without discarding saved experimentation', () => {
  const custom = { ...PLASMA_LOOKS.Liquid, cleanEdges: true, edge: 8, pointerDrop: true };
  const settings = plasmaRendererSettings(custom, null, 'dark', false);
  for (const key of ['edge', 'stretch', 'flow', 'tension', 'blend'] as const) assert.equal(settings[key], 0);
  assert.equal(settings.pointerPull, false); assert.equal(settings.formIn, false);
  assert.equal(custom.stretch, 1); assert.equal(custom.edge, 8);
  const unlocked = plasmaRendererSettings({ ...custom, cleanEdges: false }, null, 'light', false);
  assert.equal(unlocked.edge, 8); assert.equal(unlocked.stretch, 1); assert.equal(unlocked.pointerPull, true);
});

test('reduced motion disables pointer and formation effects and dashboard shapes retain their geometry', () => {
  const liquid = { ...PLASMA_LOOKS.Liquid, pointerDrop: true, ambientDrops: true, shimmer: 1, lean: 8 };
  const settings = plasmaRendererSettings(liquid, null, 'dark', true);
  for (const key of ['stretch', 'flow', 'tension', 'blend', 'shimmer'] as const) assert.equal(settings[key], 0);
  for (const key of ['pointerDrop', 'pointerPull', 'ambientDrops', 'formIn', 'formOut'] as const) assert.equal(settings[key], false);
  assert.equal(plasmaShapeSettings(liquid, false, true).lean, 0, 'the dashboard engine owns card placement');
  assert.equal(plasmaShapeSettings(liquid, false, false).lean, 8);
  assert.equal(plasmaShapeSettings(liquid, true, false).lean, 0);
});

test('full Plasma choices round-trip alongside Nordify and existing preferences', () => {
  let raw = JSON.stringify({ material: GLASS_PRESETS.frosted, theme: 'light', reduceTransparency: true });
  const storage: Storage = { length: 1, getItem: () => raw, setItem: (_key, value) => { raw = value; }, clear() {}, removeItem() {}, key: () => 'glassy-ui-preferences' };
  const plasma = { ...PLASMA_LOOKS.Mercury, enabled: true, rimColor: '#aabbcc', lightX: .3 };
  persistPreferences({ plasma }, storage);
  const loaded = loadPreferences(storage);
  assert.deepEqual(loaded.plasma, plasma);
  assert.deepEqual(loaded.material, GLASS_PRESETS.frosted);
  assert.equal(loaded.theme, 'light'); assert.equal(loaded.reduceTransparency, true);
  for (const look of Object.values(PLASMA_LOOKS)) assert.deepEqual(parsePlasmaPreferences(look), look);
});
