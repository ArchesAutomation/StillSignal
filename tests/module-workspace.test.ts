import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import ModuleWorkspace, { WorkspaceModule } from "../src/components/module-workspace";
import { emptyModuleLayout, moduleLayoutKey, moveModule, readModuleLayout } from "../src/lib/module-layout";

test("module layouts validate sections, reject invalid placement and move between sections", () => {
  const value = emptyModuleLayout();
  value.modules.a = { section: "main", order: 0, width: 6, hidden: false };
  value.modules.b = { section: "side", order: 0, width: 12, hidden: false };
  const moved = moveModule(value, "a", value.modules.a, "side", "b");
  assert.equal(moved.modules.a.section, "side");
  assert.equal(moved.modules.a.order, 0); assert.equal(moved.modules.b.order, 1);
  assert.equal(value.modules.a.section, "main", "original remains untouched");
  assert.equal(moveModule(value, "a", value.modules.a, "unknown"), value);
  const roundtrip = readModuleLayout(JSON.stringify(moved));
  assert.equal(roundtrip.modules.a.width, 6);
  assert.deepEqual(readModuleLayout('null'), emptyModuleLayout());
  assert.deepEqual(readModuleLayout(JSON.stringify({ sections: value.sections, modules: { invalid: { ...value.modules.a, width: 999 } } })).modules, {});
  assert.notEqual(moduleLayoutKey("one", "Journal"), moduleLayoutKey("two", "Journal"));
});

test("cross-section moves, hiding and adding preserve state; save/reload and cancel restore composition", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  let mounts = 0;
  function Writing() { const [text, setText] = useState(() => { mounts++; return "Draft words"; }); return createElement("input", { "aria-label": "Draft words", value: text, onChange: event => setText(event.currentTarget.value) }); }
  const render = (owner = "one") => createElement(ModuleWorkspace, { owner, page: "Journal", children: [
    createElement(WorkspaceModule, { key: "writing", id: "writing", title: "Writing", section: "main", parts: [{ id: "hint", title: "Writing hint", selector: ".hint" }], children: createElement("div", null, createElement(Writing), createElement("p", { className: "hint" }, "Optional writing hint")) }),
    createElement(WorkspaceModule, { key: "calendar", id: "calendar", title: "Calendar", section: "side", children: createElement("p", null, "Calendar content") }),
    createElement(WorkspaceModule, { key: "optional", id: "optional", title: "Optional", initiallyHidden: true, children: createElement("p", null, "Optional content") }),
  ] });
  const click = async (name: string) => {
    const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name);
    assert.ok(button, name); await act(async () => button.click());
  };
  const select = async (label: string, value: string) => {
    const node = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; assert.ok(node, label);
    await act(async () => { node.value = value; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  };
  try {
    await act(async () => root.render(render()));
    const input = document.querySelector('input[aria-label="Draft words"]');
    assert.ok(input);
    await click("Customize workspace"); await click("Edit inside Writing");
    const hint = document.querySelector<HTMLInputElement>(".ss-module-parts input")!;
    await act(async () => hint.click());
    assert.equal(document.querySelector<HTMLElement>(".hint")?.style.display, "none", "internal content visibility changes immediately");
    await select("Section for Writing", "side");
    assert.ok(document.querySelector('[data-module-section="side"] [data-module-id="writing"]'));
    assert.equal(document.querySelector('input[aria-label="Draft words"]'), input);
    assert.equal(mounts, 1, "moving never remounts the form");
    await select("Width for Writing", "6");
    await click("Hide Writing module");
    assert.ok(document.querySelector('[hidden] [data-module-id="writing"]'));
    await click("Add modules");
    const card = [...document.querySelectorAll(".ss-module-library article")].find(n => n.textContent?.startsWith("Writing"))!;
    await act(async () => card.querySelector("button")!.click());
    assert.equal(mounts, 1, "adding a hidden module preserves its state");
    await click("Save layout");
    const stored = readModuleLayout(localStorage.getItem(moduleLayoutKey("one", "Journal")));
    assert.equal(stored.modules.writing.width, 6);
    await click("Customize workspace"); await click("Reset"); await click("Cancel");
    assert.equal((document.querySelector('[data-module-id="writing"]') as HTMLElement).style.gridColumn, "span 6");
    await act(async () => root.render(render("two")));
    assert.equal((document.querySelector('[data-module-id="writing"]') as HTMLElement).style.gridColumn, "span 12", "another owner gets defaults");
    await act(async () => root.render(render()));
    assert.equal((document.querySelector('[data-module-id="writing"]') as HTMLElement).style.gridColumn, "span 6", "saved configuration reloads");
    assert.equal(document.querySelector<HTMLElement>(".hint")?.style.display, "none", "internal configuration also reloads");
    await click("Customize workspace");
    await click("Remove My workspace section");
    assert.ok(document.querySelector('[data-module-section="top"] [data-module-id="writing"]'), "removing a section moves its modules safely");
    assert.equal(document.querySelector('input[aria-label="Draft words"]'), input);
    await click("Cancel");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
