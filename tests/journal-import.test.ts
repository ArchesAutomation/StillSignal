import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { usePulse } from "../src/components/use-pulse";
import CsvImporter from "../src/components/csv-importer";
import { Timeline } from "../src/components/timeline";
import { parseTrades } from "../src/lib/csv";
import { listSessions, getSamples } from "../src/lib/storage";
import { saveSession, appendSamples } from "../src/lib/storage";
const owner = "77777777-7777-4777-8777-777777777777";
test("starting a journal supersedes an older asynchronous history load", async (t) => {
  const dom = setup(),
    root = createRoot(document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  let pulse: ReturnType<typeof usePulse> | undefined;
  function Harness() {
    pulse = usePulse({ id: owner });
    return createElement("div", null, pulse.session?.name);
  }
  await act(async () => root.render(createElement(Harness)));
  const old = {
    id: crypto.randomUUID(),
    owner,
    name: "Older journal",
    source: "journal" as const,
    startedAt: Date.now() - 60000,
    events: [],
    journal: [],
    sampleCount: 0,
  };
  await act(async () => {
    await saveSession(old);
  });
  await act(async () => {
    const pending = pulse!.openSession(old);
    await pulse!.start("New live journal");
    await pending;
  });
  assert.equal(pulse!.active, true);
  assert.equal(pulse!.session!.name, "New live journal");
  await act(async () =>
    pulse!.addNote({
      id: crypto.randomUUID(),
      t: Date.now(),
      label: "FOMO",
      text: "A current check-in",
    }),
  );
  assert.equal(pulse!.session!.journal.length, 1);
  assert.equal(pulse!.session!.name, "New live journal");
});
function setup() {
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
  return dom;
}
test("manual CSV joins the active recorded day and Bluetooth continues receiving samples", async (t) => {
  const dom = setup(), root = createRoot(document.getElementById("root")!);
  let pulse: ReturnType<typeof usePulse>;
  const characteristic = Object.assign(new EventTarget(), {
    value: new DataView(new Uint8Array([0, 70]).buffer),
    async startNotifications() { return this; },
    async stopNotifications() { return this; },
  });
  let disconnected = false;
  const device = Object.assign(new EventTarget(), { name: "Synthetic sensor", gatt: {
    connected: true,
    async connect() { return { async getPrimaryService() { return { async getCharacteristic() { return characteristic; } }; } }; },
    disconnect() { disconnected = true; },
  } });
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { async requestDevice() { return device; } } });
  function Harness() { pulse = usePulse({ id: "66666666-6666-4666-8666-666666666666" }); return null; }
  t.after(async () => { await act(async () => { await pulse.stop(); root.unmount(); }); dom.window.close(); });
  await act(async () => root.render(createElement(Harness)));
  const now = Date.now();
  await act(async () => { await pulse.start("All-day recording", now - 60000); await pulse.attachWhoop(); });
  const id = pulse!.session!.id, start = pulse!.session!.startedAt;
  await act(async () => characteristic.dispatchEvent(new Event("characteristicvaluechanged")));
  const rows = parseTrades(`timestamp,symbol,kind,side,price,quantity\n${new Date(now - 30000).toISOString()},ES,entry,long,5000,1\n${new Date(now - 10000).toISOString()},ES,exit,long,5005,1\n`);
  await act(async () => { await pulse.importEvents(rows, "Orders", "daily", "UTC"); });
  assert.equal(pulse!.session!.id, id);
  assert.equal(pulse!.session!.startedAt, start);
  assert.equal(pulse!.active, true);
  assert.equal(pulse!.recording, true);
  assert.equal(disconnected, false);
  assert.equal(pulse!.session!.events.length, 2);
  assert.equal((await getSamples(id, pulse!.owner)).length, 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  characteristic.value = new DataView(new Uint8Array([0, 95]).buffer);
  await act(async () => { characteristic.dispatchEvent(new Event("characteristicvaluechanged")); await pulse.importEvents(rows, "Orders again", "daily", "UTC"); });
  assert.equal(pulse!.session!.events.length, 2);
  assert.deepEqual((await getSamples(id, pulse!.owner)).map((p) => p.bpm), [70, 95]);
  assert.equal((await listSessions(pulse!.owner)).length, 1);
});

