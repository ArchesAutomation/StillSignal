import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import PersonalStillness, { StillnessBuilder } from "../src/components/personal-stillness";
import SessionReset from "../src/components/concept/session-reset";

function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  })) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  return {
    root,
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
    },
  };
}

test("leaving personal Stillness stops both players and returning requires an explicit restart", async () => {
  const ui = setup();
  const elements = [{ id: crypto.randomUUID(), kind: "words" as const, content: "My practice", context: "any" as const }];
  const render = async (active: boolean) => act(async () => ui.root.render(
    createElement("div", null,
      createElement(PersonalStillness, { owner: "test", elements, active }),
      createElement(SessionReset, { active, onChoice() {} }),
    ),
  ));
  const button = (label: string) => {
    const found = [...document.querySelectorAll("button")].find(node => node.textContent?.trim() === label);
    assert.ok(found, label);
    return found;
  };
  try {
    await render(true);
    await act(async () => {
      button("Preview / play my routine").click();
      button("Begin reset").click();
    });
    button("Stop");
    button("Pause");
    await render(false);
    await render(true);
    button("Preview / play my routine");
    button("Begin reset");
    assert.equal([...document.querySelectorAll("button")].some(node => node.textContent === "Pause"), false);
  } finally { await ui.close(); }
});

test("microphone permission resolving after leaving the routine editor releases the stream", async () => {
  const ui = setup();
  let resolvePermission!: (stream: MediaStream) => void;
  let stopped = 0;
  let changes = 0;
  const previousRecorder = globalThis.MediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: () => new Promise<MediaStream>(resolve => { resolvePermission = resolve; }) },
  });
  // Permission is withdrawn before constructing a recorder.
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: class { constructor() { throw Error("A hidden editor must not start recording"); } },
  });
  const render = async (active: boolean) => act(async () => ui.root.render(
    createElement(StillnessBuilder, { owner: "test", value: [], active, onChange() { changes++; } }),
  ));
  try {
    await render(true);
    const record = [...document.querySelectorAll("button")].find(node => node.textContent === "Record a message");
    assert.ok(record);
    await act(async () => record.click());
    await render(false);
    await act(async () => {
      resolvePermission({ getTracks: () => [{ stop() { stopped++; } }] } as unknown as MediaStream);
      await Promise.resolve();
    });
    assert.equal(stopped, 1);
    assert.equal(changes, 0);
    assert.equal(document.querySelector('[role="alert"]'), null);
  } finally {
    Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: previousRecorder });
    await ui.close();
  }
});
