import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import AccountMenu from "../src/components/account-menu";
import AuthGate from "../src/components/auth-gate";
import Dashboard from "../src/components/dashboard";
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
  assert.match(document.body.textContent!, /A little room for you/);
  assert.doesNotMatch(
    document.body.textContent!,
    /EXAMPLE SESSION|\bNQ\b|\bES\b/,
  );
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === label,
    )!;
  assert.equal(document.querySelector("details.ss-reference-more"), null);
  assert.equal(button("Command Center"), undefined);
  assert.equal(button("Patterns"), undefined);
  await act(async () => button("Daily journal").click());
  assert.equal(button("＋ Add moment").disabled, false);
  await act(async () => button("Daily journal").click());
  assert.match(document.body.textContent!, /Your journal, moment by moment/);
  await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Stillness"]')!.click());
  assert.equal(document.documentElement.dataset.journalPresentation, "reading-room");
  const routines = document.querySelector<HTMLDetailsElement>("details.rr-stillness-routines")!;
  assert.equal(routines.open, false);
  assert.ok(document.querySelector(".ss-support-page"), "the library is the primary Stillness page");
  await act(async () => routines.querySelector("summary")!.click());
  const stillness = document.querySelector('section[aria-label="Post-session Stillness reset"]');
  assert.ok(stillness, "the real workspace opens the SessionReset screen");
  assert.equal(stillness.closest("details"), routines);
  assert.equal(stillness.querySelector('.shark-background canvas'), null, "Stillness has no animation engine");
  await act(async () => button("Settings").click());
  assert.match(document.body.textContent!, /tester@example.test/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("account access opens, navigates, closes with Escape and reports sign-out failure", async () => {
  const dom = domSetup(); const root = createRoot(document.getElementById("root")!);
  let settings = 0, error = "";
  const props = { email: "tester@example.test", blocked: false, onSettings: () => { settings++; }, onError: (message: string) => { error = message; } };
  try {
    await act(async () => root.render(createElement(AccountMenu, props)));
    const menu = document.querySelector("details")!, trigger = document.querySelector("summary")!;
    await act(async () => trigger.click()); assert.equal(menu.open, true);
    const buttons = [...document.querySelectorAll("button")];
    await act(async () => buttons.find(b => b.textContent === "Account settings")!.click());
    assert.equal(settings, 1); assert.equal(menu.open, false);
    await act(async () => trigger.click());
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
    assert.equal(menu.open, false); assert.equal(document.activeElement, trigger);
    await act(async () => buttons.find(b => b.textContent === "Sign out")!.click());
    assert.match(error, /Sign-out is unavailable in this isolated review/);
    await act(async () => root.render(createElement(AccountMenu, { ...props, blocked: true })));
    assert.equal([...document.querySelectorAll("button")].find(b => b.textContent === "Sign out")!.disabled, true);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test("Preparation setup and Done for the day keep their shared tools; the plan question stays on the page", async () => {
  const dom = domSetup();
  const root = createRoot(document.getElementById("root")!);
  const find = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label);
  const waitFor = async (condition: () => unknown) => {
    for (let i = 0; i < 80 && !condition(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.ok(condition(), "Shared process tools must finish loading");
  };
  const click = async (label: string) => {
    await waitFor(() => find(label) && !find(label)!.disabled);
    await act(async () => find(label)!.click());
  };
  try {
    await act(async () => root.render(createElement(Dashboard, { user: { id: "22222222-2222-4222-8222-222222222222", email: "mindfulness@example.test" } })));
    await click("Preparation");
    await click("Initial setup ↗");
    await click("Open today's preparation →");
    await waitFor(() => document.querySelector(".prep-library"));
    await click("Done for the day");
    const plan = () => document.querySelector('[aria-label="How you followed your plan"]');
    await waitFor(plan);
    assert.deepEqual([...plan()!.querySelectorAll("button")].map(b => b.textContent), ["Followed it", "Partly", "Not today"]);
    await click("Followed it");
    const followed = () => [...plan()!.querySelectorAll("button")].find(b => b.textContent?.includes("Followed it"));
    await waitFor(() => followed()?.getAttribute("aria-pressed") === "true");
    assert.equal(followed()!.textContent, "✓ Followed it");
    assert.ok(document.querySelector("#done-process"), "Choosing an answer keeps you on Done for the day");
    assert.doesNotMatch(document.body.textContent!, /Trade Quality|Strategy playbooks|rule checks/);
    assert.doesNotMatch(document.querySelector(".ss-reference-topbar")!.textContent!, /Command Center|Patterns/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
