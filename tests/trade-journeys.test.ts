import { test } from "node:test";
import assert from "node:assert/strict";
import type { Sample, Session, TradeEvent } from "../src/lib/model";
import { buildTradeJourneys } from "../src/lib/trade-journeys";

const entry = 1_000_000, exit = entry + 300_000;
const event = (id: string, t: number, kind: TradeEvent["kind"]): TradeEvent => ({
  id, t, kind, symbol: "AAPL", side: "long", quantity: 1, price: kind === "exit" ? 102 : 100, source: "csv",
});
const base: Session = {
  id: "s", owner: "owner", name: "Morning", startedAt: entry - 600_000,
  endedAt: exit + 600_000, source: "journal", sampleCount: 26,
  events: [event("in", entry, "entry"), event("out", exit, "exit")],
  journal: [
    { id: "before", t: entry - 120_000, label: "Confident", text: "Plan ready" },
    { id: "during", t: entry + 120_000, label: "Focused", text: "Stayed patient" },
    { id: "after", t: exit + 120_000, label: "Frustrated", text: "Exit felt early" },
  ],
};
const samples: Sample[] = Array.from({ length: 26 }, (_, i) => {
  const t = entry - 600_000 + i * 60_000;
  return { t, bpm: t < entry ? 70 : t === entry ? 80 : t < exit ? 90 : t === exit ? 100 : 75 };
});

test("a trade card connects recorded HR and the trader's notes at each phase", () => {
  const [journey] = buildTradeJourneys(base, samples);
  assert.equal(journey.symbol, "AAPL");
  assert.deepEqual(journey.stages.map((stage) => stage.key), ["before", "entry", "management", "exit", "after"]);
  assert.deepEqual(journey.stages.map((stage) => stage.bpm), [70, 80, 88, 100, 75]);
  assert.deepEqual(journey.stages.map((stage) => stage.notes.map((note) => note.label)), [
    ["Confident"], [], ["Focused"], [], ["Frustrated"],
  ]);
});

test("unpaired fills remain visible and unavailable HR is never invented", () => {
  const fill = event("fill", entry + 40_000, "fill");
  const journeys = buildTradeJourneys({ ...base, events: [...base.events, fill] }, []);
  assert.equal(journeys.length, 2);
  const standalone = journeys.find((journey) => journey.id === "event-fill");
  assert.ok(standalone);
  assert.deepEqual(standalone.stages.map((stage) => stage.key), ["before", "entry", "after"]);
  assert.ok(standalone.stages.every((stage) => stage.bpm === null));
  const dayOnly = buildTradeJourneys({ ...base, events: [{ ...fill, timePrecision: "day" }] }, samples)[0];
  assert.equal(dayOnly.dayOnly, true);
  assert.ok(dayOnly.stages.every((stage) => stage.bpm === null && stage.notes.length === 0));
});

test("simultaneous trades in different accounts retain their own fills and results", () => {
  const events = [
    { ...event("a-in", entry, "entry"), account: "A" },
    { ...event("b-in", entry, "entry"), account: "B" },
    { ...event("a-out", exit, "exit"), account: "A", pnl: 10 },
    { ...event("b-out", exit, "exit"), account: "B", pnl: 20 },
  ];
  const journeys = buildTradeJourneys({ ...base, events }, samples);
  assert.equal(journeys.length, 2);
  assert.deepEqual(journeys.map((journey) => journey.pnl).sort((a, b) => a! - b!), [10, 20]);
  assert.ok(journeys.every((journey) => !journey.standalone));
});
