const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.GUIDE_QA_URL || "http://127.0.0.1:3001";
const output = process.env.GUIDE_QA_OUTPUT || "../../outputs";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "msedge",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["microphone"],
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "still-signal-appearance",
      JSON.stringify({ theme: "dark", shark: "#87b9ca", accent: "#c5d7df" }),
    ),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mainNav = (name) =>
    page
      .locator(".ss-reference-nav")
      .getByRole("button", { name, exact: true });
  const footer = () => page.locator(".journal-guide:visible > .guide-footer");
  const next = () =>
    footer().getByRole("button", { name: "Continue →", exact: true }).click();
  const focus = () => page.locator(".guide-focus:visible");
  const check = async (name) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name}: no page overflow`,
    );
  };
  try {
    await page.goto(base + "/review");
    await mainNav("Command Center").click();
    await page
      .getByRole("button", {
        name: /Start today.s preparation|Start \/ resume preparation/,
      })
      .first()
      .click();
    if (
      await page
        .getByRole("button", { name: /Open today.s preparation/ })
        .count()
    )
      await page
        .getByRole("button", { name: /Open today.s preparation/ })
        .click();
    await page
      .getByRole("heading", { name: "A clear path through your trading day" })
      .waitFor();
    assert.equal(
      await page.locator(".shark-background canvas").count(),
      1,
      "one production ocean canvas",
    );
    assert.ok(
      await page.locator(".cc-panel.lg-glass-surface").count(),
      "production GlassPanel material retained",
    );
    await next();
    await focus()
      .getByLabel("How long do you usually hold a position?")
      .selectOption("scalp");
    await focus().getByLabel("What do you trade? (optional)").fill("AAPL");
    await next();
    await focus().getByLabel("A pattern I recognise").selectOption("results");
    await focus()
      .getByLabel("What happens for you? (optional)")
      .fill("I rush to recover after a loss.");
    await page.screenshot({
      path: output + "/guided-setup-desktop.png",
      fullPage: true,
    });
    await next();
    await focus()
      .getByLabel(/What matters over the next month/)
      .fill("Build a repeatable process over my career.");
    await focus()
      .getByLabel(/Your risk commitments/)
      .fill(
        "Use my own maximum risk per trade.\nPause when my entry conditions are absent.",
      );
    await page
      .getByRole("button", { name: "Save draft & return later", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: /Start today.s preparation|Start \/ resume preparation/,
      })
      .first()
      .click();
    await focus()
      .getByLabel(/What matters over the next month/)
      .waitFor();
    assert.equal(
      await focus()
        .getByLabel(/What matters over the next month/)
        .inputValue(),
      "Build a repeatable process over my career.",
    );
    await next();
    await focus()
      .getByRole("checkbox", { name: /Use the questions above/ })
      .check();
    assert.match(
      await focus().getByLabel("Your question 1").inputValue(),
      /regardless of the result/,
    );
    await next();
    await focus()
      .getByRole("button", { name: "+ My words", exact: true })
      .click();
    await focus()
      .getByLabel("My words", { exact: true })
      .fill("One result does not define my career. Return to my process.");
    await focus()
      .getByRole("button", { name: "Record a message", exact: true })
      .click();
    await focus()
      .getByRole("button", { name: "Stop & save recording", exact: true })
      .waitFor();
    await page.waitForTimeout(500);
    await focus()
      .getByRole("button", { name: "Stop & save recording", exact: true })
      .click();
    await focus().getByLabel("Your saved message").waitFor();
    await next();
    await next();
    await focus()
      .getByRole("button", {
        name: "Guide me through my first rule & mission",
        exact: true,
      })
      .click();
    for (const text of [
      "Wait for my chosen confirmation.",
      "Use my own sizing plan.",
      "Respect my chosen risk limit.",
      "My invalidation condition is met.",
      "I checked my entry conditions before submitting.",
    ]) {
      await focus().getByLabel("Your words (optional)").fill(text);
      await next();
    }
    await focus()
      .getByLabel(/Name one rule/)
      .fill("Waited for entry confirmation");
    await focus()
      .getByRole("checkbox", { name: /Also practise/ })
      .check();
    await footer()
      .getByRole("button", { name: "Save my rule & mission", exact: true })
      .click();
    await footer()
      .getByRole("button", {
        name: "Save & open my preparation →",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Arrive & check in", exact: true })
      .waitFor();
    await next();
    await focus()
      .getByRole("button", { name: "Focus: 7 of 10", exact: true })
      .click();
    for (let i = 0; i < 5; i++)
      await focus()
        .getByRole("button", { name: "Continue check-in →", exact: true })
        .click();
    await focus()
      .getByLabel(/What could this mean for my approach/)
      .fill("I feel focused and will notice any urge to rush.");
    await focus()
      .getByRole("button", { name: "Record check-in", exact: true })
      .click();
    await next();
    await footer()
      .getByRole("button", { name: "Save section & continue →", exact: true })
      .click();
    for (const narrative of [
      "My weekly market context.",
      "My daily narrative: wait for confirmation.",
    ]) {
      await next();
      await focus().locator('textarea[name="primary"]').fill(narrative);
      if (narrative.includes("weekly"))
        await focus()
          .locator('input[type="file"]')
          .setInputFiles({
            name: "chart.png",
            mimeType: "image/png",
            buffer: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=",
              "base64",
            ),
          });
      await focus()
        .getByRole("button", { name: /^Save thesis/ })
        .click();
      await focus()
        .getByRole("button", { name: /^Revise thesis/ })
        .waitFor();
      await next();
      await footer()
        .getByRole("button", { name: "Save section & continue →", exact: true })
        .click();
    }
    await next();
    await next();
    await focus()
      .getByLabel("Your answer", { exact: true })
      .fill("My chosen risk limit and pause commitment.");
    await next();
    await footer()
      .getByRole("button", { name: "Save section & continue →", exact: true })
      .click();
    await next();
    assert.match(
      await focus().innerText(),
      /Practise Waited for entry confirmation/,
    );
    await next();
    await footer()
      .getByRole("button", { name: "Save section & continue →", exact: true })
      .click();
    await next();
    await focus().getByLabel("Caffeine per serving (mg, editable)").fill("150");
    await focus()
      .getByRole("button", { name: "Add caffeine entry", exact: true })
      .click();
    await focus()
      .getByText("1 entries · 150 mg recorded today", { exact: true })
      .waitFor();
    await focus()
      .getByRole("button", { name: "Correct amount / time", exact: true })
      .click();
    await focus().getByLabel("Caffeine per serving (mg, editable)").fill("175");
    await focus()
      .getByRole("button", { name: "Save correction", exact: true })
      .click();
    await focus()
      .getByText("1 entries · 175 mg recorded today", { exact: true })
      .waitFor();
    await next();
    await footer()
      .getByRole("button", { name: "Save section & continue →", exact: true })
      .click();
    await next();
    await focus()
      .getByLabel("Your answer", { exact: true })
      .fill("Follow my entry conditions regardless of outcome.");
    await next();
    await focus()
      .getByLabel("Your answer", { exact: true })
      .fill("Build a repeatable process over my career.");
    await next();
    await next();
    await footer()
      .getByRole("button", { name: "Save section & continue →", exact: true })
      .click();
    await focus()
      .getByText("A few reflections are unanswered", { exact: true })
      .waitFor();
    await focus()
      .getByRole("button", {
        name: "Skip unanswered reflections & save",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Your preparation is saved", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Open my Command Center", exact: true })
      .click();
    const summary = page.locator(".guide-summary");
    await summary
      .getByRole("button", {
        name: "Edit what is today's process goal?",
        exact: true,
      })
      .click();
    await summary
      .getByLabel("What is today's process goal?", { exact: true })
      .fill("Wait for my confirmation and document the process.");
    await summary
      .getByRole("button", { name: "Save this answer", exact: true })
      .click();
    await summary
      .getByText("Wait for my confirmation and document the process.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("combobox", { name: "Daily bias", exact: true })
      .selectOption("bullish");
    await page.waitForFunction(
      () =>
        document.querySelector(".guide-summary select")?.value === "bullish",
    );
    await check("Command Center");
    await mainNav("Stillness").click();
    if (await page.locator(".ss-stillnesswelcome[open]").count())
      await page.locator(".ss-stillnesswelcome").getByRole("button").click();
    await page
      .getByText("A message from you, for you", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Preview / play my routine", exact: true })
      .click();
    await page
      .getByText(
        "One result does not define my career. Return to my process.",
        { exact: true },
      )
      .waitFor();
    await mainNav("Command Center").click();
    await page
      .getByRole("button", { name: "Review session →", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Review this session", exact: true })
      .waitFor();
    for (const [index, status] of [
      [0, "broken"],
      [1, "followed"],
    ]) {
      await page
        .locator(".guide-trade-status")
        .nth(index)
        .getByRole("button", { name: "Review this trade", exact: true })
        .click();
      await page
        .locator(".guide-rule-focus")
        .getByLabel("What do you confirm?", { exact: true })
        .selectOption(status);
      await page
        .locator(".guide-rule-focus")
        .getByRole("button", { name: "Save & continue", exact: true })
        .click();
      await page.locator(".guide-rule-focus").waitFor({ state: "hidden" });
    }
    assert.match(
      await page.locator(".guide-trade-status").nth(0).innerText(),
      /Not followed/,
    );
    assert.match(
      await page.locator(".guide-trade-status").nth(1).innerText(),
      /Followed/,
    );
    await page
      .locator(".guide-trade-status")
      .nth(0)
      .getByRole("button", { name: "Review this trade", exact: true })
      .click();
    await page
      .locator(".guide-rule-focus")
      .getByLabel("What do you confirm?", { exact: true })
      .selectOption("followed");
    await page
      .locator(".guide-rule-focus")
      .getByRole("button", { name: "Save & continue", exact: true })
      .click();
    await page.locator(".guide-rule-focus").waitFor({ state: "hidden" });
    await page.screenshot({
      path: output + "/guided-session-review.png",
      fullPage: true,
    });
    await mainNav("Command Center").click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page
      .getByRole("button", { name: /Start \/ resume preparation/ })
      .click();
    await page
      .getByRole("heading", { name: "Your preparation is saved", exact: true })
      .waitFor();
    await page.screenshot({
      path: output + "/guided-preparation-complete.png",
      fullPage: true,
    });
    await page.locator(".appearance-controls > summary").click();
    await page
      .locator(".appearance-controls")
      .locator("select")
      .first()
      .selectOption("light");
    await page
      .locator(".appearance-controls")
      .locator("select")
      .first()
      .evaluate((el) => el.blur());
    await page.locator(".appearance-controls > summary").click();
    await check("Light mode");
    await page.screenshot({
      path: output + "/guided-preparation-light.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await check("Mobile");
    await page.screenshot({
      path: output + "/guided-preparation-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mainNav("Daily journal").click();
    const timeline = page.getByRole("img", {
      name: "Combined session timeline with BPM and currency axes", exact: true,
    });
    await timeline.scrollIntoViewIfNeeded();
    assert.equal(await timeline.evaluate(el => {
      const event = new WheelEvent("wheel", { deltaY: 180, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    }), false, "timeline permits ordinary page scrolling");
    const boardKey =
      "still-signal-modules-v2:88888888-8888-4888-8888-888888888888:Journal";
    const beforePreset = await page.evaluate(
      (key) => localStorage.getItem(key),
      boardKey,
    );
    await page.locator(".guide-appearance > summary").click();
    await page
      .locator(".guide-appearance select")
      .nth(1)
      .selectOption("evidence");
    await page.waitForFunction(() => {
      const a = document.querySelector(
          '.ss-free-board [data-module-id="evidence"]',
        ),
        b = document.querySelector('.ss-free-board [data-module-id="moments"]');
      return (
        a &&
        b &&
        a.getBoundingClientRect().width > b.getBoundingClientRect().width
      );
    });
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), boardKey),
      beforePreset,
      "reading preset preserves saved layout",
    );
    await page
      .locator(".guide-appearance")
      .getByRole("button", {
        name: "Show me how Still Signal works",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Still Signal guided tour", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Still Signal guided tour", exact: true })
      .waitFor({ state: "hidden" });
    await check("Evidence preset");
    await page.screenshot({
      path: output + "/guided-evidence-preset.png",
      fullPage: true,
    });
    assert.deepEqual(errors, [], "no unhandled browser errors");
    console.log(
      JSON.stringify({
        passed: true,
        errors,
        checks: [
          "production glass and ocean retained",
          "setup save-and-return",
          "habit-derived prompt approval",
          "recorded personal stillness",
          "first rule and seven-day mission",
          "shared check-in",
          "weekly/daily thesis and chart attachment",
          "editable caffeine without duplicate doses",
          "one end reminder",
          "single-answer summary edit",
          "per-trade review and correction",
          "dark/light/mobile layouts",
          "wider evidence preset preserves saved layout",
          "keyboard-dismissable software tour",
          "ordinary scrolling is not intercepted by the timeline",
        ],
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
