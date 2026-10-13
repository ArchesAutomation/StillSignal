import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { usePulse } from "../src/components/use-pulse";
import { getSamples, listSessions } from "../src/lib/storage";
test("recorder flow: authenticated empty workspace → Bluetooth notifications → journal → stop → reopen → reset", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://trade-pulse.test",
  });
  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: dom.window.document,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: dom.window.localStorage,
    configurable: true,
  });
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const characteristic = new EventTarget() as EventTarget & {
    value?: DataView;
    startNotifications: () => Promise<unknown>;
  };
  characteristic.startNotifications = async () => characteristic;
  const device = new EventTarget() as EventTarget & {
    name: string;
    gatt: unknown;
  };
  device.name = "WHOOP test device";
  device.gatt = {
    connect: async () => ({
      getPrimaryService: async () => ({
        getCharacteristic: async () => characteristic,
      }),
    }),
    disconnect: () => {},
  };
  Object.defineProperty(navigator, "bluetooth", {
    value: { requestDevice: async () => device },
    configurable: true,
  });
  let state: ReturnType<typeof usePulse> | undefined;
  function Harness() {
    state = usePulse({
      id: "11111111-1111-4111-8111-111111111111",
      email: "tester@example.test",
    });
    return createElement("div", null, state.session?.source);
  }
  const root = createRoot(document.getElementById("root")!);
  await act(async () => {
    root.render(createElement(Harness));
  });
  assert.equal(state!.session?.id, "workspace");
  assert.equal(state!.samples.length, 0);
  await act(async () => {
    await state!.start();
  });
  assert.equal(state!.recording, true);
  assert.equal(state!.session?.source, "whoop");
  const sessionId = state!.session!.id;
  characteristic.value = new DataView(Uint8Array.from([0, 88]).buffer);
  await act(async () => {
    characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
    await new Promise((r) => setTimeout(r, 30));
  });
  assert.equal(
    (await getSamples(sessionId, "11111111-1111-4111-8111-111111111111"))[0]
      .bpm,
    88,
  );
  await act(async () => {
    await state!.addNote({
      id: "note1",
      t: Date.now(),
      label: "Calm",
      text: "Test reflection",
    });
    await state!.addEvents([
      {
        id: "trade1",
        t: Date.now(),
        symbol: "ES",
        kind: "entry",
        side: "long",
        price: 5000,
        quantity: 1,
        source: "manual",
      },
    ]);
  });
  await act(async () => {
    await state!.stop();
  });
  assert.equal(state!.recording, false);
  assert.equal(state!.samples.length, 1);
  assert.equal(state!.session!.journal.length, 1);
  assert.equal(state!.session!.events.length, 1);
  const saved = (
    await listSessions("11111111-1111-4111-8111-111111111111")
  ).find((s) => s.id === sessionId)!;
  assert.ok(saved.endedAt);
  await act(async () => {
    state!.resetWorkspace();
    await state!.openSession(saved);
  });
  assert.equal(state!.samples[0].bpm, 88);
  await act(async () => {
    state!.resetWorkspace();
  });
  assert.equal(
    (await getSamples(sessionId, "11111111-1111-4111-8111-111111111111"))
      .length,
    1,
  );
  assert.equal(state!.session?.id, "workspace");
  assert.equal(state!.samples.length, 0);
  await act(async () => root.unmount());
  dom.window.close();
});
