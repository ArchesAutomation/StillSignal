import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import PhaseLabelPreferences from "../src/components/phase-label-preferences";
import { PhaseLabelsContext } from "../src/components/phase-label-context";
import InlineMoment from "../src/components/concept/inline-moment";
import { defaults, type Settings } from "../src/lib/model";
import { reviewFixtures } from "../src/lib/staging-fixtures";

test("stage boxes save into journal suggestions, preserve other stages and never rewrite original notes", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  const session = reviewFixtures().session;
  const note = { ...session.journal[0], section: "management" as const, label: "Original words" };
  let saved: Settings = { ...defaults, phaseLabels: { before: ["Wait for my setup"], management: ["Patient", "Plan intact"] } };
  function Harness() {
    const [settings, setSettings] = useState(saved);
    return createElement(PhaseLabelsContext.Provider, { value: settings.phaseLabels },
      createElement(PhaseLabelPreferences, { settings, onChange: value => { saved = value; setSettings(value); } }),
      createElement(InlineMoment, { session, note, onSave: async () => {} }));
  }
  const click = async (name: string) => {
    const node = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name); assert.ok(node, name);
    await act(async () => node.click());
  };
  try {
    await act(async () => root.render(createElement(Harness)));
    const select = document.querySelector<HTMLSelectElement>('[aria-label="Stage to customize"]')!;
    await act(async () => { select.value = "management"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await click("Remove Management label 1");
    await click("Save labels");
    assert.deepEqual(saved.phaseLabels?.management, ["Plan intact"]);
    assert.deepEqual(saved.phaseLabels?.before, ["Wait for my setup"]);
    assert.deepEqual([...document.querySelectorAll("datalist option")].map(n => n.textContent), ["Plan intact"]);
    assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Feeling or thought"]')?.value, "Original words");
    await click("Remove Management label 1");
    await click("Save labels");
    assert.deepEqual(saved.phaseLabels?.management, [], "intentionally empty suggestions stay empty");
    assert.equal(document.querySelectorAll("datalist option").length, 0);
    await click("Add label");
    assert.ok(document.querySelector('[aria-label="Management label 1"]'), "plus adds a dedicated box");
    assert.equal(note.label, "Original words");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
