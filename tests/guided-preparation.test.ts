import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import GuidedPreparation from "../src/components/pre-market/guided-preparation";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";
import { validateAppend, withRefs } from "../src/lib/process/engine";
import type { Context } from "../src/components/command-center/shared";

test("guided routine setup, skip reason, resume, version safety and fresh same-day session progress", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  let day = createRecord("day", {
    date: "2026-11-01",
    timezone: "UTC",
    status: "preparing",
    instrument: "ES",
    account: "",
    timeframes: [],
    sessionIds: [],
    goal: "",
  });
  let records: ProcessRecord[] = [day];
  let error = "",
    fail = false;
  let sessionId = crypto.randomUUID();
  const context = () =>
    ({
      day,
      props: { session: { id: sessionId }, onPage() {} },
      store: {
        records,
        loaded: true,
        busy: false,
        error,
        setError(v: string) {
          error = v;
        },
        async save(batch: ProcessRecord[]) {
          if (fail) return false;
          const rows = batch.map(withRefs);
          validateAppend(records, rows, []);
          records = [...records, ...rows];
          return true;
        },
      },
    }) as unknown as Context;
  const render = async () => {
    await act(async () =>
      root.render(
        createElement(GuidedPreparation, { ...context(), key: day.id }),
      ),
    );
  };
  const button = (text: string) => {
    const b = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(text),
    );
    assert.ok(b, text);
    return b;
  };
  const click = async (text: string) => {
    await act(async () => button(text).click());
    await render();
  };
  const submit = async (text: string) => {
    const b = button(text);
    await act(async () =>
      b.form!.dispatchEvent(
        new dom.window.SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
          submitter: b,
        }),
      ),
    );
    await render();
  };
  try {
    await render();
    assert.match(document.body.textContent!, /Choose your steps/);
    await click("Continue →");
    const select = document.querySelector(
      "fieldset select",
    ) as HTMLSelectElement;
    await act(async () => {
      select.value = "optional";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await click("Continue →");
    fail = true;
    await submit("Save my routine");
    assert.equal(records.filter((r) => r.kind === "protocol").length, 0);
    fail = false;
    await submit("Save my routine");
    const template = records.find((r) => r.kind === "protocol")!;
    assert.equal(template.kind, "protocol");
    await click("Begin today's routine");
    await submit("Skip this step");
    assert.match(error, /Add a note/);
    assert.equal(records.filter((r) => r.kind === "response").length, 0);
    (document.querySelector('[name="note"]') as HTMLTextAreaElement).value =
      "Already checked in before opening the routine";
    await submit("Skip this step");
    assert.equal(
      records.find((r) => r.kind === "response")?.body.status,
      "skipped",
    );
    await submit("Complete & continue");
    await act(async () => root.unmount());
    const resumed = createRoot(document.getElementById("root")!);
    await act(async () =>
      resumed.render(createElement(GuidedPreparation, context())),
    );
    assert.match(
      document.querySelector(".prep-focus h3")!.textContent!,
      /Build today's trading plan/,
    );
    await act(async () => resumed.unmount());
    if (template.kind !== "protocol") throw Error("missing template");
    const edited = withRefs(
      createRecord(
        "protocol",
        { ...template.body, steps: template.body.steps.slice(0, 1) },
        template,
      ),
    );
    validateAppend(records, [edited], []);
    records.push(edited);
    const run = records.find((r) => r.kind === "run")!;
    if (run.kind !== "run") throw Error("missing run");
    assert.equal(run.body.steps.length, 5);
    sessionId = crypto.randomUUID(); // A new recording on the same day gets a fresh checklist.
    const fresh = createRoot(document.getElementById("root")!);
    await act(async () =>
      fresh.render(createElement(GuidedPreparation, context())),
    );
    assert.match(document.body.textContent!, /Begin today's routine/);
    assert.equal(document.querySelector("progress"), null);
    await act(async () => fresh.unmount());
  } finally {
    dom.window.close();
  }
});

