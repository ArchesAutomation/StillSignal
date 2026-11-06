// Isolated UI review only; no cloud credentials or account data.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';

const origin = process.env.NORDIFY_QA_URL || 'http://127.0.0.1:3113';
const output = process.env.NORDIFY_QA_OUTPUT || '.qa/nordify-browser';
const engine = process.env.NORDIFY_BROWSER || 'chrome';
mkdirSync(output, { recursive: true });
const type = engine === 'firefox' ? firefox : engine === 'webkit' ? webkit : chromium;
const executablePath = process.env.NORDIFY_EXECUTABLE || (engine === 'chrome' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : engine === 'edge' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
const browser = await type.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark', timezoneId: 'America/Denver', hasTouch: type === chromium });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const nav = async name => {
  const close = page.getByRole('button', { name: 'Close workspace tools', exact: true });
  if (await close.isVisible()) await close.click();
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name, exact: true }).click();
};
const studio = page.getByRole('region', { name: 'Wallpaper & glass', exact: true });
const material = studio.getByRole('region', { name: 'Glass material', exact: true });
const button = name => page.locator('.cc-workspace').getByRole('button', { name, exact: true });
const grid = async card => JSON.parse(await card.getAttribute('data-grid'));
const settle = () => page.waitForTimeout(700);
const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no horizontal overflow');
try {
  await page.goto(origin + '/review');
  await nav('Command Center');
  await settle();
  const optical = await page.evaluate(() => 'userAgentData' in navigator);
  await page.waitForFunction(() => !!document.querySelector('.ss-reference-topbar[data-nordify]'));
  const layers = await page.locator('.ss-reference-topbar').evaluate(el => ({
    mode: el.dataset.nordify,
    filter: el.querySelector('.lg-pane').style.backdropFilter,
    defs: el.querySelectorAll('.lg-defs').length,
    position: getComputedStyle(el.querySelector('.lg-pane')).position,
    cover: el.querySelectorAll('.lg-cover').length,
  }));
  assert.equal(layers.mode, optical ? 'optical' : 'frosted');
  assert.equal(layers.filter.includes('url('), optical);
  assert.equal(layers.position, 'absolute');
  assert.equal(layers.defs, 1); assert.equal(layers.cover, 1);
  assert.equal(await page.locator('.cc-dashboard-card[data-nordify]').count(), 0, 'large analytical cards stay lightweight');
  const ids = await page.locator('filter[id]').evaluateAll(nodes => nodes.map(n => n.id));
  assert.equal(ids.length, new Set(ids).size, 'independent instances have unique filters');
  checks.push('real Nordify initialization, browser capability selection, unique IDs and bounded analytical material');
  await page.screenshot({ path: `${output}/${engine}-dashboard.png`, fullPage: true });

  await nav('Settings');
  await studio.scrollIntoViewIfNeeded();
  for (const [name, blur] of [['Bubbly', '2.5'], ['Clear', '2'], ['Graphite', '6'], ['Frosted', '20']]) {
    await material.getByRole('button', { name, exact: true }).click();
    assert.equal(await material.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await material.getByLabel('Blur', { exact: true }).inputValue(), blur);
  }
  await material.getByText('Customize Glass', { exact: true }).click();
  for (const [label, value] of [['Blur', '8'], ['Refraction Edge', '1.2'], ['Corner Roundness', '12'], ['Reflection Intensity', '2'], ['Tint', '35']]) {
    await material.getByLabel(label, { exact: true }).fill(value);
  }
  assert.match(await material.locator('.glass-material-heading').textContent(), /Custom/);
  const rim = material.getByLabel('Refraction Edge', { exact: true });
  await rim.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await rim.inputValue(), '1.25', 'native keyboard slider works');
  await material.getByLabel('Reflections', { exact: true }).uncheck();
  await settle();
  await page.reload(); await nav('Settings'); await studio.scrollIntoViewIfNeeded();
  assert.equal(await material.getByLabel('Blur', { exact: true }).inputValue(), '8');
  assert.equal(await rim.inputValue(), '1.25');
  assert.equal(await material.getByLabel('Reflections', { exact: true }).isChecked(), false);
  await material.getByText('Customize Glass', { exact: true }).click();
  await material.getByRole('button', { name: 'Reset to Frosted', exact: true }).click();
  assert.equal(await material.getByLabel('Blur', { exact: true }).inputValue(), '20');
  await material.getByRole('button', { name: 'Graphite', exact: true }).click();
  await page.screenshot({ path: `${output}/${engine}-appearance.png` });
  checks.push('all presets, optical sliders, keyboard input, Custom, reflection toggle, reset and reload persistence');

  await studio.getByLabel('Reduce transparency for easier reading').check();
  await settle();
  assert.equal(await page.locator('.ss-nordify-decoration').count(), 0);
  assert.equal(await page.locator('.ss-reference-topbar').evaluate(el => getComputedStyle(el, '::before').backdropFilter), 'none');
  await studio.getByLabel('Reduce transparency for easier reading').uncheck();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle();
  assert.equal(await page.locator('.ss-reference-topbar').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('reduced transparency releases optics; reduced motion disables transitions');

  await nav('Command Center'); await button('Edit dashboard').click();
  const card = page.locator('[data-card="thesis"]');
  const title = 'Trading thesis';
  const start = await grid(card);
  await button(`Hide ${title}`).click();
  assert.equal(await card.count(), 0);
  await button('Undo').click(); assert.equal(await card.count(), 1); await settle();
  const corner = button(`Resize ${title}`);
  assert.equal(await corner.evaluate(el => getComputedStyle(el).position), 'absolute', 'glass preserves resize handle positioning');
  await corner.scrollIntoViewIfNeeded(); await settle(); await corner.hover();
  let rect = await corner.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 110, rect.y + rect.height / 2 + 80, { steps: 12 });
  await page.locator('.cc-tile-active.cc-tile-resize').waitFor();
  assert.equal(await page.locator('.cc-canvas .ss-nordify-decoration').count(), 0);
  assert.equal(await page.locator('.cc-landing-zone').count(), 1);
  await page.mouse.up();
  const resized = await grid(card);
  assert.ok(resized.w > start.w && resized.h > start.h, 'corner changes width and height');
  await button('Undo').click(); assert.deepEqual(await grid(card), start);
  const drag = button(`Drag ${title}`);
  await drag.scrollIntoViewIfNeeded(); await settle(); await drag.hover(); rect = await drag.boundingBox();
  const beforeBox = await card.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 170, rect.y + rect.height / 2 + 80, { steps: 12 });
  await page.locator('.cc-tile-active.cc-tile-move').waitFor();
  assert.notEqual(await card.evaluate(el => getComputedStyle(el).transform), 'none');
  const movingBox = await card.boundingBox();
  assert.ok(Math.abs(movingBox.width / beforeBox.width - 1.035) < .01, 'existing lift scale preserves card geometry');
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await grid(card), start);
  await corner.focus(); await page.keyboard.press('ArrowRight');
  const saved = await grid(card);
  assert.equal(saved.w, start.w + 1, 'keyboard resize still snaps to grid');
  await button('Save dashboard').click(); await button('Edit dashboard').waitFor();
  await page.reload(); await nav('Command Center'); assert.deepEqual(await grid(card), saved);
  await button('Edit dashboard').click(); await button(`Hide ${title}`).click();
  await button('Cancel').click(); assert.equal(await card.count(), 1);
  await button('Edit dashboard').click(); await button('Reset layout').click();
  assert.deepEqual(await grid(card), start);
  await button('Undo').click(); assert.deepEqual(await grid(card), saved);
  await button('Cancel').click();
  checks.push('hide/show, two-axis corner resize, grid snapping, pointer drag, Escape, keyboard resize, undo, reset, save/reload and cancel');
  await button('New dashboard').click();
  await page.getByLabel('Dashboard name', { exact: true }).fill('Glass QA second dashboard');
  await button('Save dashboard').click();
  await page.getByLabel('Dashboard', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Dashboard', { exact: true }).locator('option').count(), 2);
  await page.getByLabel('Dashboard', { exact: true }).selectOption({ label: 'My dashboard' });
  assert.deepEqual(await grid(card), saved);
  checks.push('multiple dashboards retain independent saved layouts');

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 }); await settle(); await fits();
    await nav('Settings'); await studio.scrollIntoViewIfNeeded(); await fits();
    await page.screenshot({ path: `${output}/${engine}-${width}.png` });
    await nav('Command Center');
  }
  checks.push('390px, 768px and 1440px responsive layouts');
  if (type === chromium) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    await settle(); assert.equal(await page.locator('.ss-nordify-decoration').count(), 0);
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await page.setViewportSize({ width: 390, height: 1100 }); await settle();
    await button('Edit dashboard').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await corner.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await settle();
    const mobileStart = await grid(card), touchRect = await corner.boundingBox();
    const x = touchRect.x + touchRect.width / 2, y = touchRect.y + touchRect.height / 2;
    assert.equal(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.cc-resize-handle'), { x, y }), true, 'touch starts on the resize handle');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let delta = 15; delta <= 90; delta += 15) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + delta }] });
      await page.waitForTimeout(25);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await grid(card)).h > mobileStart.h, 'touch corner resizing');
    await button('Undo').click(); assert.deepEqual(await grid(card), mobileStart);
    await button('Cancel').click();
    await nav('Settings'); await studio.scrollIntoViewIfNeeded();
    await material.getByRole('button', { name: 'Crystal', exact: true }).tap();
    await material.getByText('Customize Glass', { exact: true }).tap();
    const slider = material.getByLabel('Tint', { exact: true });
    await slider.scrollIntoViewIfNeeded();
    const sliderRect = await slider.boundingBox();
    await page.touchscreen.tap(sliderRect.x + sliderRect.width * .7, sliderRect.y + sliderRect.height / 2);
    assert.ok(Number(await slider.inputValue()) > 5, 'touch slider input');
    await cdp.detach(); checks.push('native OS transparency preference, touch corner resize/undo and touch material controls');
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/${engine}-results.json`, JSON.stringify({ engine, optical, layers, checks, errors }, null, 2));
  console.log(JSON.stringify({ engine, optical, checks, errors }, null, 2));
} finally { await browser.close(); }
