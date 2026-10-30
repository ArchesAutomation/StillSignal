import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import DashboardCanvas from "../src/components/command-center/dashboard-canvas";
import { freshDashboard } from "../src/lib/process/dashboard";

test("grabbing lifts immediately, follows the pointer beyond the grid, and Escape cancels", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
    cancelAnimationFrame: clearTimeout,
    innerHeight: 1000,
  })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const proto = dom.window.HTMLElement.prototype;
  proto.setPointerCapture = function () {};
  proto.hasPointerCapture = () => false;
  proto.releasePointerCapture = function () {};
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 1200 });
  const root = createRoot(document.getElementById("root")!);
  let changes = 0;
  let interacting = false;
  const pointer = async (type: string, x: number) => {
    await act(async () => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: 200, button: 0 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      document.querySelector(".cc-drag-handle")!.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };
  try {
    await act(async () => root.render(createElement(DashboardCanvas, {
      layout: freshDashboard(), editing: true, disabled: false,
      onChange: () => { changes++; },
      onInteracting: (value) => { interacting = value; },
      renderContent: () => "Card content",
    })));
    await pointer("pointerdown", 200);
    assert.ok(document.querySelector(".cc-tile-move"), "card lifts on grab");
    assert.equal(interacting, true);
    await pointer("pointerup", 200);
    assert.equal(changes, 0, "a click must not create an undo entry");
    assert.equal(document.querySelector(".cc-tile-active"), null);
    await pointer("pointerdown", 200);
    await pointer("pointermove", -100);
    assert.match((document.querySelector(".cc-tile-move") as HTMLElement).style.transform, /translate3d\(-300px/);
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
    assert.equal(document.querySelector(".cc-tile-active"), null);
    assert.equal(interacting, false);
    assert.equal(changes, 0, "cancel leaves the layout unchanged");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
