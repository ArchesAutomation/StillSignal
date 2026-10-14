import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eventSchema, sessionSchema } from "../src/lib/validation";
import { normalizeExecution } from "../src/lib/brokers/normalize";
import {
  encryptCredentials,
  decryptCredentials,
  accountIdentity,
  canonicalJson,
  snapSignature,
  trustedPortal,
} from "../src/lib/brokers/security";
import { mergeSessions } from "../src/lib/workspace";
import { executionAction, pnlByCurrency } from "../src/lib/trade-context";
import { reconstructTrades } from "../src/lib/smart-journal";
import { snapActivity } from "../src/lib/brokers/snaptrade";
import { oandaFill } from "../src/lib/brokers/oanda";
import { routeAvailability } from "../src/lib/brokers/registry";
import type { RawExecution } from "../src/lib/brokers/model";
const user = "11111111-1111-4111-8111-111111111111",
  account = "22222222-2222-4222-8222-222222222222",
  connection = "33333333-3333-4333-8333-333333333333";
const context = {
  userId: user,
  accountId: account,
  connectionId: connection,
  provider: "oanda",
  receivedAt: 1700000001000,
};
const fill: RawExecution = {
  id: "native-fill-1",
  t: 1700000000123,
  action: "buy",
  price: 100,
  quantity: 3,
  currency: "CAD",
  fees: 3,
  instrument: {
    id: "XTSX:ABC",
    symbol: "ABC",
    assetClass: "equity",
    exchange: "XTSX",
    currency: "CAD",
    multiplier: 1,
  },
  raw: { id: "native-fill-1" },
};
test("legacy contracts and new broker records validate without rewriting old data", () => {
  const legacy = {
    id: "old",
    t: 1000,
    symbol: "ES",
    kind: "entry",
    side: "long",
    price: 5000,
    quantity: 1,
    source: "manual",
  };
  assert.deepEqual(eventSchema.parse(legacy), legacy);
  const record = normalizeExecution(fill, context);
  assert.equal(record.events[0].kind, "fill");
  assert.equal(record.events[0].side, "unknown");
  assert.equal(record.events[0].t, fill.t);
  assert.equal(record.events[0].currency, "CAD");
  assert.ok(
    sessionSchema.safeParse({ ...record.session, events: record.events })
      .success,
  );
  assert.equal(
    eventSchema.safeParse({ ...record.events[0], broker: undefined }).success,
    false,
  );
});
test("broker history does not assume a flat account and directions are explicit", () => {
  const unknown = normalizeExecution(fill, context).events;
  assert.equal(unknown[0].positionKnown, false);
  assert.deepEqual(reconstructTrades(unknown), []);
  const reversal = normalizeExecution(
    { ...fill, positionBefore: -2, pnl: 20 },
    context,
  ).events;
  assert.deepEqual(
    reversal.map((e) => [e.kind, e.side, e.quantity]),
    [
      ["exit", "short", 2],
      ["entry", "long", 1],
    ],
  );
  assert.equal(reversal[0].fees, 2);
  assert.equal(reversal[1].fees, 1);
  assert.ok(reversal.every((e) => executionAction(e) === "buy"));
  const partial = normalizeExecution(
    { ...fill, action: "sell", positionBefore: 5, quantity: 2 },
    context,
  ).events;
  assert.deepEqual(
    partial.map((e) => [e.kind, e.side, e.quantity]),
    [["exit", "long", 2]],
  );
});
test("canonical IDs survive retries and alternate connections to the same account", () => {
  const a = normalizeExecution(fill, context),
    b = normalizeExecution(fill, {
      ...context,
      connectionId: "44444444-4444-4444-8444-444444444444",
      receivedAt: 1700001000000,
    });
  assert.equal(a.id, b.id);
  assert.equal(a.hash, b.hash);
  assert.equal(a.session.id, b.session.id);
  assert.notEqual(
    a.id,
    normalizeExecution(fill, {
      ...context,
      userId: "55555555-5555-4555-8555-555555555555",
    }).id,
  );
  assert.notEqual(
    a.id,
    normalizeExecution(fill, {
      ...context,
      accountId: "55555555-5555-4555-8555-555555555555",
    }).id,
  );
  assert.equal(
    accountIdentity(user, "Interactive Brokers", "U123"),
    accountIdentity(user, "InteractiveBrokers", "U123"),
  );
});
test("broker amendments and voids survive stale local synchronization", () => {
  const first = normalizeExecution(fill, context),
    amended = normalizeExecution(
      { ...fill, price: 101, voided: true },
      { ...context, receivedAt: context.receivedAt + 1000 },
    );
  const old = { ...first.session, events: first.events },
    remote = { ...first.session, events: amended.events };
  const merged = mergeSessions(old, remote);
  assert.equal(merged.events[0].price, 101);
  assert.equal(merged.events[0].voided, true);
});
test("currency totals remain separate and exclude observations, strategies, and backtests", () => {
  const event = normalizeExecution(
    { ...fill, positionBefore: -3, pnl: 25 },
    context,
  ).events[0];
  const usd = { ...event, id: "usd", currency: "USD", pnl: 10 };
  assert.deepEqual(
    pnlByCurrency([
      event,
      usd,
      { ...event, id: "backtest", provenance: "backtest", pnl: 999 },
      { ...event, id: "strategy", provenance: "strategy", pnl: 999 },
    ]),
    [
      ["CAD", 25],
      ["USD", 10],
    ],
  );
});
test("secrets are authenticated ciphertext and portal redirects are narrowly restricted", () => {
  const old = process.env.BROKER_ENCRYPTION_KEY;
  process.env.BROKER_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const secret = {
      accessToken: "private-token",
      refreshToken: "private-refresh",
    };
    const encrypted = encryptCredentials(secret);
    assert.ok(!encrypted.includes("private"));
    assert.deepEqual(decryptCredentials(encrypted), secret);
    const parts = encrypted.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    assert.throws(() => decryptCredentials(parts.join(".")));
    assert.equal(
      trustedPortal("https://app.snaptrade.com/connect"),
      "https://app.snaptrade.com/connect",
    );
    assert.throws(() =>
      trustedPortal("https://app.snaptrade.com.evil.test/connect"),
    );
    assert.throws(() => trustedPortal("http://app.snaptrade.com/connect"));
  } finally {
    if (old === undefined) delete process.env.BROKER_ENCRYPTION_KEY;
    else process.env.BROKER_ENCRYPTION_KEY = old;
  }
});
test("SnapTrade signatures are canonical and daily transactions do not invent measurement precision", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { d: 2, b: 1 } }),
    '{"a":{"b":1,"d":2},"z":1}',
  );
  assert.equal(
    snapSignature("/api/v1/accounts", "a=1&b=2", null, "key"),
    snapSignature("/api/v1/accounts", "a=1&b=2", undefined, "key"),
  );
  const activity = snapActivity({
    id: "one",
    type: "BUY",
    trade_date: "2026-01-10",
    price: 10,
    units: 1,
    currency: { code: "CAD" },
    symbol: { id: "abc", symbol: "ABC", type: { code: "cs" } },
  });
  assert.equal(activity?.timePrecision, "day");
  assert.equal(activity?.positionBefore, undefined);
  assert.throws(
    () =>
      snapActivity({
        id: "one",
        type: "BUY",
        trade_date: "2026-01-10",
        price: 10,
        units: 1,
        symbol: { id: "abc", symbol: "ABC" },
      }),
    /UNRESOLVED/,
  );
});
test("OANDA fills use explicit opened/reduced trade details, not a synthetic flat history", () => {
  const entry = oandaFill(
    {
      id: "1",
      type: "ORDER_FILL",
      time: "2026-01-10T15:30:00Z",
      units: "10",
      price: "1.1",
      instrument: "EUR_USD",
      tradeOpened: { units: "10" },
      pl: "0",
    },
    "EUR",
  )!;
  assert.equal(entry.positionBefore, undefined);
  assert.equal(entry.openedQuantity, 10);
  assert.equal(normalizeExecution(entry, context).events[0].kind, "entry");
  const exit = oandaFill(
    {
      id: "2",
      type: "ORDER_FILL",
      time: "2026-01-10T15:31:00Z",
      units: "-4",
      price: "1.2",
      instrument: "EUR_USD",
      tradeReduced: { units: "4" },
      pl: "3",
    },
    "EUR",
  )!;
  assert.equal(exit.positionBefore, undefined);
  assert.equal(exit.closedQuantity, 4);
  assert.equal(exit.pnl, 3);
  assert.equal(normalizeExecution(exit, context).events[0].kind, "exit");
  assert.equal(oandaFill({ type: "DAILY_FINANCING" }, "EUR"), null);
});
test("access matrix never advertises unlicensed relay routes as implemented connections", () => {
  const disabled = routeAvailability({});
  assert.ok(disabled.every((r) => !r.available));
  const ready = routeAvailability({
    BROKER_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    PROJECTX_ENABLED: "true",
    OANDA_ENABLED: "true",
  });
  assert.ok(ready.find((r) => r.id === "projectx")?.available);
  assert.ok(!ready.find((r) => r.id === "rithmic")?.available);
});
test("SnapTrade option identity retains exact expiry and explicitly supplied mini-contract multiplier", () => {
  const activity = {
    id: "option-fill",
    type: "BUY",
    trade_date: "2026-10-13",
    price: 2,
    units: 1,
    currency: { code: "USD" },
    option_symbol: {
      id: "option-id",
      ticker: "AAPL  261218C00240000",
      expiration_date: "2026-12-18T00:00:00.000Z",
      is_mini_option: true,
    },
  };
  const record = snapActivity(activity)!;
  assert.equal(record.instrument.multiplier, 10);
  assert.equal(record.instrument.expiry, "2026-12-18");
  assert.equal(record.instrument.providerSymbol, "O:AAPL261218C00240000");
  assert.ok(
    eventSchema.safeParse(normalizeExecution(record, context).events[0])
      .success,
  );
  assert.throws(
    () =>
      snapActivity({
        ...activity,
        option_symbol: { ...activity.option_symbol, is_mini_option: undefined },
      }),
    /OPTION_CONTRACT_MULTIPLIER_REQUIRED/,
  );
});
