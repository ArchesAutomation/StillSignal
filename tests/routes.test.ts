import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as dataPost } from "../src/app/api/data/route";
import { POST as webhookPost } from "../src/app/api/tradingview/route";
import { GET as health } from "../src/app/api/health/route";
test("data route rejects anonymous access before parsing payload", async () => {
  const r = await dataPost(
    new Request("https://example.test/api/data", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(r.status, 401);
});
test("webhook route rejects invalid ingestion token and oversized body", async () => {
  const r = await webhookPost(
    new Request("https://example.test/api/tradingview", {
      method: "POST",
      body: JSON.stringify({ token: "invalid", event: {} }),
    }),
  );
  assert.equal(r.status, 400);
  const big = await webhookPost(
    new Request("https://example.test/api/tradingview", {
      method: "POST",
      body: "x".repeat(9000),
    }),
  );
  assert.equal(big.status, 413);
});
test("health accurately reports unconfigured cloud", async () => {
  const r = await health();
  const body = await r.json();
  assert.equal(body.cloudConfigured, false);
  assert.equal(body.status, "ok");
});
