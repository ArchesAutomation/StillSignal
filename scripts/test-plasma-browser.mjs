// Isolated local UI review. No accounts or live trading data.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, firefox } from 'playwright';
import { PLASMA_RANGES, DEFAULT_PLASMA } from '../src/components/glassyui/lib/plasma-settings.ts';

const origin = process.env.PLASMA_QA_URL || 'http://127.0.0.1:3123';
const output = process.env.PLASMA_QA_OUTPUT || '.qa/plasma';
const engine = process.env.PLASMA_BROWSER || 'chrome';
const type = engine === 'firefox' ? firefox : chromium;
const executablePath = process.env.PLASMA_EXECUTABLE || (engine === 'edge' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
mkdirSync(output, { recursive: true });
const browser = await type.launch({ headless: true, executablePath, args: type === chromium ? ['--enable-unsafe-swiftshader'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark', timezoneId: 'America/Denver', acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(20000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && /plasma-ui|INVALID_|shader|Framebuffer/.test(message.text())) errors.push(message.text()); });
const menu = page.locator('.appearance-controls');
const panel = menu.locator('.plasma-settings-body');
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('glassy-ui-preferences')).plasma);
const nav = async name => {
  const close = page.getByRole('button', { name: 'Close workspace tools', exact: true });
  if (await close.isVisible()) await close.click();
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name, exact: true }).click();
};
const open = async () => {
  await menu.locator(':scope > summary').click();
  if (!await panel.isVisible()) await menu.getByText('Plasma effects', { exact: true }).click();
};
const close = () => menu.locator(':scope > summary').click();
const active = () => page.waitForFunction(() => document.documentElement.dataset.plasmaActive === 'true' && document.querySelectorAll('[data-plasma-surface]').length > 0);
const noOverflow = async () => {
  try { await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, null, { timeout: 3000 }); }
  catch { console.log(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(node => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right })) }))); throw new Error('Page overflow'); }
};
try {
  await page.goto(origin + '/review'); await nav('Command Center');
  await page.waitForFunction(() => document.querySelector('.ss-reference-topbar[data-nordify]'));
  assert.equal(await page.locator('.ss-plasma-canvas').count(), 0, 'no GPU engine before opt-in');
  await open(); assert.equal(await panel.getByLabel('Enable Plasma effects', { exact: true }).isChecked(), false);
  await panel.getByLabel('Enable Plasma effects', { exact: true }).check(); await active();
  assert.equal(await page.locator('.ss-plasma-canvas').count(), 1);
  assert.ok(await page.locator('[data-plasma-surface]').count() <= 12);
  await page.locator('.ss-plasma-canvas').evaluate(canvas => { canvas.__qaIdentity = 'same renderer'; });
  checks.push('Nordify remains the default; opt-in mounts one real, bounded WebGL engine');
  await close(); await page.screenshot({ path: `${output}/${engine}-clean-glass.png` });
  await open();
  await panel.getByRole('button', { name: 'Liquid', exact: true }).click();
  assert.equal(await panel.getByLabel('Keep edges clean', { exact: true }).isChecked(), false);
  for (const summary of await panel.locator('.plasma-control-group > summary').all()) await summary.click();
  for (const [key, [min, max, step, label]] of Object.entries(PLASMA_RANGES)) {
    const value = Number((min + Math.round((max - min) / step * .35) * step).toFixed(4));
    await panel.getByLabel(label, { exact: true }).fill(String(value));
    assert.ok(Math.abs((await stored())[key] - value) < .001, `${label} saves its actual value`);
  }
  await panel.getByLabel('Tint color', { exact: true }).fill('#aaccee');
  await panel.getByLabel('Rim color', { exact: true }).selectOption('custom');
  await panel.getByLabel('Custom rim color', { exact: true }).fill('#fedcba');
  assert.equal((await stored()).rimColor, '#fedcba');
  for (const material of ['crystal', 'metal', 'mercury', 'wood', 'stone', 'cloud', 'plasma']) {
    await panel.getByLabel('Material', { exact: true }).selectOption(material);
    await page.waitForTimeout(150); assert.equal((await stored()).material, material);
  }
  assert.equal(await page.locator('.ss-plasma-canvas').evaluate(canvas => canvas.__qaIdentity), 'same renderer');
  assert.equal(await page.locator('.ss-plasma-canvas').count(), 1);
  checks.push('all 34 numeric controls, tint and rim colors, seven materials update the same renderer');
  const slider = panel.getByLabel('Refraction', { exact: true });
  await slider.focus(); const before = Number(await slider.inputValue()); await page.keyboard.press('ArrowRight');
  assert.ok(Number(await slider.inputValue()) > before, 'keyboard slider');
  await panel.getByLabel('Keep edges clean', { exact: true }).check();
  assert.equal(await panel.getByLabel('Stretch', { exact: true }).isDisabled(), true);
  assert.equal(await panel.getByLabel('Pointer droplet', { exact: true }).isDisabled(), true);
  await panel.getByLabel('Keep edges clean', { exact: true }).uncheck();
  const saved = await stored();
  const download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Export look', exact: true }).click();
  const exported = await download; assert.equal(exported.suggestedFilename(), 'still-signal-glass.json');
  await exported.saveAs(`${output}/${engine}-look.json`);
  await panel.getByRole('button', { name: 'Reset effects', exact: true }).click();
  assert.equal((await stored()).refraction, DEFAULT_PLASMA.refraction);
  await menu.getByLabel('Import glass look file', { exact: true }).setInputFiles(`${output}/${engine}-look.json`);
  await panel.getByText('Look imported and saved.', { exact: true }).waitFor();
  assert.deepEqual(await stored(), saved);
  await menu.getByLabel('Import glass look file', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"unrelated":true}') });
  await panel.getByText('Choose a Still Signal glass look exported from these settings.', { exact: true }).waitFor();
  assert.deepEqual(await stored(), saved);
  await page.reload(); await nav('Command Center'); await active();
  assert.deepEqual(await stored(), saved);
  checks.push('keyboard input, clean-edge lock, export/import, rejected invalid file and reload persistence');
  await open(); await panel.getByRole('button', { name: 'Clean glass', exact: true }).click();
  await close(); await nav('Command Center');
  const edit = page.locator('.cc-workspace').getByRole('button', { name: 'Edit dashboard', exact: true });
  await edit.click();
  await page.waitForFunction(() => document.querySelectorAll('.cc-canvas [data-plasma-surface]').length === 0);
  const card = page.locator('[data-card="thesis"]');
  const grid = () => card.getAttribute('data-grid').then(JSON.parse);
  const initial = await grid();
  const resize = page.locator('.cc-workspace').getByRole('button', { name: 'Resize Trading thesis', exact: true });
  await resize.focus(); await page.keyboard.press('ArrowRight');
  const changed = await grid(); assert.equal(changed.w, initial.w + 1);
  await page.locator('.cc-workspace').getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await grid(), initial);
  const drag = page.locator('.cc-workspace').getByRole('button', { name: 'Drag Trading thesis', exact: true });
  await drag.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  const box = await drag.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 10 });
  await page.locator('.cc-tile-active.cc-tile-move').waitFor();
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await grid(), initial);
  await page.locator('.cc-workspace').getByRole('button', { name: 'Save dashboard', exact: true }).click();
  await edit.waitFor(); await active();
  checks.push('enabled engine releases dashboard gestures; pointer drag, Escape, resize, undo and save stay intact');
  await nav('Settings');
  const studio = page.getByRole('region', { name: 'Wallpaper & glass', exact: true });
  await studio.locator('.wallpaper-gallery').getByRole('button', { name: 'Dusk', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-glass-backdrop]')?.width > 0);
  assert.equal(await page.locator('[data-glass-backdrop]').count(), 1);
  const wallpaper = await studio.locator('.wallpaper-preview').screenshot();
  await studio.getByLabel('Upload custom wallpaper', { exact: true }).setInputFiles({ name: 'Plasma backdrop.png', mimeType: 'image/png', buffer: wallpaper });
  await studio.locator('.wallpaper-gallery').getByRole('button', { name: 'Plasma backdrop', exact: true }).waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('still-signal-appearance')).wallpaper.startsWith('custom-'));
  await studio.getByLabel('Wallpaper dimming', { exact: true }).fill('40');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-glass-backdrop]').count(), 1);
  assert.ok(await page.locator('[data-glass-backdrop]').evaluate(canvas => canvas.toDataURL().startsWith('data:image/png')));
  await studio.getByRole('button', { name: 'Remove selected', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-glass-backdrop]'));
  checks.push('built-in and uploaded wallpaper backdrops, dimming, texture cleanup and ocean restoration');
  await studio.getByLabel('Reduce transparency for easier reading').check();
  await page.waitForFunction(() => !document.documentElement.dataset.plasmaActive);
  assert.equal(await page.locator('[data-plasma-surface]').count(), 0);
  await studio.getByLabel('Reduce transparency for easier reading').uncheck(); await active();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-plasma-surface]').evaluateAll(nodes => nodes.every(node => !node.style.translate && !node.style.scale)), true);
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await page.waitForFunction(() => !document.documentElement.dataset.plasmaActive);
  await page.emulateMedia({ forcedColors: 'none' }); await active();
  checks.push('reduced transparency, reduced motion and forced colors restore and release the renderer correctly');
  await nav('Command Center');
  const canLoseContext = await page.locator('.ss-plasma-canvas').evaluate(canvas => {
    const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) return false; window.__qaRestore = () => extension.restoreContext(); extension.loseContext(); return true;
  });
  if (canLoseContext) {
    await page.waitForFunction(() => !document.documentElement.dataset.plasmaActive);
    await page.waitForTimeout(200); await page.evaluate(() => window.__qaRestore()); await active();
    checks.push('GPU context loss shows Nordify fallback; restored context resumes the same engine');
  }
  await open(); await panel.getByLabel('Enable Plasma effects', { exact: true }).uncheck();
  await page.waitForFunction(() => !document.querySelector('.ss-plasma-canvas') && !document.querySelector('[data-plasma-surface]'));
  await close();
  await page.waitForFunction(() => document.querySelector('.ss-reference-topbar[data-nordify]'));
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 }); await noOverflow(); await open();
    await panel.getByLabel('Enable Plasma effects', { exact: true }).check(); await active(); await noOverflow();
    const bounds = await menu.locator('.appearance-panel').boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 1100, `settings fit ${width}px`);
    await page.screenshot({ path: `${output}/${engine}-settings-${width}.png` });
    await panel.getByLabel('Enable Plasma effects', { exact: true }).uncheck(); await close();
  }
  checks.push('off releases canvas and restores Nordify; 390/768/1440px settings fit without page overflow');
  const fallbackContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind === 'webgl2' ? null : original.call(this, kind, ...args); };
  });
  const fallback = await fallbackContext.newPage();
  fallback.on('pageerror', error => errors.push(error.message));
  await fallback.goto(origin + '/review');
  await fallback.locator('.appearance-controls > summary').click();
  await fallback.locator('.appearance-controls').getByText('Plasma effects', { exact: true }).click();
  await fallback.locator('.appearance-controls').getByLabel('Enable Plasma effects', { exact: true }).check();
  await fallback.getByText('Plasma is unavailable here. Your Nordify glass stays active.', { exact: true }).waitFor();
  assert.equal(await fallback.locator('[data-plasma-surface]').count(), 0);
  assert.equal(await fallback.locator('.ss-plasma-canvas').isVisible(), false);
  await fallback.waitForFunction(() => document.querySelector('[data-nordify]'));
  await fallbackContext.close();
  checks.push('unavailable WebGL keeps Nordify active and reports the fallback without breaking controls');
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/${engine}-results.json`, JSON.stringify({ engine, checks, errors }, null, 2));
  console.log(JSON.stringify({ engine, checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/${engine}-failure.png` });
  throw error;
} finally { await browser.close(); }
