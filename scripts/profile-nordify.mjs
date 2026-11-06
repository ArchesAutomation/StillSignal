import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.NORDIFY_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = {};
try {
  for (const [label, origin] of [['baseline', process.env.NORDIFY_BASELINE_URL || 'http://127.0.0.1:3115'], ['nordify', process.env.NORDIFY_QA_URL || 'http://127.0.0.1:3113']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    await page.goto(origin + '/review');
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Command Center', exact: true }).click();
    await page.waitForTimeout(1500);
    results[label] = [];
    for (let round = 0; round < 3; round++) results[label].push(await page.evaluate(() => new Promise(resolve => {
      const samples = [], tasks = []; let previous, start;
      const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(entry => entry.duration)));
      observer.observe({ type: 'longtask', buffered: false });
      const step = now => {
        start ??= now;
        if (previous !== undefined) samples.push(now - previous);
        previous = now;
        scrollTo(0, (Math.sin((now - start) / 450) + 1) / 2 * (document.documentElement.scrollHeight - innerHeight));
        if (now - start < 3000) requestAnimationFrame(step);
        else {
          observer.disconnect(); samples.sort((a, b) => a - b);
          resolve({ frames: samples.length, medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.floor(samples.length * .95)], over33ms: samples.filter(n => n > 33.4).length, longTasks: tasks.length, maxTaskMs: Math.max(0, ...tasks), opticalSurfaces: document.querySelectorAll('[data-nordify="optical"]').length, oceanCanvases: document.querySelectorAll('.shark-background canvas').length });
        }
      }; requestAnimationFrame(step);
    })));
    await page.close();
  }
  writeFileSync('.qa/performance.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
