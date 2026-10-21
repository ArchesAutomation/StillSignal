import assert from "node:assert/strict";
import test from "node:test";
import { isOct20Demo, oct20DemoCandles, oct20DemoSessionId } from "../src/lib/demo-market";
import type { Session } from "../src/lib/model";

const start = Date.parse("2026-10-20T09:30:00-04:00");
const session: Session = {
  id: oct20DemoSessionId,
  owner: "4d5ef3f4-c09e-499a-958e-975b1b1d9861",
  name: "DEMO · Oct 20 NY session · Simulated data",
  startedAt: start,
  endedAt: start + 390 * 60000,
  source: "journal",
  sampleCount: 23400,
  journal: [],
  events: [
    { id: "entry", t: start + 12 * 60000, symbol: "AAPL", kind: "entry", side: "long", price: 230.5, quantity: 100, source: "manual" },
    { id: "exit", t: start + 36 * 60000, symbol: "AAPL", kind: "exit", side: "long", price: 232.9, quantity: 100, source: "manual", pnl: 240 },
  ],
};

test("October 20 demo candles are deterministic and meet the recorded fictional fills", () => {
  assert.equal(isOct20Demo(session), true);
  const bars = oct20DemoCandles(session, "AAPL");
  assert.equal(bars.length, 390);
  assert.deepEqual(bars, oct20DemoCandles(session, "AAPL"));
  assert.equal(bars[11].close, 230.5);
  assert.equal(bars[35].close, 232.9);
  for (const bar of bars) {
    assert.equal(bar.end - bar.t, 60000);
    assert.ok(bar.high >= Math.max(bar.open, bar.close));
    assert.ok(bar.low <= Math.min(bar.open, bar.close));
    assert.equal(bar.complete, true);
  }
});

test("fictional prices cannot appear in another account or recording", () => {
  assert.deepEqual(oct20DemoCandles({ ...session, owner: "someone-else" }, "AAPL"), []);
  assert.deepEqual(oct20DemoCandles({ ...session, id: "another-session" }, "AAPL"), []);
  assert.deepEqual(oct20DemoCandles(session, "NVDA"), []);
});