test("daily import reopens matching recorded history with its original heart-rate samples", async (t) => {
  const dom = setup(), root = createRoot(document.getElementById("root")!);
  const user = "55555555-5555-4555-8555-555555555555";
  let pulse: ReturnType<typeof usePulse>;
  function Harness() { pulse = usePulse({ id: user }); return null; }
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); });
  await act(async () => root.render(createElement(Harness)));
  const events = parseTrades("timestamp,symbol,kind,side,price,quantity\n2026-01-15T09:00:00Z,ES,entry,long,5000,1\n2026-01-15T09:10:00Z,ES,exit,long,5010,1\n");
  const day = { id: crypto.randomUUID(), owner: user, name: "Recorded heart rate", source: "journal" as const, startedAt: events[0].t - 60000, endedAt: events[1].t - 60000, events: [], journal: [], sampleCount: 2 };
  const points = [{ t: events[0].t - 30000, bpm: 70 }, { t: events[0].t + 30000, bpm: 90 }];
  await saveSession(day);
  await appendSamples(day.id, points, user, false);
  await act(async () => { await pulse.importEvents(events, "Export", "daily", "UTC"); });
  assert.equal(pulse!.session!.id, day.id);
  assert.deepEqual(pulse!.samples, points);
  assert.equal(pulse!.session!.events.length, 2);
  assert.equal((await listSessions(user)).length, 1);
});
test("journal, notes, and CSV replay persist without Bluetooth; re-importing does not create duplicates", async (t) => {
  const dom = setup(),
    root = createRoot(document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  let p: ReturnType<typeof usePulse> | undefined;
  function Harness() {
    p = usePulse({ id: owner, email: "journal@example.test" });
    return createElement("div", null, p.session?.name);
  }
  await act(async () => root.render(createElement(Harness)));
  assert.equal("bluetooth" in navigator, false);
  await act(async () => {
    await p!.addNote({
      id: "reflection",
      t: Date.now(),
      label: "Focused",
      text: "My trading plan",
    });
  });
  assert.equal(p!.active, true);
  assert.equal(p!.recording, false);
  assert.equal(p!.session!.source, "journal");
  assert.equal(p!.session!.journal.length, 1);
  assert.equal(p!.samples.length, 0);
  await act(async () => {
    await p!.stop();
  });
  const saved = p!.session!;
  assert.equal((await getSamples(saved.id, owner)).length, 0);
  const csv =
    "timestamp,symbol,kind,side,price,quantity,pnl,execution_id\n2026-01-15T12:00:00Z,ES,entry,long,5000,1,,a\n2026-01-15T12:10:00Z,ES,exit,long,5010,1,10,b\n";
  const events = parseTrades(csv);
  await act(async () => {
    await p!.importEvents(events, "Trades", "new");
  });
  const id = p!.session!.id;
  await act(async () => {
    await p!.importEvents(events, "Trades", "new");
  });
  assert.equal(p!.session!.id, id);
  assert.equal(p!.session!.events.length, 2);
  assert.equal(p!.samples.length, 0);
  assert.equal(
    (await listSessions(owner)).filter((s) => s.id === id).length,
    1,
  );
  await act(async () => {
    await p!.openSession(saved);
  });
  assert.equal(p!.session!.journal[0].text, "My trading plan");
});
test("TradingView history uploads preview and persist filled trades through the importer", async (t) => {
  const dom = setup(),
    root = createRoot(document.getElementById("root")!),
    importOwner = "88888888-8888-4888-8888-888888888888";
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  let pulse: ReturnType<typeof usePulse>;
  let importing: Promise<unknown> | undefined;
  function Harness() {
    pulse = usePulse({ id: importOwner });
    return createElement(CsvImporter, {
      active: false,
      hasSession: false,
      onImport: (events, name, destination) => {
        importing = pulse.importEvents(events, name, destination);
        return importing;
      },
    });
  }
  await act(async () => root.render(createElement(Harness)));
  const csv =
    "Symbol,Side,Type,Qty,Avg Fill Price,Status,Closing Time,Order ID\nES,Buy,Market,1,5000,Filled,2026-01-15 08:30:00,101\nES,Sell,Market,1,5025,Filled,2026-01-15 09:00:00,102\n";
  const file = document.querySelector("input[type=file]")!;
  Object.defineProperty(file, "files", {
    value: [{ name: "TradingView-History.csv", size: csv.length, text: async () => csv }],
    configurable: true,
  });
  await act(async () => {
    file.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const checkbox = (text: string) => [...document.querySelectorAll("label")]
    .find((label) => label.textContent?.includes(text))!
    .querySelector<HTMLInputElement>("input[type=checkbox]")!;
  await act(async () => checkbox("starts flat").click());
  assert.match(document.body.textContent!, /2 validated events/);
  const submit = [...document.querySelectorAll("button")]
    .find((button) => button.textContent === "Import 2 events")!;
  assert.equal(submit.disabled, false);
  await act(async () => {
    submit.click();
    await importing;
  });
  const sessions = await listSessions(importOwner);
  assert.equal(sessions.length, 1);
  assert.match(sessions[0].name, /^Trading day/);
  assert.deepEqual(sessions[0].events.map((e) => [e.kind, e.price]), [
    ["entry", 5000], ["exit", 5025],
  ]);
  await act(async () => pulse.openSession(sessions[0]));
  assert.equal(pulse!.session!.events.length, 2);
  assert.equal(pulse!.samples.length, 0);
});
test("CSV file picker previews real rows before import and trade-only timeline remains usable", async (t) => {
  const dom = setup(),
    root = createRoot(document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  let imported = 0;
  await act(async () =>
    root.render(
      createElement(CsvImporter, {
        hasSession: false,
        active: false,
        onImport: async (events) => {
          imported = events.length;
        },
      }),
    ),
  );
  const csv =
    "timestamp,symbol,kind,side,price,quantity,pnl,execution_id\n2026-01-15T12:00:00Z,ES,entry,long,5000,1,,a\n";
  const input = document.querySelector("input[type=file]")!;
  Object.defineProperty(input, "files", {
    value: [{ name: "my-trades.csv", size: csv.length, text: async () => csv }],
    configurable: true,
  });
  await act(async () => {
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  assert.equal(imported, 0);
  assert.match(document.body.textContent!, /1 validated events/);
  const submit = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Import 1 events",
  )!;
  await act(async () => {
    submit.click();
  });
  assert.equal(imported, 1);
  const dropped = csv + "2026-01-15T12:10:00Z,ES,exit,long,5010,1,10,b\n";
  const drop = new dom.window.Event("drop", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(drop, "dataTransfer", {
    value: {
      files: [
        {
          name: "dropped-trades.csv",
          size: dropped.length,
          text: async () => dropped,
        },
      ],
    },
  });
  imported = 0;
  await act(async () => {
    document.querySelector(".csv-dropzone")!.dispatchEvent(drop);
  });
  assert.equal(imported, 0);
  assert.match(document.body.textContent!, /2 validated events/);
  const importDrop = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Import 2 events",
  )!;
  await act(async () => {
    importDrop.click();
  });
  assert.equal(imported, 2);
  const events = parseTrades(csv);
  await act(async () =>
    root.render(
      createElement(Timeline, {
        samples: [],
        events,
        journal: [],
        baseline: null,
        start: events[0].t,
        end: events[0].t + 60000,
        onSelect: () => {},
      }),
    ),
  );
  assert.equal(document.querySelectorAll(".trade-marker").length, 1);
  assert.equal(document.querySelector(".chart-empty"), null);
  assert.doesNotMatch(document.body.textContent!, /first sample/);
});
