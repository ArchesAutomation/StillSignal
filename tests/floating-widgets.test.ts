import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import FloatingJournal from "../src/components/floating-journal";
import { moduleLayoutKey, readModuleLayout } from "../src/lib/module-layout";
import { reviewFixtures } from "../src/lib/staging-fixtures";

test("floating session widgets edit in the popup document and persist without losing recorder or note state", async () => {
  const main = new JSDOM("<body></body>", { url: "https://still-signal.test" });
  const pip = new JSDOM('<body><div id="root"></div></body>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: main.window,
    document: main.window.document,
    navigator: main.window.navigator,
    localStorage: main.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  pip.window.resizeTo = () => {};
  for (const dom of [main, pip]) {
    dom.window.HTMLElement.prototype.setPointerCapture = () => {};
    dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
    dom.window.HTMLElement.prototype.releasePointerCapture = () => {};
    Object.assign(dom.window.HTMLElement.prototype, {
      attachEvent() {},
      detachEvent() {},
    });
  }
  const session = reviewFixtures().session;
  let closed = 0;
  const props = {
    session,
    samples: [],
    now: Date.now(),
    baselineSeconds: 300,
    recording: false,
    active: true,
    syncState: "Saved",
    floating: true,
    message: "",
    onClose() {
      closed++;
    },
    onReopen() {},
    prepareScreenshot: async () => "",
    onSave: async () => {},
  };
  let root = createRoot(pip.window.document.getElementById("root")!);
  const doc = pip.window.document;
  const click = async (label: string) => {
    const b = [...doc.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.trim() === label ||
        b.getAttribute("aria-label") === label,
    );
    assert.ok(b, label);
    await act(async () => b.click());
  };
  const render = async (owner = session.owner) => {
    await act(async () =>
      root.render(
        createElement(FloatingJournal, {
          ...props,
          session: { ...session, owner },
        }),
      ),
    );
  };
  try {
    await render();
    const recorder = doc.querySelector('[aria-label="Record moment"]');
    assert.ok(recorder);
    await click("Edit");
    assert.ok(doc.querySelector('[aria-label="Hide Feeling check-in module"]'));
    await click("Hide Feeling check-in module");
    assert.ok(
      doc.querySelector('[hidden] [data-module-id="session-feelings"]'),
    );
    const grip = doc.querySelector(
      '[aria-label="Drag Live recorder module"]',
    ) as HTMLButtonElement;
    const pointer = async (type: string, x: number, y: number) => {
      await act(async () => {
        const event = new pip.window.MouseEvent(type, {
          bubbles: true,
          clientX: x,
          clientY: y,
          button: 0,
        });
        Object.defineProperty(event, "pointerId", { value: 7 });
        (type === "pointerdown" ? grip : pip.window).dispatchEvent(event);
      });
    };
    const initialTop = parseFloat(
      doc.querySelector<HTMLElement>('[data-module-id="session-recorder"]')!
        .style.top,
    );
    await pointer("pointerdown", 100, 200);
    await pointer("pointermove", 124, 248);
    await pointer("pointerup", 124, 248);
    assert.equal(
      doc.querySelector<HTMLElement>('[data-module-id="session-recorder"]')!
        .style.top,
      `${initialTop + 48}px`,
      "pointer events belong to the popup, not the main tab",
    );
    await click("Save layout");
    assert.equal(
      readModuleLayout(
        localStorage.getItem(
          moduleLayoutKey(session.owner, "Floating Session"),
        ),
      ).modules["session-feelings"].hidden,
      true,
    );
    assert.equal(
      doc.querySelector('[aria-label="Record moment"]'),
      recorder,
      "editing does not remount recording controls",
    );
    await click("Edit");
    await act(async () =>
      doc.dispatchEvent(
        new pip.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      ),
    );
    assert.equal(
      closed,
      0,
      "Escape during editing must not close the floating window",
    );
    await click("Add modules");
    const card = [...doc.querySelectorAll(".ss-module-library article")].find(
      (c) => c.textContent?.startsWith("Feeling check-in"),
    )!;
    await act(async () => card.querySelector("button")!.click());
    await click("Cancel");
    assert.ok(
      doc.querySelector('[hidden] [data-module-id="session-feelings"]'),
      "Cancel restores saved selection",
    );
    await act(async () => root.unmount());
    root = createRoot(doc.getElementById("root")!);
    await render();
    assert.ok(
      doc.querySelector('[hidden] [data-module-id="session-feelings"]'),
      "selection survives reopen",
    );
    await render("different-owner");
    assert.equal(
      doc.querySelector('[hidden] [data-module-id="session-feelings"]'),
      null,
      "layouts remain account scoped",
    );
  } finally {
    await act(async () => root.unmount());
    pip.window.close();
    main.window.close();
  }
});
