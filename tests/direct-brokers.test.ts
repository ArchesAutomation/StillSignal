import { test } from "node:test";
import assert from "node:assert/strict";
import { alpaca, alpacaFill } from "../src/lib/brokers/alpaca";
import { tastytrade, tastyFill } from "../src/lib/brokers/tastytrade";
import {
  authorizeUrl,
  exchangeCode,
  refreshCredentials,
} from "../src/lib/brokers/oauth";
import { routeAvailability } from "../src/lib/brokers/registry";
import { normalizeExecution } from "../src/lib/brokers/normalize";
import type { BrokerAccount } from "../src/lib/brokers/model";
const uuid = "11111111-1111-4111-8111-111111111111";
const account: BrokerAccount = {
  id: uuid,
  providerId: uuid,
  number: "1234",
  name: "Test",
  currency: "USD",
  institution: "Alpaca",
  environment: "paper",
  identityVerified: true,
};
const instrument = {
  id: "test:AAPL",
  symbol: "AAPL",
  assetClass: "equity" as const,
  currency: "USD",
  multiplier: 1,
};
const fill = {
  id: "fill-1",
  activity_type: "FILL",
  transaction_time: "2026-10-12T15:30:00.123Z",
  symbol: "AAPL",
  side: "buy",
  qty: "0.5",
  price: "200.12",
};
const tx = {
  id: 123,
  "account-number": uuid,
  "transaction-type": "Trade",
  "executed-at": fill.transaction_time,
  symbol: "AAPL",
  "instrument-type": "Equity",
  action: "Buy to Open",
  price: "200.12",
  quantity: "2",
  currency: "USD",
};
type Call = { url: URL; init: RequestInit };
async function withFetch(
  run: (calls: Call[]) => Promise<void>,
  respond: (call: Call) => unknown,
) {
  const old = globalThis.fetch,
    calls: Call[] = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: new URL(String(url)), init };
    calls.push(call);
    const response = respond(call);
    return response instanceof Response ? response : Response.json(response);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = old;
  }
}
test("direct OAuth preserves state, requests read access, and gates unconfigured environments", () => {
  const old = { ...process.env };
  try {
    Object.assign(process.env, {
      APP_ORIGIN: "https://pulse.test",
      ALPACA_CLIENT_ID: "alpaca",
      TASTYTRADE_CLIENT_ID: "live",
      TASTYTRADE_PAPER_CLIENT_ID: "paper",
    });
    for (const provider of ["alpaca", "tastytrade"] as const)
      for (const env of ["live", "paper"] as const) {
        const url = new URL(authorizeUrl(provider, "nonce", env));
        assert.equal(url.searchParams.get("state"), "nonce");
        assert.equal(
          url.searchParams.get("redirect_uri"),
          "https://pulse.test/api/brokers/callback",
        );
        assert.ok(!/trade|write/.test(url.searchParams.get("scope") || ""));
        if (provider === "alpaca")
          assert.equal(url.searchParams.get("env"), env);
        else {
          assert.equal(url.searchParams.get("scope"), "read");
          assert.equal(url.searchParams.get("client_id"), env);
        }
      }
    const env = {
      APP_ORIGIN: "https://pulse.test",
      BROKER_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      TASTYTRADE_CLIENT_ID: "live",
      TASTYTRADE_CLIENT_SECRET: "secret",
      TASTYTRADE_APPROVED: "true",
    };
    const route = routeAvailability(env).find((r) => r.id === "tastytrade")!;
    assert.equal(route.available, true);
    assert.deepEqual(route.environments, ["live"]);
    assert.equal(
      routeAvailability({ ...env, TASTYTRADE_APPROVED: "false" }).find(
        (r) => r.id === "tastytrade",
      )!.available,
      false,
    );
    assert.equal(
      routeAvailability({ ...env, APP_ORIGIN: "" }).find(
        (r) => r.id === "tastytrade",
      )!.available,
      false,
    );
  } finally {
    process.env = old;
  }
});
test("token exchange and refresh use separate sandbox credentials and retain tastytrade refresh grant", async () => {
  const old = { ...process.env };
  Object.assign(process.env, {
    APP_ORIGIN: "https://pulse.test",
    TASTYTRADE_PAPER_CLIENT_ID: "paper-client",
    TASTYTRADE_PAPER_CLIENT_SECRET: "paper-secret",
  });
  try {
    await withFetch(
      async (calls) => {
        const c = await exchangeCode("tastytrade", "code", "paper");
        assert.equal(c.refreshToken, "refresh");
        const next = await refreshCredentials("tastytrade", {
          ...c,
          expiresAt: Date.now() - 1,
        });
        assert.equal(next.refreshToken, "refresh");
        assert.ok(next.expiresAt! > Date.now());
        assert.ok(
          calls.every(
            (c) => c.url.origin === "https://api.cert.tastyworks.com",
          ),
        );
        assert.equal(
          JSON.parse(String(calls[0].init.body)).client_id,
          "paper-client",
        );
        const body = JSON.parse(String(calls[1].init.body));
        assert.equal(body.client_secret, "paper-secret");
        assert.equal(body.scope, "read");
        assert.equal(
          new Headers(calls[0].init.headers).get("User-Agent"),
          "TraderPulse/0.4.1",
        );
      },
      ({ init }) =>
        JSON.parse(String(init.body)).grant_type === "refresh_token"
          ? { access_token: "renewed", expires_in: 900 }
          : {
              access_token: "access",
              refresh_token: "refresh",
              expires_in: 900,
            },
    );
    await withFetch(
      async () => {
        await assert.rejects(
          exchangeCode("tastytrade", "code", "paper"),
          /PROVIDER_REAUTH/,
        );
      },
      () => ({ access_token: "bad", refresh_token: "refresh", expires_in: 0 }),
    );
  } finally {
    process.env = old;
  }
});
test("Alpaca preserves fractional partial fills, immutable IDs, exact times and unknown position effects", () => {
  const a = alpacaFill(fill, instrument, "USD"),
    b = alpacaFill({ ...fill, id: "fill-2", qty: "1.5" }, instrument, "USD");
  assert.equal(a.quantity, 0.5);
  assert.equal(a.t, Date.parse(fill.transaction_time));
  assert.notEqual(a.id, b.id);
  assert.equal(a.positionBefore, undefined);
  assert.equal(a.pnl, undefined);
  const context = {
    userId: uuid,
    accountId: uuid,
    connectionId: uuid,
    provider: "alpaca",
    receivedAt: Date.now(),
  };
  assert.equal(normalizeExecution(a, context).events[0].kind, "fill");
  assert.throws(() => alpacaFill({ ...fill, qty: "NaN" }, instrument, "USD"));
});
test("Alpaca paginates a frozen snapshot and uses actual option multiplier rather than deliverable size", async () => {
  const symbol = "AAPL261218C00240000";
  await withFetch(
    async (calls) => {
      const first = await alpaca.executions(
        { accessToken: "secret", environment: "paper" },
        account,
        {},
      );
      assert.equal(first.complete, false);
      assert.equal(first.cursor.token, "fill-99");
      assert.equal(first.records[0].instrument.multiplier, 100);
      const second = await alpaca.executions(
        { accessToken: "secret", environment: "paper" },
        account,
        first.cursor,
      );
      assert.equal(second.complete, true);
      const queries = calls.filter((c) =>
        c.url.pathname.endsWith("activities"),
      );
      assert.equal(
        queries[0].url.searchParams.get("until"),
        queries[1].url.searchParams.get("until"),
      );
      assert.equal(queries[1].url.searchParams.get("page_token"), "fill-99");
      assert.ok(
        calls.every((c) => c.url.origin === "https://paper-api.alpaca.markets"),
      );
      assert.ok(
        calls.every(
          (c) =>
            new Headers(c.init.headers).get("Authorization") ===
            "Bearer secret",
        ),
      );
    },
    ({ url }) => {
      if (url.pathname.endsWith("activities"))
        return url.searchParams.has("page_token")
          ? []
          : Array.from({ length: 100 }, (_, i) => ({
              ...fill,
              symbol,
              id: "fill-" + i,
            }));
      if (url.pathname.includes("options/contracts"))
        return {
          id: uuid,
          symbol,
          expiration_date: "2026-12-18",
          size: "20",
          multiplier: "100",
        };
      return { id: uuid, symbol, class: "us_option", exchange: "OPRA" };
    },
  );
  await withFetch(
    async () => {
      await assert.rejects(
        alpaca.executions({ environment: "live" }, account, {}),
      );
    },
    ({ url }) =>
      url.pathname.endsWith("activities")
        ? [{ ...fill, symbol }]
        : url.pathname.includes("options/contracts")
          ? { id: uuid, symbol, expiration_date: "2026-12-18", size: "100" }
          : { id: uuid, symbol, class: "us_option", exchange: "OPRA" },
  );
});
test("tastytrade retains trade effects and final fee signs, and rejects unsupported reversals", () => {
  const a = tastyFill(
    {
      ...tx,
      commission: "1",
      "commission-effect": "Debit",
      "clearing-fees": "0.1",
      "clearing-fees-effect": "Credit",
    },
    instrument,
  );
  assert.equal(a.openedQuantity, 2);
  assert.equal(a.closedQuantity, 0);
  assert.equal(a.fees, 0.9);
  const close = tastyFill({ ...tx, action: "Sell to Close" }, instrument);
  assert.equal(close.closedQuantity, 2);
  assert.equal(close.openedQuantity, 0);
  assert.equal(
    tastyFill({ ...tx, "is-estimated-fee": true, commission: "10" }, instrument)
      .fees,
    undefined,
  );
  assert.throws(
    () => tastyFill({ ...tx, "reverses-id": 122 }, instrument),
    /RECONCILIATION_REQUIRED/,
  );
  assert.throws(
    () => tastyFill({ ...tx, commission: "1" }, instrument),
    /UNRESOLVED_FEES/,
  );
});
test("tastytrade validates account identity/currency and freezes transaction pagination", async () => {
  await withFetch(
    async (calls) => {
      const accounts = await tastytrade.accounts({
        environment: "paper",
        accessToken: "secret",
      });
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].currency, "USD");
      const first = await tastytrade.executions(
        { environment: "paper" },
        accounts[0],
        {},
      );
      assert.equal(first.cursor.page, 1);
      assert.equal(first.complete, false);
      const next = await tastytrade.executions(
        { environment: "paper" },
        accounts[0],
        first.cursor,
      );
      assert.equal(next.complete, true);
      assert.equal(next.records.length, 0);
      const history = calls.filter((c) =>
        c.url.pathname.endsWith("transactions"),
      );
      assert.equal(
        history[0].url.searchParams.get("end-at"),
        history[1].url.searchParams.get("end-at"),
      );
      assert.ok(
        calls.every((c) => c.url.origin === "https://api.cert.tastyworks.com"),
      );
    },
    ({ url }) => {
      if (url.pathname.endsWith("/accounts"))
        return {
          data: {
            items: [
              { account: { "account-number": uuid, "is-closed": false } },
              { account: { "account-number": "closed", "is-closed": true } },
            ],
          },
        };
      if (url.pathname.endsWith("balances"))
        return { data: { "account-number": uuid, currency: "USD" } };
      if (url.pathname.endsWith("transactions"))
        return {
          data: {
            items:
              url.searchParams.get("page-offset") === "0"
                ? Array.from({ length: 100 }, (_, i) => ({ ...tx, id: i + 1 }))
                : [],
          },
        };
      return { data: { symbol: "AAPL", "listed-market": "NASDAQ" } };
    },
  );
  await withFetch(
    async () => {
      await assert.rejects(
        tastytrade.executions({}, account, {}),
        /PROVIDER_CONTRACT_CHANGED/,
      );
    },
    () => ({
      data: { items: [{ ...tx, "account-number": "another-customer" }] },
    }),
  );
});
