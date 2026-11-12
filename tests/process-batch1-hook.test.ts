import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createRecord } from "../src/lib/process/model";

test("the workspace displays downloaded evidence after upload failure and updates offline/retry status", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  const dom = new JSDOM('<div id="root"></div>');
  const connection = { onLine: true };
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: connection, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const { authClient } = await import("../src/lib/cloud");
  const { saveProcess } = await import("../src/lib/process/storage");
  const { useProcess } = await import("../src/components/process/use-process");
  const owner = crypto.randomUUID();
  const local = createRecord("day", { date: "2026-11-04", timezone: "UTC", status: "preparing", instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "" });
  const remote = createRecord("day", { ...local.body, date: "2026-11-03" });
  await saveProcess(owner, [local]);
  const client = authClient()!;
  await client.auth.initialize();
  await client.auth.stopAutoRefresh();
  client.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "isolated-test" } as never }, error: null });
  const oldFetch = globalThis.fetch;
  let failUpload = true;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    return payload.action === "append"
      ? failUpload ? Response.json({ error: "Rejected test upload" }, { status: 400 }) : Response.json({ ok: true })
      : Response.json({ records: payload.kind === "day" ? [remote] : [] });
  };
  function Status() {
    const store = useProcess(owner, []);
    return createElement("p", null, `${store.syncState} | ${store.records.map(r => r.id).join(",")}`);
  }
  const root = createRoot(document.getElementById("root")!);
  async function until(expected: RegExp) {
    for (let i = 0; i < 100 && !expected.test(document.body.textContent ?? ""); i++)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.match(document.body.textContent!, expected);
  }
  try {
    await act(async () => root.render(createElement(Status)));
    await until(/Saved locally · Rejected test upload/);
    assert.ok(document.body.textContent?.includes(remote.id), "failed sync still refreshes the displayed records");
    assert.ok(document.body.textContent?.includes(local.id));
    connection.onLine = false;
    await act(async () => dom.window.dispatchEvent(new dom.window.Event("offline")));
    await until(/Offline · 1 local changes awaiting sync/);
    failUpload = false;
    connection.onLine = true;
    await act(async () => dom.window.dispatchEvent(new dom.window.Event("online")));
    await until(/Process records synced/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    await client.auth.dispose();
    dom.window.close();
  }
});
