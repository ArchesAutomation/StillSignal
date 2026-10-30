import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import PageCustomizer from "../src/components/page-customizer";
import { pageLayoutKey, readPageLayout } from "../src/lib/page-layout";

test("layout storage rejects invalid values and isolates accounts and pages", () => {
  assert.deepEqual(readPageLayout('{"a":{"order":-1,"span":12},"b":{"order":0,"span":999}}'), {});
  assert.deepEqual(readPageLayout("null"), {});
  assert.deepEqual(readPageLayout("broken"), {});
  assert.deepEqual(readPageLayout('{"a":{"order":1,"span":6}}'), { a: { order: 1, span: 6 } });
  assert.notEqual(pageLayoutKey("a", "Journal"), pageLayoutKey("b", "Journal"));
  assert.notEqual(pageLayoutKey("a", "Journal"), pageLayoutKey("a", "Patterns"));
});

test("page editing preserves inputs, supports keyboard order, save/reload, cancel and reset", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()] as unknown as DOMRectList; };
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 200, bottom: 200, right: 1000, toJSON() {} }; };
  function Harness({ owner = "one", page = "Journal" }) {
    const scope = useRef<HTMLElement>(null);
    return createElement("main", { ref: scope },
      createElement(PageCustomizer, { scope, owner, page, key: owner + page }),
      createElement("section", { "data-layout-id": "first" }, createElement("h2", null, "First"), createElement("input", { defaultValue: "Unsaved words", "aria-label": "Draft" }),
        createElement("section", null, createElement("h3", null, "Details"))),
      createElement("section", { "data-layout-id": "second" }, createElement("h2", null, "Second")));
  }
  const root = createRoot(document.getElementById("root")!);
  const click = async (text: string) => {
    const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text || b.getAttribute("aria-label") === text);
    assert.ok(button, text);
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 25)); });
  };
  const first = () => document.querySelector<HTMLElement>('[data-layout-id="first"]')!;
  try {
    await act(async () => root.render(createElement(Harness, {})));
    const input = document.querySelector("input")!;
    input.value = "Keep this draft";
    await click("Edit page layout");
    assert.equal(document.querySelectorAll(".ss-custom-controls").length, 3, "nested panel controls keep stable identities");
    await click("Move First down");
    assert.equal(first().style.order, "1");
    await click("Change First width");
    assert.equal(first().style.gridColumn, "span 6");
    assert.equal(document.querySelector("input"), input, "moving never remounts the form");
    assert.equal(input.value, "Keep this draft");
    await click("Save layout");
    assert.equal(readPageLayout(localStorage.getItem(pageLayoutKey("one", "Journal"))).first.span, 6);
    await click("Edit page layout");
    await click("Reset layout");
    await click("Cancel");
    assert.equal(first().style.gridColumn, "span 6");
    await act(async () => root.render(createElement(Harness, { page: "Patterns" })));
    assert.equal(first().style.order, "", "another page keeps its defaults");
    await act(async () => root.render(createElement(Harness, {})));
    assert.equal(first().style.gridColumn, "span 6", "saved layout reloads");
    await click("Edit page layout");
    await click("Reset layout");
    await click("Save layout");
    assert.equal(first().style.gridColumn, "");
    assert.equal(first().style.order, "");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
