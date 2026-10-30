import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import Rhythm from "../src/components/concept/reference-rhythm";
import { reviewFixtures } from "../src/lib/staging-fixtures";
test("two zooms and a pan can each be undone, fit differs from all measurements, and a wheel gesture uses one history entry", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const names = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const originals = new Map(
    names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]),
  );
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    const data = reviewFixtures();
    await act(async () =>
      root.render(
        createElement(Rhythm, {
          session: data.session,
          samples: data.samples,
          baselineSeconds: 300,
          phases: [],
          timezone: "UTC",
          onSelect() {},
          onSeeLog() {},
        }),
      ),
    );
    const button = (name: string) =>
      [...document.querySelectorAll("button")].find((b) =>
        (b.getAttribute("aria-label") || b.textContent)?.includes(name),
      )!;
    const click = async (name: string) => act(async () => button(name).click());
    const range = () =>
      document.querySelector(".ss-timeline-head p")!.textContent;
    const fit = range();
    await click("Zoom in");
    const first = range();
    assert.notEqual(first, fit);
    await click("Zoom in");
    const second = range();
    assert.notEqual(second, first);
    const svg = document.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 325,
      right: 1000,
      bottom: 325,
      x: 0,
      y: 0,
      toJSON() {},
    });
    svg.setPointerCapture = () => {};
    async function pointer(type: string, x: number, id = 1) {
      await act(async () => {
        const e = new dom.window.MouseEvent(type, {
          bubbles: true,
          clientX: x,
        });
        Object.defineProperty(e, "pointerId", { value: id });
        svg.dispatchEvent(e);
      });
    }
    await pointer("pointerdown", 500);
    await pointer("pointermove", 550);
    await pointer("pointerup", 550);
    assert.notEqual(range(), second);
    await click("Previous view");
    assert.equal(range(), second);
    await click("Previous view");
    assert.equal(range(), first);
    await click("Previous view");
    assert.equal(range(), fit);
    await click("All measurements");
    assert.notEqual(range(), fit);
    await click("Fit session");
    assert.equal(range(), fit);
    await act(async () => {
      svg.dispatchEvent(
        new dom.window.WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 450,
          deltaY: -50,
        }),
      );
      svg.dispatchEvent(
        new dom.window.WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 450,
          deltaY: -50,
        }),
      );
    });
    assert.notEqual(range(), fit);
    await click("Previous view");
    assert.equal(range(), fit);
    await pointer("pointerdown", 350);
    await pointer("pointerdown", 650, 2);
    await pointer("pointermove", 750, 2);
    await pointer("pointerup", 350);
    await pointer("pointerup", 750, 2);
    assert.notEqual(range(), fit);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, value] of originals) {
      if (value) Object.defineProperty(globalThis, name, value);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
