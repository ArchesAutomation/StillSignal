import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const out = "../plan-review";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  timezoneId: "America/Denver",
  permissions: ["microphone"],
});
await context.addInitScript(() => {
  Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
    value: async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 640;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#122324";
      ctx.fillRect(0, 0, 1024, 640);
      ctx.fillStyle = "#80c9ac";
      ctx.font = "32px sans-serif";
      ctx.fillText("Isolated acceptance test chart", 60, 80);
      ctx.strokeStyle = "#ee957d";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(30, 400);
      ctx.lineTo(180, 300);
      ctx.lineTo(350, 350);
      ctx.lineTo(600, 170);
      ctx.lineTo(950, 210);
      ctx.stroke();
      const stream = canvas.captureStream(10);
      let frame = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = "#122324";
        ctx.fillRect(0, 550, 1024, 80);
        ctx.fillStyle = "#80c9ac";
        ctx.fillText("Frame " + ++frame, 60, 600);
      }, 100);
      stream
        .getVideoTracks()[0]
        .addEventListener("ended", () => clearInterval(timer));
      return stream;
    },
  });
  class TestSpeech {
    continuous = true;
    interimResults = false;
    lang = "en-US";
    onresult = null;
    onerror = null;
    onend = null;
    start() {
      this.timer = setTimeout(
        () =>
          this.onresult?.({
            results: [
              {
                isFinal: true,
                0: {
                  transcript:
                    "I noticed the urge to enter before my setup was ready.",
                },
              },
            ],
          }),
        200,
      );
    }
    stop() {
      clearTimeout(this.timer);
      this.onend?.();
    }
    abort() {
      clearTimeout(this.timer);
    }
  }
  window.SpeechRecognition = TestSpeech;
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const nav = (name) =>
  page.locator(".ss-reference-nav").getByRole("button", {
    name: name === "Journal" ? "Daily journal" : name,
    exact: true,
  });
