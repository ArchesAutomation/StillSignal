import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { usePulse } from "../src/components/use-pulse";
import { connectHeartRate, requestHeartRateDevice } from "../src/lib/bluetooth";

function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const root = createRoot(document.getElementById("root")!);
  let pulse!: ReturnType<typeof usePulse>, floatingRequests = 0;
  // The owner must remain stable across hook rerenders.
  const owner = crypto.randomUUID();
  function StableHarness() { pulse = usePulse({ id: owner }, () => { floatingRequests++; }); return null; }
  return { dom, root, get pulse() { return pulse; }, get floatingRequests() { return floatingRequests; },
    async mount() { await act(async () => root.render(createElement(StableHarness))); },
    async close() { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } } };
}

function sensor() {
  type TestCharacteristic = EventTarget & { value?: DataView; startNotifications: () => Promise<TestCharacteristic>; stopNotifications: () => Promise<TestCharacteristic> };
  const characteristic = new EventTarget() as TestCharacteristic;
  characteristic.startNotifications = async () => characteristic;
  characteristic.stopNotifications = async () => characteristic;
  const device = new EventTarget() as EventTarget & { name: string; gatt: { connected: boolean; connect: () => Promise<{ getPrimaryService: () => Promise<{ getCharacteristic: () => Promise<typeof characteristic> }> }>; disconnect: () => void } };
  let disconnects = 0;
  device.name = "WHOOP test";
  const server = { getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) };
  device.gatt = { connected: true, connect: async () => server, disconnect: () => { disconnects++; } };
  return { device, characteristic, server, get disconnects() { return disconnects; } };
}

test("idle Connect WHOOP requests Bluetooth on the original click, suppresses competing PiP and ignores repeated clicks", async () => {
  const ui = setup(), mock = sensor();
  let inClick = false, chooserCalls = 0;
  let choose!: (device: typeof mock.device) => void;
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { requestDevice() {
    assert.equal(inClick, true, "the device request must not occur after an await");
    assert.equal(ui.floatingRequests, 0, "PiP must not consume the Bluetooth click");
    chooserCalls++;
    return new Promise<typeof mock.device>(resolve => { choose = resolve; });
  } } });
  try {
    await ui.mount();
    let pending!: Promise<void>;
    await act(async () => {
      inClick = true; pending = ui.pulse.attachWhoop();
      assert.equal(chooserCalls, 1);
      await ui.pulse.attachWhoop();
      inClick = false;
    });
    assert.equal(ui.pulse.connectingWhoop, true);
    assert.equal(ui.pulse.active, false, "a canceled chooser must not create a session");
    await act(async () => { choose(mock.device); await pending; });
    assert.equal(chooserCalls, 1); assert.equal(ui.floatingRequests, 0);
    assert.equal(ui.pulse.recording, true); assert.equal(ui.pulse.active, true);
    assert.equal(ui.pulse.connectingWhoop, false);
  } finally { await ui.close(); }
});

test("canceling the chooser preserves the workspace and allows a fresh retry", async () => {
  const ui = setup(), mock = sensor(); let calls = 0;
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { requestDevice: async () => {
    calls++; if (calls === 1) throw new DOMException("User cancelled the requestDevice chooser", "NotFoundError");
    return mock.device;
  } } });
  try {
    await ui.mount();
    await act(async () => { await assert.rejects(ui.pulse.attachWhoop(), /cancelled/); });
    assert.equal(ui.pulse.session!.id, "workspace"); assert.equal(ui.pulse.active, false);
    assert.equal(ui.pulse.connectingWhoop, false); assert.equal(ui.floatingRequests, 0);
    await act(async () => ui.pulse.attachWhoop());
    assert.equal(ui.pulse.recording, true); assert.equal(calls, 2);
  } finally { await ui.close(); }
});

test("ending a session during the Bluetooth handshake cannot restart recording", async () => {
  const ui = setup(), mock = sensor(); let finish!: (server: typeof mock.server) => void;
  let handshakeStarted = false;
  mock.device.gatt.connect = () => { handshakeStarted = true; return new Promise(resolve => { finish = resolve; }); };
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { requestDevice: async () => mock.device } });
  try {
    await ui.mount(); let pending!: Promise<void>;
    await act(async () => { pending = ui.pulse.attachWhoop(); });
    for (let i = 0; i < 30 && !handshakeStarted; i++) await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    assert.equal(handshakeStarted, true);
    await act(async () => ui.pulse.stop());
    await act(async () => { finish(mock.server); await pending; });
    assert.equal(ui.pulse.recording, false); assert.equal(ui.pulse.active, false);
    assert.equal(mock.disconnects, 1);
  } finally { await ui.close(); }
});

test("notification setup failure disconnects and removes stale sample listeners", async () => {
  const ui = setup(), mock = sensor(); let samples = 0, disconnectCallbacks = 0;
  mock.characteristic.startNotifications = async () => { throw new Error("Notifications failed"); };
  mock.characteristic.value = new DataView(Uint8Array.from([0, 88]).buffer);
  try {
    await assert.rejects(connectHeartRate(() => { samples++; }, () => { disconnectCallbacks++; }, mock.device), /Notifications failed/);
    mock.characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
    mock.device.dispatchEvent(new Event("gattserverdisconnected"));
    assert.equal(mock.disconnects, 1); assert.equal(samples, 0); assert.equal(disconnectCallbacks, 0);
  } finally { await ui.close(); }
});

test("a browser that disables Web Bluetooth gets a usable explanation instead of a sensor failure", async () => {
  const ui = setup();
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { requestDevice: async () => { throw new DOMException("Web Bluetooth API globally disabled.", "NotFoundError"); } } });
  try { await assert.rejects(requestHeartRateDevice(), /Bluetooth is disabled in this browser/); }
  finally { await ui.close(); }
});
