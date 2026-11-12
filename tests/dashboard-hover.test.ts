import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceModule } from "../src/components/module-workspace";
import DashboardCanvas from "../src/components/process/dashboard-canvas";
import { freshDashboard } from "../src/lib/process/dashboard";

test("the dashboard shares surface dragging, inert previews, eight resize edges and Escape cancellation", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const proto = dom.window.HTMLElement.prototype;
  proto.setPointerCapture = () => {};
  proto.hasPointerCapture = () => false;
  proto.releasePointerCapture = () => {};
  const root = createRoot(document.getElementById("root")!);
  let changes = 0,
    interacting = false;
  const pointer = async (type: string, x: number) => {
    await act(async () => {
      const event = new dom.window.MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: 200,
        button: 0,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      document.querySelector(".ss-module-move-surface")!.dispatchEvent(event);
    });
  };
  try {
    await act(async () =>
      root.render(
        createElement(DashboardCanvas, {
          layout: freshDashboard(),
          editing: true,
          disabled: false,
          onChange: () => {
            changes++;
          },
          onInteracting: (value) => {
            interacting = value;
          },
          children: createElement(WorkspaceModule, { id: "session", title: "Session", children: createElement("button", null, "Start session") }),
        }),
      ),
    );
    const host = document.querySelector("[data-module-id]")!;
    assert.ok(host.querySelector(".ss-module-content[inert]"));
    assert.equal(host.querySelectorAll(".ss-module-resize").length, 8);
    await pointer("pointerdown", 200);
    assert.ok(document.querySelector(".ss-module-held"));
    assert.equal(interacting, true);
    await pointer("pointerup", 200);
    assert.equal(changes, 0, "a click must not create an edit");
    await pointer("pointerdown", 200);
    await pointer("pointermove", 250);
    assert.ok(document.querySelector(".ss-module-alignment-guides"));
    await act(async () =>
      window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
      ),
    );
    assert.equal(document.querySelector(".ss-module-held"), null);
    assert.equal(interacting, false);
    assert.equal(changes, 0, "cancel leaves the layout unchanged");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
