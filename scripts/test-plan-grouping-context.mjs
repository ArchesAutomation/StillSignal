import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  timezoneId: "America/Denver",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(
    (process.env.UI_REVIEW_URL || "http://localhost:3100") + "/review",
  );
  await page.locator(".ss-journal-trade").first().waitFor();
  await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open("trade-pulse-v1");
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction("sessions", "readwrite"),
      store = tx.objectStore("sessions");
    const all = await new Promise((res) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result);
    });
    const s = all[0],
      t = s.startedAt;
    s.events = [
      ...s.events.map((e) => ({ ...e, voided: true, revision: Date.now() })),
      ...Array.from({ length: 6 }, (_, i) => ({
        ...s.events[0],
        id: "six-" + i,
        t: t + (i + 1) * 60000,
        kind: i < 3 ? "entry" : "exit",
        quantity: 1,
        side: "long",
      })),
    ];
    s.journal = [
      ...s.journal.map((n) => ({
        ...n,
        deletedAt: Date.now() - 700000,
        updatedAt: Date.now(),
      })),
      {
        id: "linked-six",
        t: t + 120000,
        eventTime: t + 120000,
        tradeId: "six-0",
        section: "entry",
        text: "Original linked evidence",
        label: "Calm",
      },
    ];
    s.blueprint = {
      updatedAt: Date.now() + 1000,
      combine: {
        audio: true,
        transcript: true,
        hr: true,
        pnl: true,
        profile: false,
        environment: true,
      },
      environmentHistory: [
        {
          id: "home",
          effectiveAt: t,
          recordedAt: t,
          timezone: "UTC",
          location: "Home desk",
          country: "US",
          social: "Alone",
          setup: "Desk",
          interruptions: "",
        },
      ],
      lifestyle: [
        {
          id: "coffee",
          category: "Caffeine / exercise",
          categoryLabel: "Caffeine",
          answer: "yes",
          text: "Coffee",
          start: t,
          linkedDay: "2026-10-13",
          timezone: "UTC",
          recordedAt: t,
        },
      ],
    };
    store.put(s);
    for (let d = 1; d < 3; d++) {
      const day = t + d * 86400000;
      store.put({
        ...s,
        id: crypto.randomUUID(),
        startedAt: day,
        endedAt: day + 3600000,
        sampleCount: 0,
        events: s.events.map((e) => ({
          ...e,
          id: "day" + d + e.id,
          t: e.t + d * 86400000,
        })),
        journal: [
          {
            id: "daynote" + d,
            t: day + 120000,
            eventTime: day + 120000,
            text: "Day " + d,
            label: "Calm",
            capturedAt: day + 120000,
          },
        ],
        blueprint: {
          ...s.blueprint,
          environmentHistory: [
            {
              ...s.blueprint.environmentHistory[0],
              effectiveAt: day,
              recordedAt: day,
              location: d === 1 ? "Cafe" : "Home desk",
            },
          ],
          lifestyle:
            d === 1
              ? [
                  {
                    ...s.blueprint.lifestyle[0],
                    id: "no-coffee",
                    answer: "no",
                    start: day,
                    linkedDay: "2026-10-14",
                    recordedAt: day,
                  },
                ]
              : [],
        },
      });
    }
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  });
  await page.reload();
  await page.getByText("Trade idea 1 · 6 fills", { exact: true }).waitFor();
  await page
    .getByText("Review grouping · split / merge / undo", { exact: true })
    .click();
  await page
    .getByRole("button", { name: /Split this journal idea here/ })
    .nth(1)
    .click();
  await page.getByRole("region", { name: "Grouping preview" }).waitFor();
  assert.equal(await page.locator(".ss-journal-trade").count(), 1);
  await page
    .getByRole("button", { name: "Confirm split", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo split", exact: true }).waitFor();
  assert.equal(await page.locator(".ss-journal-trade").count(), 2);
  await page.getByRole("button", { name: "Undo split", exact: true }).click();
  await page.getByText("Trade idea 1 · 6 fills", { exact: true }).waitFor();
  assert.ok((await page.locator('[data-note-id="linked-six"]').count()) >= 1);
  console.log("six-fill grouping preview, confirm and undo passed");
  await page
    .locator(".ss-reference-nav")
    .getByRole("button", { name: "Patterns", exact: true })
    .click();
  await page.getByLabel("Patterns to", { exact: true }).fill("2026-10-15");
  await page
    .getByRole("region", { name: "Event responses" })
    .getByText("9 events · 3 dates", { exact: true })
    .first()
    .waitFor();
  await page
    .getByLabel("Pattern Location", { exact: true })
    .selectOption("Home desk");
  await page
    .getByLabel("Pattern lifestyle category", { exact: true })
    .selectOption("Caffeine");
  await page
    .getByRole("region", { name: "Context filters" })
    .getByText("Unknown / not recorded", { exact: true })
    .last()
    .waitFor();
  await page
    .getByLabel("Pattern category answer", { exact: true })
    .selectOption("yes");
  assert.match(
    await page.getByRole("region", { name: "Context filters" }).textContent(),
    /1 eligible notes · 1 eligible sessions/,
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.match(
    await page.getByRole("region", { name: "Context filters" }).textContent(),
    /3 eligible notes · 3 eligible sessions/,
  );
  await page.screenshot({
    path: "../plan-review/patterns-context.png",
    fullPage: true,
  });
  console.log(
    "context filters, Unknown group, clear and date-scoped event counts passed",
  );
  await page
    .locator(".ss-reference-nav")
    .getByRole("button", { name: "Daily journal", exact: true })
    .click();
  const reminder = page.getByRole("complementary", {
    name: "Pending weekly review",
  });
  await reminder.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.reload();
  assert.equal(
    await page
      .getByRole("complementary", { name: "Pending weekly review" })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log("weekly dismissal persists across reload; PASS");
} finally {
  await browser.close();
}
