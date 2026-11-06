// Isolated component fixture for platforms where review evidence storage is unavailable.
import { build } from 'esbuild';
import { webkit } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const output = process.env.NORDIFY_QA_OUTPUT || '.qa/nordify-browser';
mkdirSync(output, { recursive: true });
const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GlassProvider } from './src/components/glassyui/glass-provider';
import { GlassPanel } from './src/components/glassyui/glass-panel';
import { GlassMaterialSettings } from './src/components/glass-material-settings';
function App() { const [show, setShow] = useState(true); return <GlassProvider><button id="toggle" onClick={() => setShow(!show)}>Toggle glass</button>{show && <><GlassPanel preset="control" style={{ width: 320, height: 100, margin: 30 }}><button id="inside">Interactive foreground</button></GlassPanel><GlassPanel preset="showcase" style={{ width: 280, height: 100, margin: 30 }}>Second instance</GlassPanel></>}<GlassMaterialSettings /></GlassProvider> }
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
` }, bundle: true, write: false, loader: { '.css': 'empty' }, format: 'iife' });
const browser = await webkit.launch({ headless: true, ...(process.env.NORDIFY_EXECUTABLE ? { executablePath: process.env.NORDIFY_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, colorScheme: 'dark' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // A real local origin keeps the application's unmodified local settings store.
  await page.goto((process.env.NORDIFY_QA_URL || 'http://127.0.0.1:3113') + '/privacy');
  await page.setContent('<html><head></head><body><div id="root"></div></body></html>');
  const css = ['src/components/glassyui/styles/liquid.css', 'src/components/glassyui/nordify/liquid-glass.css', 'src/components/glassyui/styles/nordify-integration.css'].map(path => readFileSync(path, 'utf8')).join('\n');
  await page.addStyleTag({ content: css + '\nbody{background:repeating-linear-gradient(45deg,#17323d 0 20px,#080c0e 20px 40px);color:#edf3f5;padding:30px;--signal-text:#edf3f5;--signal-muted:#afc4cc;--signal-line:#91b1c955;--signal-recess:#ffffff0c;font:15px system-ui}.glass-material-settings{max-width:400px}' });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await page.waitForFunction(() => document.querySelectorAll('[data-nordify="frosted"]').length === 2);
  assert.equal(await page.locator('.lg-pane').count(), 2);
  assert.equal(await page.locator('.lg-pane').first().evaluate(el => el.style.backdropFilter.includes('url(')), false);
  assert.equal(await page.locator('feImage[href]').count(), 0, 'unsupported browsers never bake displacement images');
  await page.locator('#inside').click();
  for (const name of ['Crystal', 'Graphite', 'Frosted']) await page.getByRole('button', { name, exact: true }).click();
  await page.getByText('Customize Glass', { exact: true }).click();
  await page.getByLabel('Blur', { exact: true }).fill('12');
  assert.equal(await page.getByLabel('Blur', { exact: true }).inputValue(), '12');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('glassy-ui-preferences')).material.blur), 12);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.lg-pane').count(), 2, 'Strict Mode and settings updates do not duplicate layers');
  await page.screenshot({ path: `${output}/webkit-isolated-fallback.png` });
  await page.locator('#toggle').click();
  assert.equal(await page.locator('.lg-defs, .lg-layer, .lg-cover, .lg-tick, .ss-nordify-decoration').count(), 0);
  await page.locator('#toggle').click();
  await page.waitForFunction(() => document.querySelectorAll('.lg-pane').length === 2);
  assert.deepEqual(errors, []);
  const result = { engine: 'webkit', scope: 'isolated real React components; dashboard review blocked by baseline evidence storage', checks: ['frosted capability selection', 'no displacement baking', 'two instances and Strict Mode', 'foreground interaction', 'presets and sliders', 'preference persistence', 'cleanup and remount'], errors };
  writeFileSync(`${output}/webkit-results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
