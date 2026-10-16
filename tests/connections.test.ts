import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { routeAvailability } from "../src/lib/brokers/registry";

test("guided connections preserve live/demo selection and distinguish setup from confirmed delivery", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://connection-ui.test" });
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, localStorage: dom.window.localStorage,
    FormData: dom.window.FormData,
  })) Object.defineProperty(globalThis, key, { value, configurable: true });
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const oldEnv = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://connection-ui.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  const { authClient } = await import("../src/lib/cloud");
  const client = authClient()!;
  t.mock.method(client.auth, "getSession", async () => ({ data: { session: { access_token: "test-token" } }, error: null }));
  const { default: BrokerConnections } = await import("../src/components/broker-connections");
  const { default: TradingViewConnection } = await import("../src/components/tradingview-connection");
  const calls: Record<string, unknown>[] = [];
  let statusCalls = 0;
  let delivered = false;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (url === "/api/data") return Response.json({ connection: {
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      lastReceivedAt: delivered ? new Date().toISOString() : null,
      eventCount: delivered ? 1 : 0, timezone: "UTC",
    } });
    if (body.action === "status") {
      statusCalls++;
      return Response.json({
        routes: routeAvailability({ BROKER_ENCRYPTION_KEY: "A".repeat(43) + "=",
          TRADOVATE_CLIENT_ID: "test-client", TRADOVATE_CLIENT_SECRET: "test-secret", TRADOVATE_APPROVED: "true",
          PROJECTX_ENABLED: "true" }),
        connections: [], accounts: [], jobs: [],
      });
    }
    calls.push(body);
    return Response.json({ url: "https://trader.tradovate.com/oauth?state=test" });
  };
  const root = createRoot(document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    await client.auth.dispose();
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
    dom.window.close();
  });
  await act(async () => root.render(createElement(BrokerConnections, { owner: "test-owner", onChanged() {} })));
  assert.doesNotMatch(document.body.textContent!, /Commercial SnapTrade client ID|conformance approval|encryption/i);
  const select = document.querySelector<HTMLSelectElement>("select")!;
  assert.ok(![...select.options].some((o) => o.value === "ibkr"));
  await act(async () => {
    select.value = "tradovate";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const environment = document.querySelector<HTMLSelectElement>('[aria-label="Broker account type"]')!;
  for (const value of ["paper", "live"]) {
    await act(async () => {
      environment.value = value;
      environment.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () => {
      [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Connect account"))!.click();
    });
    assert.deepEqual(calls.at(-1), { action: "connect", provider: "tradovate", environment: value });
    assert.ok(document.querySelector('a[href="https://trader.tradovate.com/oauth?state=test"]'));
  }
  const previousStatus = statusCalls;
  await act(async () => window.dispatchEvent(new dom.window.Event("focus")));
  assert.ok(statusCalls > previousStatus, "returning from sign-in refreshes connection status");
  await act(async () => root.render(createElement(TradingViewConnection, { onChanged() {} })));
  assert.equal(document.querySelector(".tag")!.textContent, "Waiting for first alert");
  assert.match(document.body.textContent!, /Manual buys and sells/);
  assert.ok(document.querySelector('a[href="#trade-csv"]'));
  await act(async () => root.render(null));
  delivered = true;
  await act(async () => root.render(createElement(TradingViewConnection, { onChanged() {} })));
  assert.equal(document.querySelector(".tag")!.textContent, "Alerts received");
});
