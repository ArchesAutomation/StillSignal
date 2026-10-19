import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { POST as brokers } from "../src/lib/handlers/brokers";
import { POST as market } from "../src/lib/handlers/market";
import { POST as webhook } from "../src/lib/handlers/broker-webhook";
import { canonicalJson } from "../src/lib/brokers/security";
const owner = "11111111-1111-4111-8111-111111111111";
const connection = "33333333-3333-4333-8333-333333333333";
const account = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown, auth = true) =>
  new Request("https://staging.test/api", {
    method: "POST",
    headers: auth ? { Authorization: "Bearer staging-token" } : {},
    body: JSON.stringify(body),
  });
type Call = { url: URL; method: string; body: Record<string, unknown> | null };
async function mockCloud(
  run: (calls: Call[]) => Promise<void>,
  respond: (call: Call) => unknown = () => [],
) {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env },
    calls: Call[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init),
      call = {
        url: new URL(req.url),
        method: req.method,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? null
            : JSON.parse((await req.text()) || "null"),
      };
    calls.push(call);
    if (call.url.pathname === "/auth/v1/user")
      return Response.json({ id: owner, email: "staging@example.test" });
    if (call.url.pathname.endsWith("/pulse_rate_limit"))
      return Response.json(true);
    const response = respond(call);
    return response instanceof Response ? response : Response.json(response);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
}
test("broker and market handlers reject anonymous requests without provider calls", async () => {
  await mockCloud(async (calls) => {
    assert.equal(
      (await brokers(request({ action: "status" }, false))).status,
      401,
    );
    assert.equal((await market(request({}, false))).status, 401);
    assert.equal(calls.length, 0);
  });
});
test("broker status is tenant scoped and does not request credential columns", async () => {
  await mockCloud(async (calls) => {
    const response = await brokers(request({ action: "status" }));
    assert.equal(response.status, 200);
    const queries = calls.filter((c) =>
      c.url.pathname.startsWith("/rest/v1/pulse_broker_"),
    );
    assert.equal(queries.length, 3);
    for (const call of queries) {
      assert.equal(call.url.searchParams.get("user_id"), "eq." + owner);
      assert.ok(!call.url.searchParams.get("select")?.includes("ciphertext"));
    }
    assert.ok(
      !JSON.stringify(await response.json()).includes("test-service-key"),
    );
  });
});

test("import progress counts only the authenticated customer's selected connection", async () => {
  await mockCloud(
    async (calls) => {
      const response = await brokers(
        request({ action: "progress", connectionId: connection }),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        importedExecutions: 3,
        historyChecked: true,
      });
      const queries = calls.filter((c) =>
        c.url.pathname.startsWith("/rest/v1/pulse_broker_"),
      );
      assert.equal(queries.length, 2);
      assert.ok(
        queries.every(
          (c) => c.url.searchParams.get("user_id") === "eq." + owner,
        ),
      );
      const count = queries.find((c) => c.method === "HEAD")!;
      assert.equal(
        count.url.searchParams.get("pulse_broker_accounts.connection_id"),
        "eq." + connection,
      );
      assert.equal(queries[0].url.searchParams.get("id"), "eq." + connection);
    },
    (c) =>
      c.url.pathname.endsWith("pulse_broker_executions")
        ? new Response(null, { headers: { "Content-Range": "0-2/3" } })
        : { id: connection, last_sync_at: "2026-10-19T00:00:00Z" },
  );
});

test("refresh does not queue discovery before OAuth sign-in or after disconnect", async () => {
  for (const status of ["pending", "revoked"])
    await mockCloud(
      async (calls) => {
        const response = await brokers(
          request({ action: "refresh", connectionId: connection }),
        );
        assert.equal(response.status, 409);
        assert.ok(
          !calls.some((c) => c.url.pathname.endsWith("pulse_broker_discovery")),
        );
      },
      (c) =>
        c.url.pathname.endsWith("pulse_broker_connections")
          ? { id: connection, status }
          : null,
    );
});

