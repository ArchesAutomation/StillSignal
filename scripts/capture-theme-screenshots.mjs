// Captures desktop screenshots of the main Reading Room pages for theme reviews and audits text contrast.
// Run against the isolated synthetic review server (APP_ENV=staging, TRADERPULSE_UI_REVIEW=true,
// no Supabase URL). Only local hosts are accepted.
//   THEME_QA_URL=http://127.0.0.1:3115/review THEME_QA_OUTPUT=screenshots/after node scripts/capture-theme-screenshots.mjs
// THEME_QA_THEMES is a comma list of palette:mode pairs (default signature:light,signature:dark,berry:light,berry:dark).
// THEME_QA_BEFORE=true captures the pre-theme app. THEME_QA_SHOTS=false runs only the contrast audit.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const url = process.env.THEME_QA_URL || "http://127.0.0.1:3115/review";
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) throw new Error(`Refusing non-local host ${host}`);
const out = resolve(process.env.THEME_QA_OUTPUT || "screenshots-local/after");
const before = process.env.THEME_QA_BEFORE === "true";
const shots = process.env.THEME_QA_SHOTS !== "false";
const themes = before
  ? [["before", "light"]]
  : (process.env.THEME_QA_THEMES || "signature:light,signature:dark,berry:light,berry:dark").split(",").map(t => t.split(":"));

const pages = [
  ["home", "Home"],
  ["preparation", "Preparation"],
  ["daily-journal", "Daily journal"],
  ["done-for-the-day", "Done for the day"],
  ["stillness", "Stillness"],
  ["settings", "Settings"],
];

/** Runs in the page: every visible text element measured against its composited background. */
function auditContrast() {
  const parse = c => { const m = c.match(/[\d.]+/g); if (!m) return [0, 0, 0, 0]; return [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]]; };
  const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (top, bottom) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + bottom[i] * (1 - a)).concat(1); };
  const bgOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== "none" && !s.backgroundImage.startsWith("url")) return null; // gradients: skip
      const c = parse(s.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const fails = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (!r.width || !r.height || s.visibility === "hidden" || +s.opacity === 0 || el.closest("[hidden],[aria-hidden=true]")) continue;
    // Cards on a board being edited are inert (view-only) but still shown, so they are audited too.
    const inert = el.closest("[inert]");
    if (inert && !inert.closest(".ss-module-editing")) continue;
    if (el.closest("button:disabled, [aria-disabled=true], input:disabled")) continue;
    if (el.closest(".ss-review-banner, [class*=review-banner]")) continue;
    let opacity = 1; for (let e = el; e; e = e.parentElement) opacity *= +getComputedStyle(e).opacity;
    if (opacity < 0.05) continue; // hidden until hover/focus
    const bg = bgOf(el); if (!bg) continue;
    const fg = over([...parse(s.color).slice(0, 3), parse(s.color)[3] * opacity], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio + 0.005 < need) {
      const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").slice(0, 50);
      const key = text + ratio.toFixed(2);
      if (seen.has(key)) continue; seen.add(key);
      fails.push({ text, ratio: +ratio.toFixed(2), need, cls: (el.className?.baseVal ?? el.className).toString().slice(0, 60), color: s.color });
    }
  }
  return fails;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge" });
const report = {};
try {
  for (const [palette, mode] of themes) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: mode, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("navigation", { name: "Main navigation" }).first().waitFor();
    if (!before) {
      await page.evaluate(([p, m]) => window.dispatchEvent(new CustomEvent("ss-theme-set", { detail: { palette: p, mode: m } })), [palette, mode]);
    }
    const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
    const settle = () => page.waitForTimeout(1200);
    const go = async name => { await nav.getByRole("button", { name, exact: true }).first().click(); await settle(); };
    const name = `${palette}-${mode}`;
    for (const [slug, label] of pages) {
      await go(label);
      if (shots) await page.screenshot({ path: join(out, `${name}-${slug}.png`), fullPage: true });
      report[`${name} ${slug}`] = await page.evaluate(auditContrast);
      if (slug === "settings") {
        // Settings opens as a dialog over the page.
        await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach(d => d.close()));
        await settle();
      }
    }
    for (const [slug, label] of [["daily-journal", "Daily journal"], ["done-for-the-day", "Done for the day"], ["stillness", "Stillness"]]) {
      await go(label);
      // Stillness keeps its personal routines board in a collapsed section.
      const routines = page.locator("details.rr-stillness-routines:not([open]) > summary");
      if (await routines.count()) { await routines.first().click(); await settle(); }
      const edit = page.getByRole("button", { name: /^(Edit dashboard|Customize workspace|Edit board)$/ }).first();
      if (await edit.count()) {
        await edit.click();
        await settle();
        if (shots) await page.screenshot({ path: join(out, `${name}-${slug}-board-editing.png`), fullPage: true });
        report[`${name} ${slug} board-editing`] = await page.evaluate(auditContrast);
        const cancel = page.getByRole("button", { name: /^(Cancel|Done editing)$/ }).first();
        if (await cancel.count()) await cancel.click();
      } else console.warn(`${name}: no board-editing control on ${label}`);
    }
    if (shots && !before) {
      // The top-bar ⋯ menu, opened.
      await go("Daily journal");
      await page.getByRole("banner").getByLabel("Session tools").click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, `${name}-menu-open.png`), clip: { x: 700, y: 0, width: 740, height: 520 } });
      await page.keyboard.press("Escape");
    }
    await context.close();
    console.log(`Captured ${name}`);
  }
} finally {
  await browser.close();
}
const failures = Object.entries(report).filter(([, f]) => f.length);
await writeFile(join(out, "contrast-report.json"), JSON.stringify(report, null, 2));
console.log(failures.length ? `Contrast below WCAG AA on ${failures.length} views:` : "Contrast: every audited text element meets WCAG AA.");
for (const [view, f] of failures) console.log(`  ${view}: ${f.slice(0, 6).map(x => `"${x.text}" ${x.ratio}`).join(" | ")}${f.length > 6 ? ` (+${f.length - 6})` : ""}`);
