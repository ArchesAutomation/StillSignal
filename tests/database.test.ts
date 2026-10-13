import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  sid = "33333333-3333-4333-8333-333333333333",
  bid = "44444444-4444-4444-8444-444444444444";
test("Postgres isolation, bounded ingestion, retry safety and deletion", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`,
  );
  await db.exec(readFileSync("supabase/migrations/20261013082052_initial_trade_pulse_tenants.sql", "utf8"));
  const session = {
    id: sid,
    owner: alice,
    startedAt: 1000,
    source: "whoop",
    sampleCount: 1,
    name: "Test",
    events: [],
    journal: [],
  };
  await db.query("select pulse_save_session($1,$2,$3)", [alice, sid, session]);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${bob}'`);
  assert.equal(
    (await db.query("select * from pulse_sessions")).rows.length,
    0,
    "Bob must not read Alice",
  );
  await assert.rejects(
    db.query("select pulse_save_session($1,$2,$3)", [
      bob,
      sid,
      { ...session, owner: bob },
    ]),
    /permission denied/,
  );
  await db.exec(`set request.jwt.claim.sub='${alice}'`);
  assert.equal((await db.query("select * from pulse_sessions")).rows.length, 1);
  await assert.rejects(
    db.query("delete from pulse_sessions"),
    /permission denied/,
  );
  await db.exec("reset role");
  await assert.rejects(
    db.query("select pulse_save_session($1,$2,$3)", [
      bob,
      sid,
      { ...session, owner: bob },
    ]),
    /ownership/,
  );
  const samples = [{ t: 1000, bpm: 75 }];
  await db.query("select pulse_ingest_batch($1,$2,$3,$4)", [
    alice,
    sid,
    bid,
    samples,
  ]);
  await db.query("select pulse_ingest_batch($1,$2,$3,$4)", [
    alice,
    sid,
    bid,
    samples,
  ]);
  assert.equal(
    (await db.query("select * from pulse_sample_chunks")).rows.length,
    1,
    "Retries must not duplicate",
  );
  await assert.rejects(
    db.query("select pulse_ingest_batch($1,$2,$3,$4)", [
      alice,
      sid,
      bid,
      [{ t: 1000, bpm: 90 }],
    ]),
    /idempotency conflict/,
  );
  await assert.rejects(
    db.query("select pulse_ingest_batch($1,$2,$3,$4)", [
      bob,
      sid,
      bid,
      samples,
    ]),
    /session not found/,
  );
  await assert.rejects(
    db.query("select pulse_ingest_batch($1,$2,$3,$4)", [
      alice,
      sid,
      "55555555-5555-4555-8555-555555555555",
      Array.from({ length: 121 }, () => samples[0]),
    ]),
    /invalid batch/,
  );
  const r = await db.query<{ allowed: boolean }>(
    "select pulse_rate_limit('test',3) as allowed from generate_series(1,5)",
  );
  assert.deepEqual(
    r.rows.map((x) => x.allowed),
    [true, true, true, false, false],
  );
  await db.query("select pulse_save_session($1,$2,$3)", [
    alice,
    sid,
    {
      ...session,
      journal: [{ id: "n1", text: "first", label: "Calm", t: 1000 }],
    },
  ]);
  await db.query("select pulse_save_session($1,$2,$3)", [
    alice,
    sid,
    {
      ...session,
      journal: [{ id: "n2", text: "second", label: "Calm", t: 1000 }],
    },
  ]);
  const merged = await db.query<{ data: { journal: unknown[] } }>(
    "select data from pulse_sessions",
  );
  assert.equal(
    merged.rows[0].data.journal.length,
    2,
    "Concurrent append-only notes survive stale metadata",
  );
  await db.query("select pulse_delete_session($1,$2)", [alice, sid]);
  assert.equal(
    (await db.query("select * from pulse_sample_chunks")).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select pulse_save_session($1,$2,$3)", [alice, sid, session]),
    /session deleted/,
  );
  await db.close();
});
