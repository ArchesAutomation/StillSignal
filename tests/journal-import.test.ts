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
import { saveSession } from "../src/lib/storage";
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
