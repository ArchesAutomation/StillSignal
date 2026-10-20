import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { routeAvailability } from "../src/lib/brokers/registry";

test("guided connections preserve live/demo selection and distinguish setup from confirmed delivery", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://connection-ui.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    FormData: dom.window.FormData,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const oldEnv = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://connection-ui.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  const { authClient } = await import("../src/lib/cloud");
  const client = authClient()!;
  t.mock.method(client.auth, "getSession", async () => ({
    data: { session: { access_token: "test-token" } },
    error: null,
  }));
  const { default: BrokerConnections } = await import(
    "../src/components/broker-connections"
  );
  const { default: TradingViewConnection } = await import(
    "../src/components/tradingview-connection"
  );
  const calls: Record<string, unknown>[] = [];
  let statusCalls = 0;
  let delivered = false;
  let brokerConnected = false,
    executions = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (url === "/api/data")
      return Response.json({
        connection: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          lastReceivedAt: delivered ? new Date().toISOString() : null,
          eventCount: delivered ? 1 : 0,
          timezone: "UTC",
        },
      });
    if (body.action === "status") {
      statusCalls++;
      return Response.json({
        routes: routeAvailability({
          BROKER_ENCRYPTION_KEY: "A".repeat(43) + "=",
          APP_ORIGIN: "https://connection-ui.test",
          TRADOVATE_CLIENT_ID: "test-client",
          TRADOVATE_CLIENT_SECRET: "test-secret",
          TRADOVATE_APPROVED: "true",
          PROJECTX_ENABLED: "true",
          OANDA_ENABLED: "true",
        }),
        connections: brokerConnected
          ? [
              {
                id: "33333333-3333-4333-8333-333333333333",
                provider: "oanda",
                status: "connected",
                environment: "paper",
              },
            ]
          : [],
        accounts: brokerConnected
          ? [
              {
                id: "account",
                connection_id: "33333333-3333-4333-8333-333333333333",
                name: "Practice account",
                identity_verified: true,
                metadata: { maskedNumber: "••••1234" },
                environment: "paper",
              },
            ]
          : [],
        jobs: [],
      });
    }
    calls.push(body);
    if (body.action === "progress")
      return Response.json({
        importedExecutions: executions,
        historyChecked: false,
      });
    if (body.action === "connect" && body.provider === "oanda") {
      brokerConnected = true;
      return Response.json({
        queued: true,
        connectionId: "33333333-3333-4333-8333-333333333333",
      });
    }
    return Response.json({
      url: "https://trader.tradovate.com/oauth?state=test",
      connectionId: "33333333-3333-4333-8333-333333333333",
    });
  };
  const root = createRoot(document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    await client.auth.dispose();
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
    dom.window.close();
  });
  await act(async () =>
    root.render(
      createElement(BrokerConnections, { owner: "test-owner", onChanged() {} }),
    ),
  );
  assert.match(document.body.textContent!, /Choose connection type/);
  assert.equal(document.querySelector("select"), null);
  await act(async () => [...document.querySelectorAll("button")].find((b) => b.querySelector("strong")?.textContent === "Direct")!.click());
  const select = document.querySelector<HTMLSelectElement>("select")!;
  assert.ok([...select.options].some((o) => o.value === "ibkr"));
  await act(async () => {
    select.value = "tradovate";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Continue"))!
      .click();
  });
  await act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Continue to authentication"))!.click());
  const approve = async () => {
    await act(async () => (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    await act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent === "Connect account")!.click());
  };
  for (const value of ["paper", "live"]) {
    const environment = document.querySelector<HTMLSelectElement>(
      '[aria-label="Broker account type"]',
    )!;
    await act(async () => {
      environment.value = value;
      environment.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    await act(async () => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Review permissions"))!
        .click();
    });
    await approve();
    assert.deepEqual(calls.filter((c) => c.action === "connect").at(-1), {
      connectionType: "direct",
      action: "connect",
      provider: "tradovate",
      environment: value,
    });
    assert.ok(
      document.querySelector(
        'a[href="https://trader.tradovate.com/oauth?state=test"]',
      ),
    );
    assert.match(
      document.body.textContent!,
      /Waiting for the first trade import/,
    );
    assert.doesNotMatch(document.body.textContent!, /Your first trades are in/);
    await act(async () => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Retry sign-in")!
        .click();
    });
  }
  const previousStatus = statusCalls;
  await act(async () => window.dispatchEvent(new dom.window.Event("focus")));
  assert.ok(
    statusCalls > previousStatus,
    "returning from sign-in refreshes connection status",
  );
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Change broker"))!
      .click();
  });
  const broker = document.querySelector<HTMLSelectElement>("select")!;
  await act(async () => {
    broker.value = "oanda";
    broker.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Continue"))!
      .click();
  });
  await act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Continue to authentication"))!.click());
  assert.match(document.body.textContent!, /Manage API Access/);
  const token = document.querySelector<HTMLInputElement>(
    'input[name="accessToken"]',
  )!;
  assert.equal(token.type, "password");
  token.value = "private-token";
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
  assert.equal(calls.filter((c) => c.action === "connect").at(-1)?.provider, "tradovate", "credentials are not sent before permission confirmation");
  await approve();
  assert.equal(
    calls.filter((c) => c.action === "connect").at(-1)?.accessToken,
    "private-token",
  );
  assert.match(document.body.textContent!, /authorization confirmed/);
  assert.match(document.body.textContent!, /1 account found/);
  assert.doesNotMatch(
    document.body.textContent!,
    /Your first trades are in|private-token/,
  );
  executions = 1;
  await act(async () => window.dispatchEvent(new dom.window.Event("focus")));
  assert.match(document.body.textContent!, /Your first trades are in/);
  assert.match(document.body.textContent!, /1 execution imported/);
  await act(async () =>
    root.render(createElement(TradingViewConnection, { onChanged() {} })),
  );
  assert.equal(
    document.querySelector(".tag")!.textContent,
    "Waiting for first alert",
  );
  assert.match(document.body.textContent!, /Manual buys and sells/);
  assert.ok(document.querySelector('a[href="#trade-csv"]'));
  await act(async () => root.render(null));
  delivered = true;
  await act(async () =>
    root.render(createElement(TradingViewConnection, { onChanged() {} })),
  );
  assert.equal(document.querySelector(".tag")!.textContent, "Alerts received");
});
