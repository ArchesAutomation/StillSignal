import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import { journalPhaseLink, journalTradeGroups, tradePhases } from "../src/lib/journal-phases";
import { sessionTrades } from "../src/lib/journal-routing";
import type { JournalEntry } from "../src/lib/model";

const { session, samples } = reviewFixtures();
const trades = sessionTrades(session);

test("trade/phase links use their own CSV executions, including Trade 2 Exit", () => {
  for (const trade of trades) {
    assert.equal(journalPhaseLink(session, trade.id, "entry", samples)!.t, trade.entry);
    assert.equal(journalPhaseLink(session, trade.id, "exit", samples)!.t, trade.exit);
    for (const phase of tradePhases) {
      const link = journalPhaseLink(session, trade.id, phase, samples)!;
      assert.ok(link && link.t >= link.start && link.t <= link.end);
      if (phase === "before") assert.equal(link.end, trade.entry);
      if (phase === "management") assert.deepEqual([link.start, link.end], [trade.entry, trade.exit]);
      if (phase === "after") assert.equal(link.start, trade.exit);
    }
  }
  const second = journalPhaseLink(session, trades[1].id, "exit", samples)!;
  assert.notEqual(second.t, trades[0].entry);
  assert.equal(second.point?.t, trades[1].exit);
});

test("missing timestamps and day-only imports cannot fall back to another trade's time or HR", () => {
  assert.equal(journalPhaseLink(session, "missing", "entry", samples), null);
  assert.equal(journalPhaseLink(session, "", "entry", samples), null);
  assert.equal(journalPhaseLink(session, trades[0].id, undefined, samples), null);
  const imprecise = { ...session, events: session.events.map(e => ({ ...e, timePrecision: "day" as const })) };
  for (const phase of tradePhases) assert.equal(journalPhaseLink(imprecise, trades[0].id, phase, samples), null);
  const noHr = journalPhaseLink(session, trades[0].id, "entry", []);
  assert.equal(noHr!.t, trades[0].entry); assert.equal(noHr!.bpm, null); assert.equal(noHr!.point, null);
  const open = { ...session, events: session.events.filter(e => e.id !== trades[1].exitEventId) };
  assert.equal(journalPhaseLink(open, trades[1].id, "exit", samples), null);
  assert.equal(journalPhaseLink(open, trades[1].id, "after", samples), null);
});

test("execution and all reflections share one owned phase; untimed and nearby notes are never inferred", () => {
  const note = (id: string, patch: Partial<JournalEntry> = {}): JournalEntry => ({ id, t: session.startedAt, eventTime: null, label: "Calm", text: id, ...patch });
  const notes = [note("one", { tradeId: trades[0].id, section: "entry" }), note("two", { tradeId: trades[0].id, section: "entry" }),
    note("second", { tradeId: trades[1].id, section: "exit" }), note("day"),
    note("nearby", { eventTime: trades[0].entry }), note("orphan", { tradeId: "gone", section: "entry" })];
  const groups = journalTradeGroups({ ...session, journal: notes });
  assert.equal(groups.trades.length, trades.length);
  const entry = groups.trades[0].phases.find(p => p.phase === "entry")!;
  assert.equal(entry.executions[0].id, trades[0].entryEventId);
  assert.deepEqual(new Set(entry.notes.map(n => n.id)), new Set(["one", "two"]));
  assert.deepEqual(groups.ungrouped.map(n => n.id).sort(), ["day", "nearby", "orphan"]);
  const all = [...groups.ungrouped, ...groups.trades.flatMap(g => g.phases.flatMap(p => p.notes))];
  assert.equal(all.length, notes.length); assert.equal(new Set(all.map(n => n.id)).size, notes.length);
});
