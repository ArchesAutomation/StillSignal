import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session, TradeEvent } from "../src/lib/model";
import { groupSessionDays } from "../src/lib/session-days";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const event = (id: string, t: number, kind: TradeEvent["kind"], provenance?: TradeEvent["provenance"]): TradeEvent => ({
  id, t, kind, provenance, source: "csv", symbol: "AAPL", side: "long", quantity: 1, price: 100,
});
const session = (id: string, startedAt: number, overrides: Partial<Session> = {}): Session => ({
  id, startedAt, owner: "owner", name: id, source: "journal", sampleCount: 0, events: [], journal: [], ...overrides,
});

test("day cards group recordings and show live reflection and executed-order counts", () => {
  const morning = session("morning", at(20, 9), {
    sampleCount: 100,
    journal: [
      { id: "a", t: at(20, 9, 15), label: "FOMO", text: "Wanted to chase" },
      { id: "b", t: at(20, 9, 20), label: "Confidence", text: "Followed the plan" },
      { id: "b", t: at(20, 9, 20), label: "Frustrated", text: "Corrected label", updatedAt: at(20, 10) },
      { id: "removed", t: at(20, 9, 25), label: "FOMO", text: "Deleted", deletedAt: at(20, 10) },
    ],
    events: [event("entry", at(20, 9, 30), "entry"), event("exit", at(20, 9, 45), "exit"), event("alert", at(20, 9, 50), "entry", "alert")],
  });
  const afternoon = session("afternoon", at(20, 14), {
    sampleCount: 75,
    journal: [{ id: "c", t: at(20, 14, 10), label: "FOMO", text: "Paused before entry" }],
    events: [event("fill", at(20, 14, 20), "fill")],
  });
  const previous = session("previous", at(19, 13), {
    journal: [{ id: "d", t: at(19, 13, 10), label: "Calm", text: "Waited" }],
  });
  const days = groupSessionDays([morning, previous, afternoon]);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0].sessions.map(({ id }) => id), ["afternoon", "morning"]);
  assert.equal(days[0].entries.length, 3);
  assert.deepEqual(days[0].labels, [
    { name: "FOMO", count: 2 },
    { name: "Frustrated", count: 1 },
  ]);
  assert.equal(days[0].sampleCount, 175);
  assert.equal(days[0].executedOrders, 3);
  assert.equal(days[0].closedTrades, 1);
  assert.deepEqual(days[1].labels, [{ name: "Calm", count: 1 }]);
});