const activeWidget = () => page.locator(".ss-compact-widget-host");
async function localSessions() {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("trade-pulse-v1");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res, rej) => {
      const r = db.transaction("sessions").objectStore("sessions").getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  });
}
try {
  await page.goto(
    (process.env.UI_REVIEW_URL || "http://localhost:3100") + "/review",
  );
  await page.locator(".ss-inline-moment").first().waitFor();
  const first = page.locator(".ss-inline-moment").first();
  const id = await first.getAttribute("data-note-id");
  await first
    .getByLabel("Feeling or thought", { exact: true })
    .fill("Patient after review");
  await first.getByLabel("Feeling or thought", { exact: true }).press("Enter");
  await first
    .getByRole("textbox", { name: "Moment writing", exact: true })
    .fill("Corrected directly in this row.");
  await first
    .getByRole("textbox", { name: "Moment writing", exact: true })
    .blur();
  await first.getByRole("status").getByText("Saved", { exact: true }).waitFor();
  console.log("inline edits saved");
  await page.reload();
  await page.locator(`[data-note-id="${id}"]`).waitFor();
  assert.equal(
    await page
      .locator(`[data-note-id="${id}"]`)
      .getByRole("textbox", { name: "Moment writing", exact: true })
      .inputValue(),
    "Corrected directly in this row.",
  );
  await page
    .locator(`[data-note-id="${id}"]`)
    .getByRole("button", { name: "Remove moment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Undo removal", exact: true })
    .first()
    .click();
  await page.locator(`[data-note-id="${id}"]`).waitFor();
  for (const name of [
    "Heart rate",
    "Realised P&L",
    "Unrealised P&L",
    "Executions",
    "Moments",
  ]) {
    const b = page.getByRole("group", { name: "Chart layers" });
    const layer = page
      .locator(".ss-chart-layers")
      .getByRole("button", { name, exact: true });
    await layer.click();
    assert.equal(await layer.getAttribute("aria-pressed"), "false");
    await layer.click();
  }
  const chart = page.locator(".ss-rhythm-svg");
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + 85, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Reset zoom", exact: true }).click();
  console.log("chart layers and zoom passed");
  await nav("Patterns").click();
  await page.getByRole("region", { name: "Event responses" }).waitFor();
  await page
    .getByRole("button", { name: "Connect a supported source", exact: true })
    .waitFor();
  await page
    .getByText("Preview what this could show · example data", { exact: true })
    .click();
  assert.match(
    await page.locator(".ss-profit-preview").textContent(),
    /not your data/,
  );
  await page.screenshot({
    path: out + "/patterns-desktop.png",
    fullPage: true,
  });
  await nav("Journal").click();
  await activeWidget()
    .getByRole("button", { name: "Capture options", exact: true })
    .click();
  await activeWidget()
    .getByRole("button", { name: "Choose a chart", exact: true })
    .click();
  await activeWidget()
    .getByRole("button", { name: "Close options", exact: true })
    .click();
  console.log("chart sharing ready");
  const before = (await localSessions()).flatMap((s) => s.journal).length;
  // Alt+J from a text input starts and stops the same recorder without opening an editor.
  await page
    .getByRole("textbox", { name: "Daily free writing", exact: true })
    .focus();
  await page.keyboard.press("Alt+j");
  await activeWidget()
    .getByRole("button", {
      name: "Stop recording and save moment",
      exact: true,
    })
    .waitFor();
  await page.waitForTimeout(1100);
  await page.keyboard.press("Alt+j");
  await activeWidget()
    .getByText("Saved to journal · add feelings or thoughts later.", {
      exact: true,
    })
    .waitFor();
  const sessions = await localSessions(),
    captures = sessions
      .flatMap((s) => s.journal)
      .filter((n) => n.capture?.imagePath && n.audio);
  assert.equal(captures.length, 1);
  const captured = captures[0];
  assert.equal(captured.label, "Unlabelled");
  assert.match(captured.originalTranscript, /urge to enter/);
  assert.ok(captured.capture.imageCapturedAt >= captured.capture.pressedAt);
  const row = page.locator(`[data-note-id="${captured.id}"]`).first();
  await row
    .getByRole("button", { name: "Expand moment evidence", exact: true })
    .click();
  const audio = row.locator("audio");
  await audio.waitFor();
  await audio.evaluate((a) => a.play());
  await page.waitForTimeout(150);
  assert.equal(await audio.evaluate((a) => a.paused), false);
  const img = row.getByRole("img", {
    name: "Original chart at record press",
    exact: true,
  });
  await img.waitFor();
  assert.equal(await img.evaluate((i) => i.naturalWidth), 1024);
  assert.ok((await img.boundingBox()).width <= 190);
  await row
    .getByLabel("Feeling or thought", { exact: true })
    .fill("Urge to enter");
  await row.getByLabel("Feeling or thought", { exact: true }).press("Enter");
  await row
    .getByRole("textbox", { name: "Moment writing", exact: true })
    .fill("I waited and followed my plan.");
  await row
    .getByRole("textbox", { name: "Moment writing", exact: true })
    .blur();
  await row.getByRole("status").getByText("Saved", { exact: true }).waitFor();
  const changed = (await localSessions())
    .flatMap((s) => s.journal)
    .find((n) => n.id === captured.id);
  assert.equal(changed.capture.pressedAt, captured.capture.pressedAt);
  assert.equal(changed.originalTranscript, captured.originalTranscript);
  assert.equal(changed.audio.path, captured.audio.path);
  assert.ok(changed.labelAddedAt);
  await page.reload();
  const restored = page.locator(`[data-note-id="${captured.id}"]`).first();
  await restored.waitFor();
  await restored
    .getByRole("button", { name: "Expand moment evidence", exact: true })
    .click();
  await restored.locator("audio").evaluate((a) => a.play());
  assert.equal(
    await restored.locator("audio").evaluate((a) => a.paused),
    false,
  );
  console.log("original capture, edits and reload playback passed");
  // A session stays open through away intervals and bounded chart history.
  await page
    .getByRole("button", { name: "Start Session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "End Session", exact: true })
    .waitFor();
  const liveId = (await localSessions()).find((s) => !s.endedAt)?.id;
  await activeWidget()
    .getByRole("button", { name: "Capture options", exact: true })
    .click();
  await activeWidget()
    .getByRole("button", { name: "Pause measurement", exact: true })
    .click();
  await activeWidget()
    .getByRole("button", { name: "Resume measurement", exact: true })
    .waitFor();
  assert.equal(
    (await localSessions()).find((s) => s.id === liveId).endedAt,
    undefined,
  );
  await activeWidget()
    .getByRole("button", { name: "Resume measurement", exact: true })
    .click();
  await activeWidget()
    .getByRole("button", { name: "Choose a chart", exact: true })
    .click();
  await activeWidget()
    .getByRole("button", { name: "Capture settings", exact: true })
    .click();
  await activeWidget()
    .getByText("History cadence · seconds", { exact: true })
    .locator("input")
    .fill("10");
  await activeWidget()
    .getByText("History frame limit", { exact: true })
    .locator("input")
    .fill("1");
  await activeWidget()
    .getByRole("button", { name: "Start chart history", exact: true })
    .click();
  await page.waitForTimeout(11000);
  const withHistory = (await localSessions()).find((s) => s.id === liveId);
  assert.equal(withHistory.blueprint.chartFrames.length, 1);
  assert.ok(withHistory.blueprint.measurementPauses[0].end);
  await activeWidget()
    .getByRole("button", { name: "Stop chart history", exact: true })
    .click();
  await activeWidget()
    .getByRole("button", { name: "Close options", exact: true })
    .click();
  console.log(
    "active-session pause/resume and real periodic frame storage passed",
  );
  await page.screenshot({ path: out + "/journal-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/journal-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      captureId: captured.id,
      originalAudio: !!captured.audio,
      transcript: !!captured.originalTranscript,
      frameWidth: 1024,
      widget: await page.locator(".ss-capture-pill").first().boundingBox(),
      consoleErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
