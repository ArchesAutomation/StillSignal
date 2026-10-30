import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
test("process sync verifies the expected account for every request, including account switches in flight", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, locks: undefined },
    configurable: true,
  });
  const { authClient } = await import("../src/lib/cloud");
  const client = authClient()!,
    alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  let active = alice,
    requests = 0;
  client.auth.getSession = async () => ({
    data: {
      session: {
        user: { id: active },
        access_token: "test-" + active,
      } as never,
    },
    error: null,
  });
  globalThis.fetch = async () => {
    requests++;
    active = bob;
    return Response.json({ ok: true });
  };
  const { processApi, saveProcess, syncProcess, readProcess } = await import(
    "../src/lib/process/storage"
  );
  const { createRecord } = await import("../src/lib/process/model");
  await assert.rejects(
    processApi({ action: "list", kind: "day" }, bob),
    /identity changed/,
  );
  assert.equal(requests, 0);
  const d = createRecord("day", {
    date: "2026-10-29",
    timezone: "UTC",
    status: "preparing",
    instrument: "",
    account: "",
    timeframes: [],
    sessionIds: [],
    goal: "",
  });
  await saveProcess(alice, [d]);
  await assert.rejects(syncProcess(alice), /identity changed/);
  assert.equal(
    requests,
    1,
    "Only the request with the original account token may be sent",
  );
  assert.equal((await readProcess(alice)).length, 1);
  assert.equal((await readProcess(bob)).length, 0);
  client.auth.stopAutoRefresh();
});
