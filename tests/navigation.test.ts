import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../src/components/dashboard";
import { getSamples, listSessions } from "../src/lib/storage";
test("Bluetooth recording survives every dashboard tab and workspace instrument controls", async () => {
  const owner = "77777777-7777-4777-8777-777777777777",
    dom = new JSDOM('<div id="root"></div>', {
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
  globalThis.fetch = async () => Response.json({ cloudConfigured: false });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  const characteristic = new EventTarget() as EventTarget & {
    value?: DataView;
    startNotifications: () => Promise<unknown>;
  };
  characteristic.startNotifications = async () => characteristic;
  let disconnects = 0;
  const device = new EventTarget() as EventTarget & {
    name: string;
    gatt: unknown;
  };
  device.name = "Simulated WHOOP";
  device.gatt = {
    connect: async () => ({
      getPrimaryService: async () => ({
        getCharacteristic: async () => characteristic,
      }),
    }),
    disconnect: () => {
      disconnects++;
    },
  };
  Object.defineProperty(navigator, "bluetooth", {
    value: { requestDevice: async () => device },
    configurable: true,
  });
  const root = createRoot(document.getElementById("root")!);
  const until = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    assert.ok(condition(), "asynchronous UI action must complete");
  };
  const click = async (label: string, nav = false) => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>(
        nav ? ".ss-nav button, .ss-sensitivity" : "button",
      ),
    ].find((b) =>
      nav
        ? b.getAttribute("aria-label") ===
            (label === "Patterns" ? "Heart-rate analytics" : label) ||
          (label === "Settings" && b.classList.contains("ss-sensitivity"))
        : b.textContent?.trim() === label,
    );
    assert.ok(button, label + " must exist");
    await until(() => !button.disabled);
    await act(async () => {
      button.click();
      await new Promise((r) => setTimeout(r, 40));
    });
  };
  try {
    await act(async () =>
      root.render(
        createElement(Dashboard, {
          user: { id: owner, email: "recording@example.test" },
        }),
      ),
    );
    await click("Start session");
    await until(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "End session",
      ),
    );
    await click("Connections", true);
    await click("Attach WHOOP to journal");
    await until(
      () =>
        document.body.textContent?.includes(
          "Recording with Simulated WHOOP",
        ) === true,
    );
    const session = (await listSessions(owner)).find(
      (s) => s.wearable?.provider === "whoop",
    );
    assert.ok(session);
    for (const [i, tab] of [
      "Overview",
      "Settings",
      "Daily journal",
      "Patterns",
      "Stillness",
      "Sessions",
      "Connections",
      "Daily journal",
    ].entries()) {
      // Sessions navigation is safe while recording; its session selector remains disabled.
      await click(tab, true);
      characteristic.value = new DataView(Uint8Array.from([0, 80 + i]).buffer);
      await act(async () => {
        characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
        await new Promise((r) => setTimeout(r, 25));
      });
      assert.equal(disconnects, 0);
    }
    const samples = await getSamples(session.id, owner);
    assert.equal(samples.length, 8);
    assert.deepEqual(
      samples.map((s) => s.bpm),
      [80, 81, 82, 83, 84, 85, 86, 87],
    );
    assert.equal(
      (
        document.querySelector(
          '[aria-label="Workspace session"]',
        ) as HTMLSelectElement
      ).disabled,
      true,
    );
    await click("End session");
    assert.equal(disconnects, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
