import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import GlassTestPanel from "../src/components/glass-test-panel";
import { GlassProvider } from "../src/components/glassyui/glass-provider";
import { GlassMaterialSettings } from "../src/components/glass-material-settings";
import { opticalAncestorBlocked } from "../src/components/glassyui/lib/use-nordify";

test("the test panel moves, resizes, cancels and stays inside a smaller wallpaper without changing the selected glass", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  let stageWidth = 800;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: this.classList.contains("wallpaper-preview") ? stageWidth : 320, height: 384, x: 0, y: 0, top: 0, left: 0, right: stageWidth, bottom: 384, toJSON() {} };
  };
  const proto = dom.window.HTMLElement.prototype;
  proto.setPointerCapture = () => {};
  proto.hasPointerCapture = () => false;
  const root = createRoot(document.getElementById("root")!);
  const button = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const panel = () => document.querySelector<HTMLElement>('.wallpaper-preview-card')!;
  const geometry = () => [panel().style.left, panel().style.top, panel().style.width, panel().style.height];
  const pointer = async (target: Element, type: string, x: number, y: number) => act(async () => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  });
  try {
    await act(async () => root.render(createElement(GlassProvider, null,
      createElement(GlassTestPanel, { background: "linear-gradient(#abc,#123)", dim: 25 }),
      createElement(GlassMaterialSettings),
    )));
    const identity = panel();
    const start = geometry();
    await pointer(button("Move test panel"), "pointerdown", 50, 80);
    await pointer(button("Move test panel"), "pointermove", 150, 120);
    assert.equal(parseFloat(panel().style.left), parseFloat(start[0]) + 100);
    assert.equal(parseFloat(panel().style.top), parseFloat(start[1]) + 40);
    assert.equal(panel().style.transform, "", "dragging keeps the real optical backdrop available");
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
    assert.deepEqual(geometry(), start);
    await pointer(button("Resize test panel"), "pointerdown", 100, 100);
    await pointer(button("Resize test panel"), "pointermove", 260, 140);
    await pointer(button("Resize test panel"), "pointerup", 260, 140);
    assert.equal(panel().style.width, "480px");
    assert.equal(panel().style.height, "260px");
    const resized = geometry();
    await act(async () => Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Clear')!.click());
    assert.deepEqual(geometry(), resized, "changing the material preserves preview placement");
    assert.equal(panel(), identity, "the same panel stays mounted");
    assert.ok(panel().textContent?.includes("Clear glass"));
    assert.equal(document.documentElement.style.getPropertyValue("--ss-glass-rim"), "1.05");
    stageWidth = 320;
    await act(async () => window.dispatchEvent(new dom.window.Event("resize")));
    assert.equal(panel().style.width, "288px");
    assert.equal(panel().style.left, "16px");
    await act(async () => button("Resize test panel").dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp", shiftKey: true })));
    assert.equal(panel().style.height, "228px");
    await act(async () => button("Move test panel").dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Home" })));
    assert.equal(panel().style.height, "220px");
    assert.equal(document.documentElement.dataset.glassMaterial, "clear", "resetting geometry never resets the glass");
    assert.equal(panel().dataset.glassSurface, "panel");
    await act(async () => Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Bubbly')!.click());
    assert.equal(document.documentElement.dataset.glassPill, 'false');
    const bubblyGeometry = geometry();
    await act(async () => Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Still Signal')!.click());
    assert.ok(document.querySelector('.glass-preview-type')?.textContent?.includes('Still Signal'));
    assert.deepEqual(geometry(), bubblyGeometry, 'comparing against reference text preserves lens placement');
    assert.equal(document.querySelectorAll('.glass-material-settings input[type="range"]').length, 6);
    await act(async () => Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Wallpaper')!.click());
    assert.equal(document.querySelector('.glass-preview-type'), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("an explicit wallpaper backdrop permits local refraction while retaining editing and clipping safeguards", () => {
  const dom = new JSDOM('<div style="isolation:isolate"><div id="stage"><div id="panel"></div></div></div>');
  Object.defineProperty(globalThis, 'getComputedStyle', { value: dom.window.getComputedStyle, configurable: true });
  const panel = dom.window.document.getElementById('panel')!;
  const stage = dom.window.document.getElementById('stage')!;
  try {
    assert.equal(opticalAncestorBlocked(panel), true);
    stage.dataset.glassBackdropRoot = 'true';
    assert.equal(opticalAncestorBlocked(panel), false, 'a painted local wallpaper does not sample outside its scope');
    stage.style.overflowX = 'hidden';
    assert.equal(opticalAncestorBlocked(panel), true, 'the local backdrop must retain its optical overhang');
    stage.style.overflowX = 'visible';
    stage.parentElement!.className = 'ss-free-board-editing';
    assert.equal(opticalAncestorBlocked(panel), true, 'workspace editing still suspends the preview lens');
  } finally { dom.window.close(); }
});
