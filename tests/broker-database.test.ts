import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { normalizeExecution } from "../src/lib/brokers/normalize";
import type { RawExecution } from "../src/lib/brokers/model";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  conn = "33333333-3333-4333-8333-333333333333",
  account = "44444444-4444-4444-8444-444444444444";
async function database() {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;",
  );
  await db.query("insert into auth.users values($1),($2)", [alice, bob]);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.query(
    "insert into pulse_broker_connections(id,user_id,provider,status)values($1,$2,'oanda','connected')",
    [conn, alice],
  );
  await db.query(
    "insert into pulse_broker_secrets(connection_id,user_id,ciphertext)values($1,$2,'ciphertext-only')",
    [conn, alice],
  );
  await db.query(
    "insert into pulse_broker_accounts(id,user_id,connection_id,provider_account_id,canonical_key,institution,name,currency,environment,identity_verified)values($1,$2,$3,'native','account-key','OANDA','Test','CAD','paper',true)",
    [account, alice, conn],
  );
  await db.query(
    "insert into pulse_broker_jobs(user_id,account_id)values($1,$2)",
    [alice, account],
  );
  return db;
}
const fill: RawExecution = {
  id: "execution-1",
  t: 1700000000123,
  action: "buy",
  price: 100,
  quantity: 3,
  currency: "CAD",
  fees: 3,
  positionBefore: -2,
  instrument: {
    id: "test-equity",
    symbol: "ABC",
    assetClass: "equity",
    currency: "CAD",
    multiplier: 1,
  },
  raw: { id: "execution-1", units: 3 },
};
const context = {
  userId: alice,
  accountId: account,
  connectionId: conn,
  provider: "oanda",
  receivedAt: 1700000010000,
};
test("manual CSV saves to the existing recorded session without changing cloud identity or HR chunks", async () => {
  const db = await database();
  try {
    const id = "66666666-6666-4666-8666-666666666666";
    const s = { id, owner: alice, name: "Recorded day", source: "journal", startedAt: 2000, endedAt: 4000, sampleCount: 1, events: [], journal: [] };
    await db.query("select pulse_save_session($1,$2,$3)", [alice, id, s]);
    await db.query("select pulse_ingest_batch($1,$2,$3,$4)", [alice, id, "77777777-7777-4777-8777-777777777777", [{t:3000,bpm:80}]]);
    const events = [{ id:"csv-before", t:1000, symbol:"ES", kind:"entry", side:"long", quantity:1, price:5000, source:"csv" },
      { id:"csv-after", t:5000, symbol:"ES", kind:"exit", side:"long", quantity:1, price:5010, source:"csv" }];
    await db.query("select pulse_save_session($1,$2,$3)", [alice, id, {...s,events}]);
    const result = (await db.query<{data:{startedAt:number;endedAt:number;events:unknown[];sampleCount:number}}>("select data from pulse_sessions where id=$1",[id])).rows[0].data;
    assert.equal(result.startedAt, 2000);
    assert.equal(result.endedAt, 4000);
    assert.equal(result.events.length, 2);
    assert.equal(result.sampleCount, 1);
    assert.deepEqual((await db.query<{samples:unknown}>("select samples from pulse_sample_chunks where session_id=$1",[id])).rows[0].samples,[{t:3000,bpm:80}]);
    await assert.rejects(db.query("select pulse_save_session($1,$2,$3)", [bob,id,{...s,owner:bob,events}]),/ownership mismatch/);
  } finally { await db.close(); }
});

