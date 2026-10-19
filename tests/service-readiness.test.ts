import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as brokers } from "../src/app/api/brokers/route";
import { POST as market } from "../src/app/api/market/route";
const request = (body: unknown, auth = true) =>
  new Request("https://example.test/api", {
    method: "POST",
    headers: auth ? { Authorization: "Bearer test-session" } : {},
    body: JSON.stringify(body),
  });
test("new service proxies reject anonymous access before handling readiness", async () => {
  assert.equal(
    (await brokers(request({ action: "status" }, false))).status,
    401,
  );
  assert.equal((await market(request({}, false))).status, 401);
});
test("uninstalled broker backend shows unavailable routes without querying or exposing account data", async () => {
  const old = process.env.BROKER_SERVICES_ENABLED,
    fetcher = globalThis.fetch;
  delete process.env.BROKER_SERVICES_ENABLED;
  globalThis.fetch = async () => {
    throw new Error("readiness must not contact Supabase");
  };
  try {
    const response = await brokers(request({ action: "status" }));
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.ok(state.routes.every((r: { available: boolean }) => !r.available));
    assert.deepEqual(state.connections, []);
    assert.deepEqual(state.accounts, []);
    assert.deepEqual(state.jobs, []);
    assert.equal(
      (
        await brokers(
          request({
            action: "connect",
            provider: "oanda",
            accessToken: "do-not-store",
          }),
        )
      ).status,
      503,
    );
  } finally {
    if (old === undefined) delete process.env.BROKER_SERVICES_ENABLED;
    else process.env.BROKER_SERVICES_ENABLED = old;
    globalThis.fetch = fetcher;
  }
});
test("uninstalled market backend preserves the usable timeline with an honest empty feed", async () => {
  const old = process.env.MARKET_SERVICES_ENABLED,
    fetcher = globalThis.fetch;
  delete process.env.MARKET_SERVICES_ENABLED;
  globalThis.fetch = async () => {
    throw new Error("readiness must not contact a provider");
  };
  try {
    const response = await market(request({ instrument: "AAPL" }));
    assert.equal(response.status, 200);
    const feed = await response.json();
    assert.equal(feed.state, "unavailable");
    assert.deepEqual(feed.candles, []);
    assert.match(feed.message, /timeline remains available/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (old === undefined) delete process.env.MARKET_SERVICES_ENABLED;
    else process.env.MARKET_SERVICES_ENABLED = old;
    globalThis.fetch = fetcher;
  }
});


test("Vercel proxy blocks commercial SnapTrade even when an older broker backend is enabled", async () => {
  const old = { ...process.env }, fetcher = globalThis.fetch;
  Object.assign(process.env, { BROKER_SERVICES_ENABLED: "true", SNAPTRADE_COMMERCIAL_ENABLED: "true" });
  globalThis.fetch = async () => { throw new Error("must not forward to a legacy commercial backend"); };
  try {
    const response = await brokers(request({ action: "connect", provider: "snaptrade", connectionType: "snaptrade" }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Personal sharing is disabled/);
    assert.deepEqual((await (await brokers(request({ action: "catalog" }))).json()).institutions, []);
  } finally { process.env = old; globalThis.fetch = fetcher; }
});