test("an unconfigured tastytrade demo connection is rejected before account mutation", async () => {
  await mockCloud(async (calls) => {
    Object.assign(process.env, {
      APP_ORIGIN: "https://staging.test",
      BROKER_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      TASTYTRADE_CLIENT_ID: "client",
      TASTYTRADE_CLIENT_SECRET: "secret",
      TASTYTRADE_APPROVED: "true",
    });
    delete process.env.TASTYTRADE_PAPER_CLIENT_ID;
    delete process.env.TASTYTRADE_PAPER_CLIENT_SECRET;
    const response = await brokers(
      request({
        action: "connect",
        provider: "tastytrade",
        environment: "paper",
      }),
    );
    assert.equal(response.status, 503);
    assert.ok(
      !calls.some((c) => c.url.pathname.startsWith("/rest/v1/pulse_broker_")),
    );
  });
});
test("disconnect pauses discovery and jobs before credential or remote revocation attempts", async () => {
  await mockCloud(
    async (calls) => {
      const response = await brokers(
        request({ action: "disconnect", connectionId: connection }),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).revokePending, true);
      const revoked = calls.findIndex((c) => c.body?.status === "revoked");
      const pausedDiscovery = calls.findIndex(
        (c) =>
          c.url.pathname.endsWith("/pulse_broker_discovery") &&
          c.body?.state === "paused",
      );
      const pausedJob = calls.findIndex(
        (c) =>
          c.url.pathname.endsWith("/pulse_broker_jobs") &&
          c.body?.state === "paused",
      );
      const secret = calls.findIndex((c) =>
        c.url.pathname.endsWith("/pulse_broker_secrets"),
      );
      assert.ok(
        revoked >= 0 &&
          pausedDiscovery > revoked &&
          pausedJob > pausedDiscovery &&
          secret > pausedJob,
      );
      for (const call of calls.filter((c) =>
        c.url.pathname.startsWith("/rest/v1/pulse_broker_"),
      ))
        assert.equal(call.url.searchParams.get("user_id"), "eq." + owner);
      assert.ok(
        !calls.some(
          (c) =>
            c.url.pathname.endsWith("/pulse_broker_secrets") &&
            c.method === "DELETE",
        ),
      );
    },
    (call) => {
      if (
        call.url.pathname.endsWith("/pulse_broker_connections") &&
        call.method === "GET"
      )
        return {
          id: connection,
          user_id: owner,
          provider: "snaptrade",
          environment: "live",
        };
      if (call.url.pathname.endsWith("/pulse_broker_accounts"))
        return [{ id: account }];
      if (call.url.pathname.endsWith("/pulse_broker_secrets"))
        return { ciphertext: "invalid" };
      return [];
    },
  );
});
test("market permission failure returns a usable unavailable feed without provider calls or caching", async () => {
  await mockCloud(
    async (calls) => {
      const end = Date.now() - 1000;
      const response = await market(
        request({
          instrument: {
            id: "XNAS:AAPL",
            symbol: "AAPL",
            assetClass: "equity",
            exchange: "XNAS",
            currency: "USD",
            multiplier: 1,
          },
          start: end - 3600000,
          end,
          interval: 60,
          replay: true,
        }),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).state, "unavailable");
      assert.ok(calls.every((c) => c.url.origin === "https://staging.test"));
      assert.ok(
        !calls.some((c) => c.url.pathname.includes("pulse_market_cache")),
      );
      const entitlement = calls.find((c) =>
        c.url.pathname.endsWith("/pulse_market_entitlements"),
      );
      assert.equal(entitlement?.url.searchParams.get("user_id"), "eq." + owner);
    },
    () => null,
  );
});
test("signed webhook acknowledgment follows durable acceptance and rejects forged or stale receipts", async () => {
  await mockCloud(async (calls) => {
    process.env.SNAPTRADE_CLIENT_ID = "staging-client";
    process.env.SNAPTRADE_CONSUMER_KEY = "staging-secret";
    const body = {
      webhookId: "receipt-1",
      userId: "pulse-" + owner,
      clientId: "staging-client",
      eventType: "ACCOUNT_UPDATED",
      eventTimestamp: new Date().toISOString(),
    };
    const signed = (payload: typeof body, signature?: string) =>
      new Request("https://staging.test/webhook", {
        method: "POST",
        headers: {
          Signature:
            signature ||
            createHmac("sha256", "staging-secret")
              .update(canonicalJson(payload))
              .digest("base64"),
        },
        body: JSON.stringify(payload),
      });
    assert.equal((await webhook(signed(body, "forged"))).status, 401);
    assert.equal(calls.length, 0);
    assert.equal(
      (
        await webhook(
          signed({ ...body, eventTimestamp: "2020-01-01T00:00:00Z" }),
        )
      ).status,
      401,
    );
    assert.equal(calls.length, 0);
    assert.equal((await webhook(signed(body))).status, 202);
    const receipt = calls.find((c) =>
      c.url.pathname.endsWith("/pulse_accept_broker_receipt"),
    );
    assert.deepEqual(receipt?.body, {
      p_user: owner,
      p_id: "receipt-1",
      p_type: "ACCOUNT_UPDATED",
    });
  });
});