test("additive broker migration preserves tenant policies, TradingView constraints, and secret boundaries", async () => {
  const db = await database();
  try {
    await db.exec(
      "set role authenticated;set request.jwt.claim.sub='" + bob + "'",
    );
    assert.equal(
      (await db.query("select * from pulse_broker_connections")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from pulse_broker_accounts")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select * from pulse_broker_secrets"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from pulse_broker_executions"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select pulse_claim_broker_job($1)", [
        "55555555-5555-4555-8555-555555555555",
      ]),
      /permission denied/,
    );
    await db.exec("set request.jwt.claim.sub='" + alice + "'");
    assert.equal(
      (await db.query("select * from pulse_broker_connections")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("update pulse_broker_accounts set user_id=$1", [bob]),
      /permission denied/,
    );
    await db.exec("reset role");
    for (const provider of ["alpaca", "tastytrade"])
      await db.query(
        "insert into pulse_broker_connections(user_id,provider,status)values($1,$2,'pending')",
        [alice, provider],
      );
    await assert.rejects(
      db.query(
        "insert into pulse_broker_connections(user_id,provider,status)values($1,'kraken','pending')",
        [alice],
      ),
      /check constraint/,
    );
    await assert.rejects(
      db.query(
        "insert into pulse_connections(user_id,provider,token_hash,timezone,expires_at)values($1,'oanda','hash','UTC',now()+interval '1 day')",
        [alice],
      ),
      /check constraint/,
    );
    const policies = await db.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      "select relname,relrowsecurity from pg_class where relname like 'pulse_broker_%' and relkind='r'",
    );
    assert.ok(policies.rows.every((r) => r.relrowsecurity));
  } finally {
    await db.close();
  }
});
test("broker page transaction handles retries, amendments, voids, checkpoints, stale notes, and deletion", async () => {
  const db = await database();
  try {
    const claim = async () => {
      await db.exec("update pulse_broker_jobs set run_after=now()");
      const lease = crypto.randomUUID();
      const jobs = await db.query<{ id: string }>(
        "select * from pulse_claim_broker_job($1)",
        [lease],
      );
      assert.equal(jobs.rows.length, 1);
      return { lease, id: jobs.rows[0].id };
    };
    const ingest = async (
      records: ReturnType<typeof normalizeExecution>[],
      cursor: unknown = { since: "1" },
    ) => {
      const job = await claim();
      return db.query(
        "select pulse_ingest_broker_page($1,$2,$3,$4,$5,$6,true)",
        [alice, account, job.id, job.lease, records, cursor],
      );
    };
    const record = normalizeExecution(fill, context);
    await ingest([record]);
    assert.equal(
      (await db.query("select * from pulse_broker_executions")).rows.length,
      1,
    );
    assert.equal((await db.query("select * from pulse_events")).rows.length, 2);
    await ingest([record]);
    assert.equal((await db.query("select * from pulse_events")).rows.length, 2);
    const amended = normalizeExecution(
      { ...fill, price: 101, positionBefore: -3, voided: true },
      { ...context, receivedAt: context.receivedAt + 1000 },
    );
    await ingest([amended], { since: "2" });
    const canonical = (
      await db.query<{ data: typeof record.session }>(
        "select data from pulse_sessions where id=$1",
        [record.session.id],
      )
    ).rows[0].data;
    assert.equal(canonical.events.length, 1);
    assert.equal(canonical.events[0].price, 101);
    assert.equal(canonical.events[0].voided, true);
    assert.equal((await db.query("select * from pulse_events")).rows.length, 1);
    const offline = {
      ...record.session,
      events: record.events,
      journal: [
        {
          id: "offline-note",
          t: fill.t,
          label: "Calm",
          text: "Preserve this",
          updatedAt: fill.t,
        },
      ],
    };
    await db.query("select pulse_save_session($1,$2,$3)", [
      alice,
      record.session.id,
      offline,
    ]);
    const saved = (
      await db.query<{ data: typeof offline }>(
        "select data from pulse_sessions where id=$1",
        [record.session.id],
      )
    ).rows[0].data;
    assert.equal(saved.events.length, 1);
    assert.equal(saved.events[0].voided, true);
    assert.equal(saved.journal[0].text, "Preserve this");
    assert.deepEqual(
      (
        await db.query<{ checkpoint: unknown }>(
          "select checkpoint from pulse_broker_jobs",
        )
      ).rows[0].checkpoint,
      { since: "2" },
    );
    await db.query("select pulse_delete_session($1,$2)", [
      alice,
      record.session.id,
    ]);
    assert.equal(
      (await db.query("select * from pulse_broker_executions")).rows.length,
      0,
      "Deleting a journal removes its raw broker payload",
    );
    await ingest([
      normalizeExecution(
        { ...fill, price: 102 },
        { ...context, receivedAt: context.receivedAt + 2000 },
      ),
    ]);
    assert.equal(
      (
        await db.query("select * from pulse_sessions where id=$1", [
          record.session.id,
        ])
      ).rows.length,
      0,
    );
    const moved = normalizeExecution(
      { ...fill, t: fill.t + 86400000, price: 103 },
      { ...context, receivedAt: context.receivedAt + 3000 },
    );
    await ingest([moved]);
    assert.equal(
      (
        await db.query("select * from pulse_sessions where id=$1", [
          moved.session.id,
        ])
      ).rows.length,
      0,
      "An amended timestamp cannot resurrect an intentionally deleted execution",
    );
  } finally {
    await db.close();
  }
});
test("broker intake rejects cross-account records atomically and revoked or expired leases", async () => {
  const db = await database();
  try {
    const lease = crypto.randomUUID(),
      job = (
        await db.query<{ id: string }>(
          "select * from pulse_claim_broker_job($1)",
          [lease],
        )
      ).rows[0];
    const record = normalizeExecution(fill, context),
      bad = {
        ...record,
        events: record.events.map((e) => ({
          ...e,
          broker: {
            ...e.broker!,
            accountId: "55555555-5555-4555-8555-555555555555",
          },
        })),
      };
    await assert.rejects(
      db.query("select pulse_ingest_broker_page($1,$2,$3,$4,$5,$6,false)", [
        alice,
        account,
        job.id,
        lease,
        [record, bad],
        {},
      ]),
      /invalid broker event/,
    );
    assert.equal((await db.query("select * from pulse_events")).rows.length, 0);
    assert.equal(
      (await db.query("select * from pulse_sessions")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select pulse_ingest_broker_page($1,$2,$3,$4,$5,$6,false)", [
        bob,
        account,
        job.id,
        lease,
        [record],
        {},
      ]),
      /account unavailable/,
    );
    await db.exec(
      "update pulse_broker_jobs set leased_until=now()-interval '1 second'",
    );
    await assert.rejects(
      db.query("select pulse_ingest_broker_page($1,$2,$3,$4,$5,$6,false)", [
        alice,
        account,
        job.id,
        lease,
        [record],
        {},
      ]),
      /lease expired/,
    );
    await db.exec("update pulse_broker_connections set status='revoked'");
    await db.exec("update pulse_broker_jobs set run_after=now()");
    assert.equal(
      (
        await db.query("select * from pulse_claim_broker_job($1)", [
          crypto.randomUUID(),
        ])
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
