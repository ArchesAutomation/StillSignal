// Run against the isolated /review workspace, never a cloud account.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage', '--no-zygote', '--single-process'],
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => { if (!/unsafe-eval|Content Security Policy/.test(error.message)) errors.push(error.message); });
try {
  await page.goto((process.env.UI_REVIEW_URL || 'http://127.0.0.1:3100') + '/review');
  const writing = page.getByRole('region', { name: 'Main journal', exact: true });
  await writing.getByRole('heading', { name: 'My journal', exact: true }).waitFor();
  const cards = page.locator('.ss-journal-trade');
  await cards.first().waitFor();
  assert.equal(await cards.count(), 2);
  assert.equal(await page.locator('.ss-flow').count(), 0, 'trade cards are the default');
  const trade = writing.getByRole('combobox', { name: 'Journal trade', exact: true }).first();
  const stage = writing.getByRole('combobox', { name: 'Journal section', exact: true }).first();
  await trade.selectOption('review-e1'); await stage.selectOption('entry');
  const entry1 = await writing.locator('.ss-time-link').innerText();
  await trade.selectOption('review-e3');
  assert.notEqual(await writing.locator('.ss-time-link').innerText(), entry1);
  await stage.selectOption('exit');
  assert.match(await writing.locator('.ss-time-link').innerText(), /11:23:00 AM/);
  await writing.locator('.ss-time-link input').check();
  await writing.getByRole('textbox', { name: 'Journal reflection', exact: true }).fill('Trade 2 exit: I followed my plan.\nThese exact words must stay.');
  await writing.getByRole('button', { name: 'Save to journal', exact: true }).click();
  const collection = writing.getByRole('region', { name: 'Collected journal notes', exact: true });
  await collection.getByText('Trade 2 exit: I followed my plan.', { exact: false }).waitFor();
  await collection.getByRole('combobox', { name: 'Filter journal trade' }).selectOption('review-e3');
  await collection.getByRole('combobox', { name: 'Filter journal stage' }).selectOption('exit');
  assert.match(await collection.innerText(), /These exact words must stay/);
  await cards.nth(1).locator('summary').first().click();
  const exit = page.getByRole('region', { name: 'Trade 2 Exit', exact: true });
  assert.equal(await exit.locator('.ss-journal-execution').count(), 1);
  assert.match(await exit.innerText(), /Trade 2 exit: I followed my plan/);
  await exit.getByRole('button', { name: 'Write / add screenshot', exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Reflection', exact: true }) });
  assert.equal(await editor.getByRole('combobox', { name: 'Journal trade', exact: true }).inputValue(), 'review-e3');
  assert.equal(await editor.getByRole('combobox', { name: 'Journal section', exact: true }).inputValue(), 'exit');
  assert.equal(await editor.locator('input[type="file"]').count(), 1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await trade.selectOption('');
  assert.match(await writing.locator('.ss-time-link').innerText(), /No linked time yet/);
  await writing.getByRole('textbox', { name: 'Journal reflection', exact: true }).fill('Untimed words stay visible too.');
  await stage.selectOption('');
  await writing.getByRole('button', { name: 'Save to journal', exact: true }).click();
  await collection.getByText('Untimed words stay visible too.', { exact: true }).waitFor();
  assert.equal(await collection.locator('.ss-unsorted-notes').getAttribute('open'), '');
  // Avoid /review reseeding on navigation: reopen the day using the actual app.
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Daily journal', exact: true }).click();
  assert.match(await collection.innerText(), /Untimed words stay visible too/);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px has no horizontal overflow`);
  }
  assert.deepEqual(errors, []);
  if (process.env.UI_REVIEW_SCREENSHOT) await page.screenshot({ path: process.env.UI_REVIEW_SCREENSHOT, fullPage: true });
  console.log('PASS: dynamic trade/phase/HR links, trade-first grouping, raw writing persistence, filtered retrieval, Unsorted visibility, screenshot routing and desktop/mobile fit.');
} finally { await browser.close(); }
