import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";

test("an offline workspace with no pending writes does not claim its cloud records are synced", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  const dom = new JSDOM('<div id="root"></div>');
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: { onLine: false }, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const { useProcess } = await import("../src/components/command-center/use-process");
  function Status() {
    const store = useProcess("33333333-3333-4333-8333-333333333333", []);
    return createElement("p", null, store.syncState);
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(createElement(Status));
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    // IndexedDB callbacks run asynchronously after effects mount.
    for (let i = 0; i < 20 && !document.body.textContent?.includes("Offline"); i++)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.match(document.body.textContent!, /Offline/);
    assert.ok(!document.body.textContent!.includes("Process records synced"));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
