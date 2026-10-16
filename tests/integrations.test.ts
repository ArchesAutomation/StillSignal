import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTrades, inspectCsv } from "../src/lib/csv";
import {
  alertEvents,
  dailyTradingViewSession,
  tradingViewMessage,
} from "../src/lib/tradingview";
import { sessionSchema } from "../src/lib/validation";
test("TradingView Date and time strategy exports keep entry/exit directions and monetary P&L", () => {
  const csv =
    "Trade #,Type,Signal,Date and time,Price USD,Position size (qty),Net P&L USD,Net P&L %\n1,Exit short,Close,2026-01-15 09:00:00,4975,2,50,0.5\n1,Entry short,Short,2026-01-15 08:30:00,5000,2,50,0.5\n";
  assert.equal(inspectCsv(csv).backtest, true);
  const events = parseTrades(csv, { symbol: "ES", timezone: "America/New_York" });
  assert.deepEqual(events.map((e) => [e.kind, e.side, e.pnl]), [
    ["entry", "short", undefined],
    ["exit", "short", 50],
  ]);
  assert.equal(events[0].t, Date.parse("2026-01-15T13:30:00Z"));
  assert.ok(events.every((e) => e.provenance === "backtest"));
});
test("TradingView order history uses execution time and fill price, skipping cancelled orders", () => {
  const csv =
    "Symbol,Side,Type,Qty,Price,Avg Fill Price,Status,Placing Time,Closing Time,Order ID\nCME_MINI:ES1!,Sell,Limit,1,5025,5026,Filled,2026-01-15 08:59:00,2026-01-15 09:00:00,102\nCME_MINI:ES1!,Buy,Limit,1,5000,5001,Filled,2026-01-15 08:29:00,2026-01-15 08:30:00,101\nCME_MINI:ES1!,Buy,Limit,1,4990,,Cancelled,2026-01-15 08:20:00,,100\n";
  const inspection = inspectCsv(csv);
  assert.equal(inspection.fills, true);
  assert.equal(inspection.backtest, false);
  assert.equal(inspection.mapping.timestamp, "Closing Time");
  assert.equal(inspection.mapping.price, "Avg Fill Price");
  assert.throws(() => parseTrades(csv), /starts with a flat position/);
  const options = { timezone: "America/New_York", fillsStartFlat: true };
  const events = parseTrades(csv, options);
  assert.deepEqual(events.map((e) => [e.kind, e.side, e.price]), [
    ["entry", "long", 5001],
    ["exit", "long", 5026],
  ]);
  assert.equal(events[0].t, Date.parse("2026-01-15T13:30:00Z"));
  assert.ok(events.every((e) => e.provenance === "execution"));
  assert.deepEqual(parseTrades(csv, options), events);
});
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
