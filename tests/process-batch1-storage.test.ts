import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";

const day = () => createRecord("day", {
  date: "2026-11-04", timezone: "UTC", status: "preparing",
  instrument: "ES", account: "", timeframes: [], sessionIds: [], goal: "",
});

test("a rejected append still downloads cloud records, preserves pending work and retries honestly", async () => {
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  const { authClient } = await import("../src/lib/cloud");
  const { saveProcess, readProcess, syncProcess, processApi } = await import("../src/lib/process/storage");
  const { openDB } = await import("idb");
  const owner = crypto.randomUUID(), local = day(), remote = day();
  remote.body.date = "2026-11-03";
  const client = authClient()!;
  client.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "isolated-test" } as never }, error: null });
  const oldFetch = globalThis.fetch;
  let reject = true, lists = 0, appends = 0;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    if (payload.action === "append") {
      appends++;
      return reject
        ? Response.json({ error: "These records need attention.", fields: [{ field: "records.0.body.primary", message: "Too long" }] }, { status: 400 })
        : Response.json({ ok: true });
    }
    lists++;
    return Response.json({ records: payload.kind === "day" ? [remote] : [] });
  };
  try {
    await saveProcess(owner, [local]);
    let syncError = "";
    await assert.rejects(syncProcess(owner), error => {
      syncError = String(error);
      return /These records need attention/.test(syncError);
    });
    assert.ok(lists > 0, "a rejected upload must not block cloud reads");
    assert.match(syncError, /records\.0\.body\.primary: Too long/);
    assert.deepEqual(new Set((await readProcess(owner)).map(r => r.id)), new Set([local.id, remote.id]));
    const db = await openDB("still-signal-process-v1");
    assert.equal((await db.get("records", [owner, local.id])).pending, 1);
    assert.equal((await db.get("records", [owner, remote.id])).pending, 0);
    reject = false;
    assert.equal(await syncProcess(owner), 0);
    assert.equal(appends, 2);
    assert.equal((await readProcess(owner)).length, 2, "retry cannot duplicate a plan");
    const base = day();
    base.body.date = "2026-11-02";
    const localRevision = createRecord("day", { ...base.body, goal: "Offline edit" }, base);
    const remoteRevision = createRecord("day", { ...base.body, goal: "Other device edit" }, base);
    await saveProcess(owner, [base], false);
    await saveProcess(owner, [localRevision]);
    globalThis.fetch = async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      return payload.action === "append"
        ? Response.json({ error: "A newer record exists on another device." }, { status: 409 })
        : Response.json({ records: payload.kind === "day" ? [remoteRevision] : [] });
    };
    await assert.rejects(syncProcess(owner), /newer record exists/);
    assert.ok((await readProcess(owner)).some(r => r.id === remoteRevision.id), "refresh retrieves the conflicting cloud revision");
    assert.equal((await db.get("records", [owner, localRevision.id])).pending, 1, "conflict is not silently acknowledged or erased");
    assert.equal((await db.get("records", [owner, remoteRevision.id])).pending, 0);
    globalThis.fetch = async () => { throw new Error("Connection lost"); };
    await assert.rejects(processApi({ action: "list", kind: "day" }, owner), /Connection lost/);
    assert.equal((await readProcess(owner)).length, 5);
    db.close();
  } finally {
    globalThis.fetch = oldFetch;
    client.auth.stopAutoRefresh();
  }
});

test("a malformed later row cannot partially commit a local batch", async () => {
  const { saveProcess, readProcess } = await import("../src/lib/process/storage");
  const owner = crypto.randomUUID();
  const valid = day();
  const invalid = { ...day(), body: { ...valid.body, date: "not-a-date" } } as ProcessRecord;
  await assert.rejects(saveProcess(owner, [valid, invalid]));
  // Give an accidentally un-aborted IDB transaction time to commit.
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await readProcess(owner), []);
});
