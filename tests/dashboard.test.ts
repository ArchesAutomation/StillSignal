import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../src/components/dashboard";
import AuthGate from "../src/components/auth-gate";
function domSetup() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://trade-pulse.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    FormData: dom.window.FormData,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  globalThis.fetch = async () => Response.json({ cloudConfigured: false });
  return dom;
}
test("signed-out visitors see sign-in, no sample dashboard or personal session data", async () => {
  const dom = domSetup();
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(createElement(AuthGate)));
  assert.match(document.body.textContent!, /Welcome to Still Signal/);
  assert.ok(document.querySelector("input[type=password]"));
  assert.equal(
    document.querySelector(
      'svg[aria-label="Heart rate and trading events on a synchronized timeline"]',
    ),
    null,
  );
  assert.doesNotMatch(
    document.body.textContent!,
    /EXAMPLE SESSION|21452|410\.00/,
  );
  await act(async () => root.unmount());
  dom.window.close();
});

test("today's review deep link survives dashboard initialization", async () => {
  const dom = domSetup();
  dom.reconfigure({ url: "https://still-signal.test/?review=today" });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () =>
      root.render(
        createElement(Dashboard, {
          user: { id: "12121212-1212-4212-8212-121212121212" },
        }),
      ),
    );
    assert.ok(document.querySelector('[aria-label="Today\'s journal review"]'));
    assert.match(document.body.textContent!, /No reflections recorded today/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
test("new authenticated workspace is empty and journaling does not require a wearable", async () => {
  const dom = domSetup();
  const root = createRoot(document.getElementById("root")!);
  try {
  await act(async () =>
    root.render(
      createElement(Dashboard, {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "tester@example.test",
        },
      }),
    ),
  );
  assert.match(document.body.textContent!, /Command Center/);
  assert.match(document.body.textContent!, /No measured heart rate/);
  assert.doesNotMatch(
    document.body.textContent!,
    /EXAMPLE SESSION|\bNQ\b|\bES\b/,
  );
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === label,
    )!;
  await act(async () => button("Daily journal").click());
  assert.equal(button("＋ Add moment").disabled, false);
  await act(async () => button("Daily journal").click());
  assert.match(document.body.textContent!, /Your journal, moment by moment/);
  await act(async () => button("Settings").click());
  assert.match(document.body.textContent!, /tester@example.test/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
