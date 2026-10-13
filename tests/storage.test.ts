import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendSamples,
  pending,
  getSamples,
  removeSession,
  saveSession,
  listSessions,
  acknowledge,
} from "../src/lib/storage";
test("raw samples and retry outbox are durable, batched, isolated and deletable", async () => {
  const sessionId = "33333333-3333-4333-8333-333333333333",
    owner = "11111111-1111-4111-8111-111111111111";
  const start = Math.floor((Date.now() - 120000) / 30000) * 30000;
  await saveSession({
    id: sessionId,
    owner,
    startedAt: start,
    name: "test",
    source: "whoop",
    events: [],
    journal: [],
    sampleCount: 30,
  });
  for (let i = 0; i < 30; i++)
    await appendSamples(
      sessionId,
      [{ t: start + i * 1000, bpm: 70 + i }],
      owner,
    );
  assert.equal((await getSamples(sessionId, owner)).length, 30);
  const queue = await pending(owner);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].samples.length, 30);
  assert.equal((await pending("other")).length, 0);
  assert.equal((await listSessions("other")).length, 0);
  await assert.rejects(getSamples(sessionId, "other"), /identity mismatch/);
  await assert.rejects(removeSession(sessionId, "other"), /identity mismatch/);
  await assert.rejects(
    appendSamples(sessionId, [{ t: start + 32000, bpm: 80 }], "other"),
    /identity mismatch/,
  );
  await acknowledge(queue[0].id);
  assert.equal((await pending(owner)).length, 0);
  assert.equal((await getSamples(sessionId, owner)).length, 30);
  await removeSession(sessionId, owner);
  assert.equal((await getSamples(sessionId, owner)).length, 0);
  assert.equal((await listSessions(owner)).length, 0);
});
