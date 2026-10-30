import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ReferenceRhythm from "../src/components/concept/reference-rhythm";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import { phaseColors } from "../src/lib/phase-colors";
import type { Moment } from "../src/components/concept/shared";

test("each trade-stage button highlights its own chart range without opening the journal", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost",
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const fixture = reviewFixtures(),
    t = fixture.session.startedAt;
  const stages = ["before", "entry", "management", "exit", "after"];
  const windows: [number, number][] = [
    [t, t + 600000],
    [t + 590000, t + 610000],
    [t + 600000, t + 1200000],
    [t + 1190000, t + 1210000],
    [t + 1200000, t + 1800000],
  ];
  const moments: Moment[] = stages.map((phase, i) => ({
    id: `phase-${phase}`,
    phase: phase.toUpperCase(),
    t: (windows[i][0] + windows[i][1]) / 2,
    label: "",
    text: "",
    bpm: null,
  }));
  let logOpens = 0;
  function Harness() {
    const [index, setIndex] = useState(0);
    return createElement(ReferenceRhythm, {
      session: fixture.session,
      samples: fixture.samples,
      baselineSeconds: 300,
      phases: moments,
      selected: stages[index],
      phaseWindow: windows[index],
      selectedTime: moments[index].t,
      onSelect: (moment) => setIndex(moments.indexOf(moment)),
      onSeeLog: () => {
        logOpens++;
      },
    });
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(Harness)));
    const positions = new Set<string>();
    for (const stage of stages) {
      const button = dom.window.document.querySelector<HTMLButtonElement>(
        `button.ss-phase[data-phase="${stage}"]`,
      )!;
      await act(async () => button.click());
      assert.equal(button.getAttribute("aria-pressed"), "true");
      const highlight = dom.window.document.querySelector(
        `[data-phase-highlight="${stage}"]`,
      )!;
      assert.ok(
        highlight,
        `${stage} must highlight the chart, not only the button`,
      );
      const rect = highlight.querySelector("rect")!;
      assert.equal(rect.getAttribute("fill"), phaseColors[stage]);
      assert.ok(Number(rect.getAttribute("width")) > 0);
      positions.add(
        rect.getAttribute("x")! + ":" + rect.getAttribute("width")!,
      );
      assert.equal(
        dom.window.document.querySelectorAll("[data-phase-highlight]").length,
        1,
      );
      assert.equal(logOpens, 0, "stage selection must stay at the chart");
    }
    assert.equal(
      positions.size,
      5,
      "all five stages need distinct chart highlights",
    );
    await act(async () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('[aria-label="See after log"]')!
        .click(),
    );
    assert.equal(logOpens, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
