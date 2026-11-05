import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.emulateMedia({ colorScheme: "dark" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const studio = page.getByRole("region", { name: "Wallpaper & glass", exact: true });
async function settings() {
  await page.goto("http://localhost:3113/review");
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await studio.waitFor();
}
try {
  await settings();
  await studio.getByRole("button", { name: "Aurora", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.wallpaper === "image");
  await studio.getByRole("button", { name: "Frosted", exact: true }).click();
  assert.equal(await studio.getByLabel("Blur", { exact: true }).inputValue(), "24");
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--lg-user-blur")), "24px");
  await studio.getByLabel("Refraction", { exact: true }).fill("60");
  await studio.getByLabel("Thickness", { exact: true }).fill("1.5");
  await studio.getByLabel("Wallpaper dimming", { exact: true }).fill("40");
  await page.waitForTimeout(300);
  await settings();
  assert.equal(await studio.getByLabel("Refraction", { exact: true }).inputValue(), "60");
  assert.equal(await studio.getByLabel("Thickness", { exact: true }).inputValue(), "1.5");
  assert.equal(await studio.getByLabel("Wallpaper dimming", { exact: true }).inputValue(), "40");
  const image = await page.locator(".wallpaper-preview").screenshot();
  await studio.getByLabel("Upload custom wallpaper", { exact: true }).setInputFiles({ name: "My wallpaper.png", mimeType: "image/png", buffer: image });
  const custom = studio.getByRole("button", { name: "My wallpaper", exact: true });
  await custom.waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("still-signal-appearance")).wallpaper.startsWith("custom-"));
  await settings();
  assert.equal(await custom.getAttribute("aria-pressed"), "true");
  await studio.getByLabel("Reduce transparency for easier reading").check();
  assert.equal(await page.locator("html").getAttribute("data-lg-reduce-transparency"), "1");
  await studio.getByLabel("Reduce transparency for easier reading").uncheck();
  await studio.getByRole("button", { name: "Balanced", exact: true }).click();
  await studio.getByRole("button", { name: "Aurora", exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await studio.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px overflow`);
    if (process.env.WALLPAPER_SCREENSHOTS) {
      await studio.evaluate(element => { for (let node = element; node; node = node.parentElement) node.scrollTop = 0; });
      await page.screenshot({ path: `${process.env.WALLPAPER_SCREENSHOTS}/wallpaper-${width}.png`, fullPage: true });
    }
  }
  await custom.click();
  await studio.getByRole("button", { name: "Remove selected", exact: true }).click();
  await custom.waitFor({ state: "detached" });
  await settings();
  assert.equal(await studio.getByRole("button", { name: "Living ocean", exact: true }).getAttribute("aria-pressed"), "true");
  await studio.getByLabel("Upload custom wallpaper", { exact: true }).setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await studio.getByRole("alert").waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: wallpaper upload, persistence, deletion, validation, material sliders, presets, reduced transparency, desktop and mobile layout");
} finally { await browser.close(); }
