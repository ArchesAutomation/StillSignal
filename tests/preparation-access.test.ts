import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import ModuleWorkspace from "../src/components/module-workspace";
import PreMarket from "../src/components/pre-market/workspace";
import type { Context } from "../src/components/process/shared";
import { emptyModuleLayout, moduleLayoutKey } from "../src/lib/module-layout";
import { validateAppend, withRefs } from "../src/lib/process/engine";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";
import { reviewFixtures } from "../src/lib/staging-fixtures";

test("preparation retires thesis and missions while keeping active tools and saved records", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    FormData: dom.window.FormData,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, {
    attachEvent() {},
    detachEvent() {},
  });
  const day = createRecord("day", {
    date: "2026-11-02",
    timezone: "UTC",
    status: "preparing",
    instrument: "ES",
    account: "",
    timeframes: [],
    sessionIds: [],
    goal: "",
  });
  const protocol = createRecord("protocol", {
    name: "My old routine",
    description: "",
    instrument: "ES",
    strategy: "",
    session: "",
    steps: [
      {
        id: crypto.randomUUID(),
        name: "Read my rules",
        description: "",
        category: "Preparation",
        requirement: "required",
        condition: "",
        verification: "manual",
        window: "",
        order: 0,
      },
    ],
  });
  const run = withRefs(
    createRecord("run", {
      dayId: day.rootId,
      templateId: protocol.id,
      steps: protocol.body.steps,
      startedAt: Date.now(),
    }),
  );
  const mission = createRecord("goal", {
    name: "My existing mission",
    description: "",
    source: "manual",
    target: 5,
    start: day.body.date,
    end: day.body.date,
    milestones: [],
  });
  let records: ProcessRecord[] = [day, protocol, run, mission];
  const session = reviewFixtures().session;
  const context = () =>
    ({
      day,
      props: {
        session,
        history: [],
        onPage() {},
        pulse: { owner: session.owner },
      },
      store: {
        records,
        busy: false,
        setError(message: string) {
          throw Error(message);
        },
        async save(batch: ProcessRecord[]) {
          const prepared = batch.map(withRefs);
          validateAppend(records, prepared, []);
          records = [...records, ...prepared];
          return true;
        },
      },
    }) as unknown as Context;
  const layout = emptyModuleLayout();
  layout.modules["guided-preparation"] = {
    section: "main",
    order: 0,
    width: 12,
    hidden: true,
  };
  localStorage.setItem(
    moduleLayoutKey(session.owner, "Pre-Market"),
    JSON.stringify(layout),
  );
  const root = createRoot(document.getElementById("root")!);
  const render = async () => {
    await act(async () =>
      root.render(
        createElement(ModuleWorkspace, {
          owner: session.owner,
          page: "Pre-Market",
          enabled: false,
          children: createElement(PreMarket, context()),
        }),
      ),
    );
  };
  const click = async (name: string) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === name,
    );
    assert.ok(button, name);
    await act(async () => button.click());
    await render();
  };
  try {
    await render();
    const nav = document.querySelector('[aria-label="Preparation modules"]')!;
    for (const label of [
      "Personal variables",
      "Intentions",
      "Pre-market non-negotiables",
      "Personal check-in",
    ]) {
      assert.ok(
        [...nav.querySelectorAll("button")].some(
          (b) => b.querySelector("strong")?.textContent === label,
        ),
        label,
      );
    }
    assert.equal(
      nav.closest("[hidden]"),
      null,
      "a saved hidden page module cannot hide the preparation tools",
    );
    const open = async (label: string) => {
      const button = [...nav.querySelectorAll("button")].find(
        (b) => b.querySelector("strong")?.textContent === label,
      )!;
      await act(async () => button.click());
      await render();
    };
    assert.doesNotMatch(nav.textContent!, /Trading thesis|Active missions/);
    assert.ok(records.some(r => r.kind === "goal"), "saved mission remains intact");
    await open("Personal variables");
    assert.match(
      document.querySelector("#prep-tool-variables")!.textContent!,
      /Create variable/,
    );
    await open("Intentions");
    (
      document.querySelector('[name="intention"]') as HTMLTextAreaElement
    ).value = "My saved daily intention";
    const save = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Save intentions",
    )!;
    await act(async () =>
      save.form!.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    await render();
    assert.equal(
      records.filter((r) => r.kind === "day").at(-1)?.body.goal,
      "My saved daily intention",
    );
    await open("Pre-market non-negotiables");
    await click("Edit my non-negotiables");
    assert.match(
      document.querySelector("#prep-tool-routine")!.textContent!,
      /Make your routine yours/,
    );
    assert.equal(
      document.querySelector("#prep-tool-routine")!.hasAttribute("hidden"),
      false,
    );
    assert.equal(
      records.filter((r) => r.kind === "protocol").length,
      1,
      "opening tools never overwrites the routine",
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
