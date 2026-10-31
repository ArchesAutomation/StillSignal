import { test } from "node:test";
import assert from "node:assert/strict";
import { applyJournalChange, type JournalChange } from "../src/lib/journal-history";
import { resizeModule } from "../src/lib/module-layout";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import { mergeSessions } from "../src/lib/workspace";

test("undo and redo notes survive sync merging while preserving unrelated entries and recordings", () => {
  const session = reviewFixtures().session;
  const before = { id: "edit", t: session.startedAt, text: "Original words", label: "Calm" };
  const after = { ...before, text: "Edited words", updatedAt: Date.now() };
  const change: JournalChange = { kind: "note", sessionId: session.id, day: "today", id: before.id, before, after };
  const saved = { ...session, journal: [...session.journal, after] };
  const undone = applyJournalChange(saved, change);
  assert.equal(undone.journal.at(-1)?.text, "Original words");
  assert.equal(undone.events, session.events);
  assert.equal(undone.sampleCount, session.sampleCount);
  assert.equal(mergeSessions(saved, undone).journal.find(n => n.id === before.id)?.text, "Original words");
  assert.equal(applyJournalChange(undone, change, true).journal.at(-1)?.text, "Edited words");
  assert.throws(() => applyJournalChange({ ...saved, journal: [{ ...after, text: "Changed on another device" }] }, change), /newer edits/);
  assert.throws(() => applyJournalChange({ ...saved, id: "different" }, change), /original journal/);
});

test("undo creation uses a tombstone and undo deletion restores attachment metadata with a fresh revision", () => {
  const session = reviewFixtures().session;
  const note = { id: "new", t: session.startedAt, text: "My words", label: "Calm", capture: { pressedAt: session.startedAt, confirmedAt: session.startedAt, imagePath: "local-image:test" } };
  const saved = { ...session, journal: [...session.journal, note] };
  const creation: JournalChange = { kind: "note", sessionId: session.id, day: "today", id: note.id, after: note };
  const undone = applyJournalChange(saved, creation);
  assert.ok(undone.journal.at(-1)?.deletedAt);
  assert.ok(mergeSessions(saved, undone).journal.find(n => n.id === note.id)?.deletedAt);
  const restored = applyJournalChange(undone, creation, true);
  assert.equal(restored.journal.at(-1)?.deletedAt, undefined);
  assert.equal(restored.journal.at(-1)?.capture?.imagePath, "local-image:test");
  const deleted = { ...note, deletedAt: Date.now(), updatedAt: Date.now() };
  const deletion: JournalChange = { ...creation, before: note, after: deleted };
  assert.equal(applyJournalChange({ ...saved, journal: [deleted] }, deletion).journal[0].text, "My words");
});

test("journal detail undo restores only touched fields and detects conflicts", () => {
  const session = reviewFixtures().session;
  const before = { updatedAt: 1, dailyWriting: "Before" };
  const after = { ...before, updatedAt: 2, dailyWriting: "After" };
  const change: JournalChange = { kind: "blueprint", sessionId: session.id, day: "today", keys: ["dailyWriting"], before, after };
  const saved = { ...session, blueprint: { ...after, dailyWriting: "After" } };
  const restored = applyJournalChange(saved, change);
  assert.equal(restored.blueprint?.dailyWriting, "Before");
  assert.equal(restored.events, session.events);
  assert.equal(applyJournalChange(restored, change, true).blueprint?.dailyWriting, "After");
  assert.throws(() => applyJournalChange({ ...saved, blueprint: { ...after, dailyWriting: "New remote words" } }, change), /newer edits/);
});

test("card and section resizing snaps to columns and clamps height at both boundaries", () => {
  assert.deepEqual(resizeModule(6, 300, 102, 75, 1200, 24), { width: 7, height: 375 });
  assert.deepEqual(resizeModule(6, 300, -5000, -5000, 1200, 24), { width: 3, height: 120 });
  assert.deepEqual(resizeModule(6, 300, 5000, 5000, 1200, 24), { width: 12, height: 1600 });
});
