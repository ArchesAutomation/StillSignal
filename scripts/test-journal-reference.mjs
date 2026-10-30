// Isolated browser coverage. No production account, broker or wearable is used.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const output = process.env.REVIEW_OUTPUT_DIR || "../reference-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel:
    process.env.BROWSER_CHANNEL ||
    (process.platform === "win32" ? "msedge" : undefined),
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Denver",
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const nav = (name) =>
  page.locator(".ss-reference-nav").getByRole("button", { name, exact: true });
async function open() {
  await page.goto(
    (process.env.UI_REVIEW_URL || "http://localhost:3100") + "/review",
  );
  await page.locator(".ss-journal-trade").first().waitFor({ state: "visible" });
}
try {
  await open();
  const writer = page.getByRole("region", {
    name: "Main journal",
    exact: true,
  });
  await writer
    .getByRole("combobox", { name: "Journal trade", exact: true })
    .selectOption("review-e1");
  await writer
    .getByRole("combobox", { name: "Journal section", exact: true })
    .selectOption("entry");
  await writer
    .getByRole("combobox", { name: "Writing label" })
    .selectOption("Following plan / model");
  await writer
    .getByRole("textbox", { name: "Journal reflection", exact: true })
    .fill(
      "Reference flow: I waited for my setup.\nThese exact words stay together.",
    );
  await writer
    .getByRole("button", { name: "Save to journal", exact: true })
    .click();
  await page
    .locator(".ss-stream-note summary")
    .filter({ hasText: "Reference flow:" })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Daily free writing" })
    .fill("The rest of my day remains separate from trade reflections.");
  await page.getByText("Saved to this day.", { exact: true }).waitFor();
  await page.reload();
  await page.locator(".ss-journal-trade").first().waitFor({ state: "visible" });
  assert.equal(
    await page
      .getByRole("textbox", { name: "Daily free writing" })
      .inputValue(),
    "The rest of my day remains separate from trade reflections.",
  );
  assert.equal(
    await page
      .locator(".ss-stream-note summary")
      .filter({ hasText: "Reference flow:" })
      .count(),
    1,
  );
  console.log(
    "PASS: canonical reflection and independent daily writing survive reload",
  );

  await nav("Prepare").click();
  const prepare = page.locator(".ss-reference-context:visible");
  await prepare
    .getByRole("button", { name: "Save session plan", exact: true })
    .click();
  await prepare.getByText("Saved to this session.", { exact: true }).waitFor();
  await prepare
    .getByRole("combobox", { name: "Environment preset" })
    .selectOption("cafe");
  assert.equal(
    await prepare.getByLabel("Location", { exact: true }).inputValue(),
    "Coffee shop",
  );
  await prepare
    .getByRole("button", { name: "Apply environment change", exact: true })
    .click();
  await prepare.getByText("Environment history · 1", { exact: true }).waitFor();
  await prepare
    .getByLabel("Category", { exact: true })
    .selectOption("Upcoming commitment");
  await prepare.locator('input[name="when"]').fill("2026-10-13T10:00");
  await prepare
    .getByLabel("Your words", { exact: true })
    .fill("Meet a friend during my planned session");
  await prepare
    .getByRole("button", { name: "Add context event", exact: true })
    .click();
  await prepare
    .getByRole("heading", {
      name: "Did having somewhere to be affect your patience or the timing of an entry?",
    })
    .waitFor();
  await prepare
    .getByRole("textbox", { name: "Custom context title" })
    .fill("Settling into a new place");
  await prepare
    .getByRole("button", { name: "Add module", exact: true })
    .click();
  await prepare
    .getByLabel("Settling into a new place", { exact: true })
    .fill("I noticed a different pace today.");
  await prepare
    .getByRole("button", {
      name: "Save Settling into a new place",
      exact: true,
    })
    .click();
  console.log(
    "PASS: environment preset, dated event, transparent proximity question and custom module",
  );

  await nav("Daily journal").click();
  await page
    .getByRole("button", {
      name: "Sunday intentions & weekly review →",
      exact: true,
    })
    .click();
  const week = page.getByRole("region", {
    name: "Weekly intentions and review",
  });
  await week
    .getByLabel("What matters this week?", { exact: true })
    .fill("Patience before action.");
  await week
    .getByLabel("One process commitment", { exact: true })
    .fill("Check the setup first.");
  await week
    .getByRole("button", { name: "Save weekly intentions", exact: true })
    .click();
  await week.getByText("Weekly intentions saved.", { exact: true }).waitFor();
  await week
    .getByLabel("Did I act in line with my intentions? What helped?", {
      exact: true,
    })
    .fill("Waiting helped me see my urge.");
  await week
    .getByRole("button", { name: "Save weekly reflection", exact: true })
    .click();
  await week
    .getByText("Weekly reflection saved. Your initial plan is retained.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await week
      .getByLabel("What matters this week?", { exact: true })
      .inputValue(),
    "Patience before action.",
  );
  assert.equal(
    await week
      .getByLabel("What matters this week?", { exact: true })
      .isDisabled(),
    true,
  );
  await nav("Daily journal").click();

  await nav("Patterns").click();
  await page
    .getByRole("heading", { name: "HR alongside your own labels", exact: true })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Pattern origin" })
    .selectOption("post-session");
  await page
    .getByRole("combobox", { name: "Pattern stage" })
    .selectOption("entry");
  assert.match(
    await page.locator(".ss-reference-patterns").innerText(),
    /1 matching notes/,
  );
  await nav("Daily journal").click();
  console.log("PASS: Patterns uses date/origin/stage controls");

  // Substitute only the screen/quote sources in this isolated browser. The capture,
  // PNG encoding, save, reload and image-reading paths are the actual application.
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    canvas.getContext("2d").fillStyle = "#00ff00";
    canvas.getContext("2d").fillRect(0, 0, 640, 360);
    window.__testChart = canvas;
    setInterval(() => canvas.getContext("2d").fillRect(0, 0, 640, 360), 100);
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => canvas.captureStream(5),
    });
    window.StillSignalQuoteAdapter = {
      readQuote: async ({ capturedAt, symbol }) => ({
        price: 123.45,
        symbol,
        source: "Isolated browser fixture",
        observedAt: capturedAt,
        currency: "USD",
      }),
    };
  });
  await page
    .getByRole("button", { name: "Expand widget", exact: true })
    .click();
  const widget = page.getByRole("complementary", {
    name: "Still Signal live widget",
  });
  await widget
    .getByRole("button", { name: "Share chart for capture", exact: true })
    .click();
  await widget.getByText("Chart surface ready", { exact: true }).waitFor();
  await widget
    .getByRole("textbox", { name: "Capture words" })
    .fill("Evidence at record press.");
  const before = await page.locator(".ss-stream-note").count();
  await widget
    .getByRole("button", { name: "● Record moment", exact: true })
    .click();
  await widget
    .getByRole("button", { name: "Confirm save", exact: true })
    .waitFor();
  assert.equal(await page.locator(".ss-stream-note").count(), before);
  await page.evaluate(() => {
    const c = window.__testChart;
    c.getContext("2d").fillStyle = "#0000ff";
    c.getContext("2d").fillRect(0, 0, 640, 360);
  });
  await widget
    .getByRole("button", { name: "Confirm save", exact: true })
    .click();
  await widget.getByText("Saved to your journal.", { exact: true }).waitFor();
  const moment = page.locator(".ss-stream-note").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Evidence at record press." }),
  });
  await moment.locator(":scope > summary").click();
  await moment
    .getByText("View original moment & evidence", { exact: true })
    .click();
  const image = moment.getByRole("img", {
    name: "Original chart at record press",
  });
  await image.waitFor();
  await image.evaluate((el) => el.decode());
  const pixel = await image.evaluate((el) => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    c.getContext("2d").drawImage(el, 0, 0);
    return Array.from(c.getContext("2d").getImageData(0, 0, 1, 1).data);
  });
  assert.deepEqual(pixel, [0, 255, 0, 255]);
  assert.match(await moment.innerText(), /123.45 USD/);
  console.log(
    "PASS: review before save, frozen native PNG, independent quote and original retained after chart changes",
  );
  await widget
    .getByRole("textbox", { name: "Capture words" })
    .fill("Discard this accidental press.");
  const existing = await page.locator(".ss-stream-note").count();
  await widget
    .getByRole("button", { name: "● Record moment", exact: true })
    .click();
  await widget
    .getByRole("button", { name: "Confirm save", exact: true })
    .waitFor();
  await widget
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  assert.equal(await page.locator(".ss-stream-note").count(), existing);

  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const audio = new AudioContext();
        await audio.resume();
        const tone = audio.createOscillator(),
          destination = audio.createMediaStreamDestination();
        tone.connect(destination);
        tone.start();
        window.__testAudio = audio;
        return destination.stream;
      },
    });
  });
  await widget
    .getByLabel("Record and retain original audio on this device for 7 days", {
      exact: true,
    })
    .check();
  await widget
    .getByRole("textbox", { name: "Capture words" })
    .fill("Original audio playback check.");
  await widget
    .getByRole("button", { name: "● Record moment", exact: true })
    .click();
  await widget
    .getByRole("button", { name: "Stop recording", exact: true })
    .waitFor();
  await page.waitForTimeout(500);
  await widget
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await widget
    .getByRole("button", { name: "Confirm save", exact: true })
    .waitFor();
  await widget
    .getByRole("button", { name: "Confirm save", exact: true })
    .click();
  await widget.getByText("Saved to your journal.", { exact: true }).waitFor();
  const audioMoment = page.locator(".ss-stream-note").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Original audio playback check." }),
  });
  await audioMoment.locator(":scope > summary").click();
  const audio = audioMoment.locator(
    'audio[aria-label="Original reflection audio"]',
  );
  await audio.waitFor();
  await audio.evaluate((element) => element.play());
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        'audio[aria-label="Original reflection audio"]',
      ),
    ].some((element) => element.currentTime > 0),
  );
  await audio.evaluate((element) => element.pause());
  console.log("PASS: native MediaRecorder audio persists and plays back");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .getByRole("button", { name: "Collapse widget", exact: true })
    .click();
  await page.screenshot({ path: output + "/journal-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole("button", { name: "Weekly review →", exact: true })
    .waitFor();
  await page.screenshot({ path: output + "/journal-mobile.png" });
  await nav("Prepare").click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: output + "/prepare-mobile.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: discard, desktop/mobile layout, zero application errors");
} finally {
  await browser.close();
}
