import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../src/components/dashboard";
import { Timeline } from "../src/components/timeline";
import { reviewFixtures, reviewInstrument, reviewOwner } from "../src/lib/staging-fixtures";

function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://trade-pulse.test" });
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, localStorage: dom.window.localStorage,
    FormData: dom.window.FormData,
  })) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.fetch = async () => Response.json({ cloudConfigured: false });
  const reviewFlag = process.env.NEXT_PUBLIC_UI_REVIEW;
  process.env.NEXT_PUBLIC_UI_REVIEW = "true";
  const root = createRoot(document.getElementById("root")!);
  return {
    root, dom,
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
      if (reviewFlag === undefined) delete process.env.NEXT_PUBLIC_UI_REVIEW;
      else process.env.NEXT_PUBLIC_UI_REVIEW = reviewFlag;
    },
  };
}
async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i++)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  assert.ok(condition(), "UI update must complete");
}
const status = () => document.querySelector(".feed-status")?.textContent || "";

test("unavailable market controls explain the fallback and allow retry", async () => {
  const ui = setup();
  try {
    const { session } = reviewFixtures();
    await act(async () => ui.root.render(createElement(Timeline, {
      owner: reviewOwner, samples: [], events: [], journal: [], baseline: null,
      start: session.startedAt, end: session.endedAt!, onSelect() {},
      instrument: { ...reviewInstrument, id: "unconfigured:MSFT", symbol: "MSFT" },
    })));
    await until(() => status().includes("Only the labeled review instrument"));
    for (const selector of ['[aria-label="Heart-rate pane size"]', 'input[type="checkbox"]'])
      assert.equal((document.querySelector(selector) as HTMLInputElement).disabled, true);
    assert.match(document.getElementById("market-controls-help")!.textContent!, /require an available market chart/);
    const interval = document.querySelector('[aria-label="Candle interval"]') as HTMLSelectElement;
    assert.equal(interval.disabled, false);
    for (const [value, label] of [["300", "5m"], ["900", "15m"], ["3600", "1h"], ["60", "1m"]]) {
      await act(async () => { interval.value = value; interval.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true })); });
      await until(() => status().includes(label + " selected") && status().includes("Only the labeled review instrument"));
      assert.match(document.getElementById("market-controls-help")!.textContent!, new RegExp(label));
    }
    const retry = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Retry feed"));
    assert.ok(retry);
    assert.equal(retry.disabled, false);
    assert.ok(document.querySelector('svg[aria-label="Heart rate and trading events on a synchronized timeline"]'));
  } finally { await ui.close(); }
});

test("manual instrument resolution cannot override toolbar selection or another session", async () => {
  const ui = setup();
  try {
    const { session } = reviewFixtures();
    const props: ComponentProps<typeof Timeline> = {
      owner: reviewOwner, samples: [], events: [], journal: [], baseline: null,
      start: session.startedAt, end: session.endedAt!, onSelect() {}, instrumentScope: "session-a",
    };
    await act(async () => ui.root.render(createElement(Timeline, props)));
    (document.querySelector('[name="symbol"]') as HTMLInputElement).value = "MSFT";
    (document.querySelector('[name="exchange"]') as HTMLInputElement).value = "XNAS";
    await act(async () => document.querySelector("form")!.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    await until(() => status().includes("Only the labeled review instrument"));
    await act(async () => ui.root.render(createElement(Timeline, { ...props, instrument: reviewInstrument })));
    await until(() => status().includes("Synthetic review feed"));
    assert.match(status(), /75 candles/);
    await act(async () => ui.root.render(createElement(Timeline, { ...props, instrumentScope: "session-b" })));
    await until(() => status().includes("Choose an exact instrument"));
    assert.doesNotMatch(document.querySelector(".instrument-resolver summary")!.textContent!, /MSFT/);
  } finally { await ui.close(); }
});

test("Overview keeps a single exact instrument when All instruments is selected and after tab navigation", async () => {
  const ui = setup();
  try {
    const { session } = reviewFixtures();
    await act(async () => ui.root.render(createElement(Dashboard, {
      user: { id: reviewOwner, email: "review@example.test" }, initialSession: session,
    })));
    await until(() => status().includes("Synthetic review feed"));
    const select = document.querySelector('[aria-label="Workspace instrument"]') as HTMLSelectElement;
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(select.value, "");
    assert.match(status(), /Synthetic review feed/);
    for (const tab of ["Settings", "Overview"]) {
      const button = [...document.querySelectorAll("nav button")].find((b) => b.textContent?.trim() === tab)!;
      await act(async () => (button as HTMLButtonElement).click());
    }
    await until(() => status().includes("Synthetic review feed"));
    assert.equal((document.querySelector('[aria-label="Workspace instrument"]') as HTMLSelectElement).value, "");
  } finally { await ui.close(); }
});
