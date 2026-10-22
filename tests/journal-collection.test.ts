import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { dailyJournalSession, collectedNotes, journalPlacement, journalSources } from "../src/lib/journal-collection";
import { destination, noteTime, sessionTrades, validateDestination } from "../src/lib/journal-routing";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import { sessionSchema } from "../src/lib/validation";
import type { JournalEntry, Session } from "../src/lib/model";
import CollectedNotes from "../src/components/concept/collected-notes";
import ReflectionEditor from "../src/components/reflection-editor";
import { usePulse } from "../src/components/use-pulse";
import { saveSession, listSessions, appendSamples } from "../src/lib/storage";

const fixture = reviewFixtures();
const session = fixture.session;
const trades = sessionTrades(session);
const note = (id: string, patch: Partial<JournalEntry> = {}): JournalEntry => ({
  id, t: session.startedAt + 1000, eventTime: null, label: "Unlabelled", text: id, ...patch,
});
const allSources = [
  note("writing", { section: "day-review", origin: "free-writing" }),
  note("prompt", { section: "before", tradeId: trades[0].id, prompt: { id: "phase", question: "Why wait?" } }),
  note("voice", { source: "voice", section: "entry", tradeId: trades[0].id }),
  note("timeline", { origin: "timeline", section: "exit", tradeId: trades[0].id }),
  note("stillness", { section: "stillness" }),
  note("support", { section: "post-session" }),
  note("screenshot", { section: "after", tradeId: trades[0].id, screenshot: { path: `${session.owner}/${session.id}/11111111-1111-4111-8111-111111111111.png`, name: "chart.png" } }),
  note("unknown", { context: { eventId: trades[0].entryEventId } }),
];

test("all sources, including legacy Stillness, collect once; revisions replace originals and deleted notes stay absent", () => {
  const day = { ...session, journal: [...allSources, { ...allSources[0], text: "Updated", updatedAt: Date.now() }, note("deleted", { deletedAt: Date.now() })] };
  const notes = collectedNotes(day);
  assert.equal(notes.length, 8);
  assert.equal(notes.find(n => n.id === "writing")!.text, "Updated");
  assert.deepEqual(journalSources(allSources[4]), ["Stillness"]);
  assert.deepEqual(journalSources({ ...allSources[4], section: "after", origin: "stillness", source: "voice" }), ["Stillness", "Voice reflection"]);
  assert.deepEqual(journalSources(allSources[6]), ["Screenshot"]);
});

test("trade and stage filters intersect without inventing a destination for unknown notes", () => {
  const day = { ...session, journal: allSources };
  assert.deepEqual(collectedNotes(day, trades[0].id, "before").map(n => n.id), ["prompt"]);
  assert.equal(collectedNotes(day, "", "post-session")[0].id, "support");
  assert.deepEqual(collectedNotes(day, "", "unsorted").map(n => n.id).sort(), ["stillness", "unknown"]);
  assert.equal(destination(allSources[7], day), "Unsorted");
  assert.equal(journalPlacement(allSources[7], day).trade, undefined, "nearest eventId is not an authoritative trade assignment");
  assert.ok(journalPlacement(note("orphan", { section: "before", tradeId: "removed" }), day).unsorted);
  assert.equal(destination(allSources[1], day), "Trade 1 · Before");
});

test("one day combines recordings with stable trade numbering and excludes other days and owners", () => {
  const second: Session = { ...session, id: "second", startedAt: session.startedAt + 3600000, journal: [note("second-note")], events: session.events.map(e => ({ ...e, id: "second-" + e.id, t: e.t + 3600000 })) };
  const otherDay = { ...second, id: "yesterday", startedAt: session.startedAt - 86400000, journal: [note("wrong-day")] };
  const foreign = { ...second, owner: "someone-else", journal: [note("foreign")] };
  const original = { ...session, journal: allSources };
  const day = dailyJournalSession(original, [original, second, otherDay, foreign]);
  assert.equal(collectedNotes(day).length, 9);
  assert.equal(sessionTrades(day).length, trades.length * 2);
  assert.deepEqual(sessionTrades(dailyJournalSession(second, [original])).map(t => t.id), sessionTrades(day).map(t => t.id));
  assert.equal(session.journal.some(n => n.id === "second-note"), false, "aggregation does not mutate stored recordings");
});

