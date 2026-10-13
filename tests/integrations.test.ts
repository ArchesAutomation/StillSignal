import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTrades, inspectCsv } from "../src/lib/csv";
import {
  alertEvents,
  dailyTradingViewSession,
  tradingViewMessage,
} from "../src/lib/tradingview";
import { sessionSchema } from "../src/lib/validation";
test("CSV native trade exports preserve timezones, mark backtests, and deduplicate executions", () => {
  const csv =
    "Trade #,Type,Signal,Date/Time,Price USD,Position size (qty),Net P&L USD,Net P&L %\n1,Entry long,Long,2026-01-15 08:30:00,5000,1,25,0.5\n1,Exit long,Exit,2026-01-15 09:00:00,5025,1,25,0.5\n1,Exit long,Exit,2026-01-15 09:00:00,5025,1,25,0.5\n";
  assert.equal(
    inspectCsv(csv).format,
    "TradingView Strategy Report — List of Trades",
  );
  assert.throws(
    () => parseTrades(csv, { timezone: "America/New_York" }),
    /instrument/,
  );
  const rows = parseTrades(csv, { symbol: "ES", timezone: "America/New_York" });
  assert.equal(rows.length, 2);
  assert.equal(new Date(rows[0].t).toISOString(), "2026-01-15T13:30:00.000Z");
  assert.equal(rows[0].pnl, undefined);
  assert.equal(rows[1].pnl, 25);
  assert.equal(rows[1].provenance, "backtest");
});
test("CSV rejects ambiguous clocks, malformed dates, unsupported money, and empty templates", () => {
  const header = "timestamp,symbol,kind,side,price,quantity,pnl,execution_id\n";
  assert.throws(() => parseTrades(header), /no trade rows/);
  assert.throws(
    () => parseTrades(header + "2026-02-30T12:00:00Z,ES,entry,long,10,1,,a"),
    /timestamp/,
  );
  assert.throws(
    () =>
      parseTrades(header + "2026-11-01 01:30:00,ES,entry,long,10,1,,a", {
        timezone: "America/New_York",
      }),
    /unambiguous/,
  );
  assert.throws(
    () =>
      parseTrades(header + "2026-03-08 02:30:00,ES,entry,long,10,1,,a", {
        timezone: "America/New_York",
      }),
    /unambiguous/,
  );
  assert.throws(
    () =>
      parseTrades(
        header.replace("pnl,", "pnl %,") +
          "2026-01-15T12:00:00Z,ES,exit,long,10,1,0.5,a",
        {
          mapping: {
            timestamp: "timestamp",
            symbol: "symbol",
            kind: "kind",
            side: "side",
            price: "price",
            quantity: "quantity",
            pnl: "pnl %",
            execution_id: "execution_id",
          },
        },
      ),
    /percentage/,
  );
});
test("TradingView templates use real supported placeholders and strategy fills handle partial exits and reversals", () => {
  const token = "a".repeat(64),
    message = JSON.parse(tradingViewMessage(token, "strategy", "key"));
  assert.equal(message.strategy.timestamp, "{{timenow}}");
  assert.equal(
    message.strategy.previous_position,
    "{{strategy.prev_market_position}}",
  );
  const strategy = {
    id: "fill",
    timestamp: "2026-01-15T12:00:00Z",
    symbol: "ES",
    action: "sell",
    price: "10",
    quantity: "5",
    previous_position: "long",
    previous_size: "2",
    position: "short",
    size: "3",
  };
  const events = alertEvents({ token, strategy });
  assert.deepEqual(
    events.map((e) => [e.kind, e.side, e.quantity]),
    [
      ["exit", "long", 2],
      ["entry", "short", 3],
    ],
  );
  assert.deepEqual(
    alertEvents({
      token,
      strategy: { ...strategy, quantity: "0.5", position: "long", size: "1.5" },
    }).map((e) => [e.kind, e.side, e.quantity]),
    [["exit", "long", 0.5]],
  );
  assert.throws(
    () => alertEvents({ token, strategy: { ...strategy, action: "buy" } }),
    /INVALID_POSITION/,
  );
});
test("TradingView daily journals are tenant-scoped and use calendar days across DST", async () => {
  const t = Date.parse("2026-11-01T18:00:00Z"),
    a = await dailyTradingViewSession(
      "11111111-1111-4111-8111-111111111111",
      t,
      "America/New_York",
    ),
    b = await dailyTradingViewSession(
      "22222222-2222-4222-8222-222222222222",
      t,
      "America/New_York",
    );
  assert.notEqual(a.id, b.id);
  assert.equal(a.endedAt! - a.startedAt + 1, 25 * 3600000);
  assert.equal(sessionSchema.safeParse(a).success, true);
  assert.equal(a.source, "tradingview");
  assert.deepEqual(a.events, []);
});
