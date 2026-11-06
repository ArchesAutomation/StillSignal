import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';
const engine = process.env.NORDIFY_BROWSER || 'chrome';
const browser = await (engine === 'firefox' ? firefox : chromium).launch({ headless: true, executablePath: process.env.NORDIFY_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.NORDIFY_QA_URL || 'http://127.0.0.1:3113') + '/review');
  const chart = page.locator('.ss-rhythm-svg');
  await chart.waitFor();
  for (const name of ['Heart rate', 'Realised P&L', 'Unrealised P&L', 'Entries & exits', 'Journal moments']) {
    const button = page.locator('.ss-chart-layers').getByRole('button', { name, exact: true });
    await button.click(); assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await button.click(); assert.equal(await button.getAttribute('aria-pressed'), 'true');
  }
  await chart.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * .2, box.y + 80);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .65, box.y + 85, { steps: 12 }); await page.mouse.up();
  assert.equal(await page.getByRole('button', { name: '↶ Previous view', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Fit session', exact: true }).click();
  assert.ok(await chart.locator('path').count() > 0);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: five chart layers, pointer range selection and zoom reset with glass enabled; no browser errors`);
} finally { await browser.close(); }