test("multi-trade prompts and captures require a chosen trade; time, source and context survive validation", () => {
  const doubled = dailyJournalSession(session, [{ ...session, id: "second", events: session.events.map(e => ({ ...e, id: "b-" + e.id, t: e.t + 3600000 })) }]);
  assert.throws(() => validateDestination(note("prompt", { prompt: { id: "p", question: "Notice?" } }), doubled), /Choose Trade/);
  assert.throws(() => validateDestination(note("voice", { source: "voice" }), doubled), /Choose Trade/);
  assert.throws(() => validateDestination(note("before", { section: "before" }), session), /Choose the trade/);
  const captured = note("context", { eventTime: session.startedAt + 1000, section: "before", tradeId: trades[0].id, origin: "stillness", source: "voice", context: { bpm: 86, baseline: 70 }, captureScope: { windowSeconds: 60 } });
  validateDestination(captured, doubled);
  const parsed = sessionSchema.parse({ ...session, journal: [captured] }).journal[0];
  assert.deepEqual(parsed, captured);
  assert.equal(noteTime(parsed), captured.eventTime);
});

function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const root = createRoot(document.getElementById("root")!);
  return { root, async close() {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); }
  } };
}
async function select(label: string, value: string) {
  const element = document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  assert.ok(element, label);
  await act(async () => { element.value = value; element.dispatchEvent(new window.Event("change", { bubbles: true })); });
}

test("collected-note controls filter the rendered list and expose manual assignment without a separate earlier-notes list", async () => {
  const ui = setup(); let edited: JournalEntry | undefined;
  try {
    await act(async () => ui.root.render(createElement(CollectedNotes, { session: { ...session, journal: allSources.filter(n => !n.screenshot) }, samples: [], sampleNoteIds: new Set<string>(), onEdit: n => { edited = n; } })));
    await select("Filter journal stage", "before");
    assert.equal(document.querySelectorAll("article").length, 1);
    assert.match(document.body.textContent!, /Trade 1 · Before/);
    await select("Filter journal stage", "unsorted");
    assert.equal(document.querySelectorAll("article").length, 2);
    assert.doesNotMatch(document.body.textContent!, /Earlier notes/);
    await act(async () => (document.querySelector("article button") as HTMLButtonElement).click());
    assert.ok(edited && ["stillness", "unknown"].includes(edited.id));
  } finally { await ui.close(); }
});

test("assigning a legacy Stillness reflection edits the original and preserves its source, time, screenshot and HR", async () => {
  const ui = setup(); let saved: JournalEntry | undefined;
  const original = note("old-stillness", { section: "stillness", source: "voice", eventTime: session.startedAt + 5123, context: { bpm: 84, baseline: 70 }, screenshot: allSources[6].screenshot });
  try {
    await act(async () => ui.root.render(createElement(ReflectionEditor, { draft: { t: original.t, entry: original }, session, owner: session.owner, question: "Assign", prepareScreenshot: async () => session.id, onSave: async n => { saved = n; }, onDone: () => {} })));
    await select("Journal section", "before"); await select("Journal trade", trades[0].id);
    await act(async () => document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(saved);
    assert.equal(saved.id, original.id); assert.equal(saved.t, original.t);
    assert.equal(saved.eventTime, original.eventTime); assert.deepEqual(saved.context, original.context);
    assert.equal(saved.source, "voice"); assert.equal(saved.origin, "stillness");
    assert.deepEqual(saved.screenshot, original.screenshot);
    assert.equal(saved.section, "before"); assert.equal(saved.tradeId, trades[0].id);
  } finally { await ui.close(); }
});

test("saving a note about another recording's trade retains the correct day and persists source and HR", async () => {
  const ui = setup(); let pulse!: ReturnType<typeof usePulse>;
  const current = { ...session, id: crypto.randomUUID(), journal: [] };
  const second = { ...session, id: crypto.randomUUID(), startedAt: session.startedAt + 3600000, journal: [], events: session.events.map(e => ({ ...e, id: "cross-" + e.id, t: e.t + 3600000 })) };
  function Harness() { pulse = usePulse({ id: session.owner }); return null; }
  try {
    await saveSession(current); await saveSession(second); await appendSamples(current.id, fixture.samples, current.owner, false);
    await act(async () => ui.root.render(createElement(Harness)));
    await act(async () => { await pulse.refreshHistory(); await pulse.openSession(current); });
    const capture = note("persisted", { eventTime: fixture.samples[60].t, tradeId: sessionTrades(second)[0].id, section: "before", origin: "stillness", source: "typed" });
    await act(async () => pulse.addNote(capture));
    const stored = (await listSessions(current.owner)).find(s => s.id === current.id);
    const saved = stored!.journal.find(n => n.id === capture.id)!;
    assert.equal(saved.tradeId, capture.tradeId); assert.equal(saved.origin, "stillness");
    assert.equal(saved.context!.bpm, fixture.samples[60].bpm);
    assert.equal((await listSessions(second.owner)).find(s => s.id === second.id)!.journal.length, 0);
  } finally { await ui.close(); }
});
