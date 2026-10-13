import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWorkspace, mergeSessions } from "../src/lib/workspace";
test("empty workspace has zero invented samples, events, or journal entries", () => {
  const s = emptyWorkspace("alice");
  assert.equal(s.sampleCount, 0);
  assert.deepEqual(s.events, []);
  assert.deepEqual(s.journal, []);
});
test("account mismatch cannot merge another user’s cached data", () => {
  assert.throws(
    () =>
      mergeSessions(
        { ...emptyWorkspace("alice"), id: "s1" },
        { ...emptyWorkspace("bob"), id: "s1" },
      ),
    /identity mismatch/,
  );
});
test("cloud refresh preserves unsent local notes", () => {
  const base = { ...emptyWorkspace("alice"), id: "s1" };
  const local = {
    ...base,
    journal: [{ id: "note1", t: 1, label: "Calm", text: "Unsent" }],
  };
  assert.equal(mergeSessions(local, base).journal[0].text, "Unsent");
});
