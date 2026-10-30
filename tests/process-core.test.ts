import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createRecord, latest, recordSchema } from "../src/lib/process/model";
import { validateAppend, withRefs } from "../src/lib/process/engine";
import { readProcess, saveProcess } from "../src/lib/process/storage";
const day = () =>
  createRecord("day", {
    date: "2026-10-29",
    timezone: "America/Denver",
    status: "preparing",
    instrument: "ES",
    account: "",
    timeframes: ["15M", "1H", "4H"],
    sessionIds: [],
    goal: "",
  });
test("append-only process revisions survive stale tabs, retries and separate owners", async () => {
  const a = "process-alice",
    b = "process-bob",
    d = day(),
    updated = withRefs(
      createRecord("day", { ...d.body, status: "no-trade" }, d),
    );
  await saveProcess(a, [d]);
  await saveProcess(a, [d]);
  await saveProcess(a, [updated]);
  assert.equal((await readProcess(a)).length, 2);
  assert.equal((await readProcess(b)).length, 0);
  await assert.rejects(
    saveProcess(a, [
      withRefs(createRecord("day", { ...d.body, status: "complete" }, d)),
    ]),
    /newer revision/,
  );
  assert.equal(latest(await readProcess(a), "day")[0].body.status, "no-trade");
  assert.equal(latest(await readProcess(a), "day", d.createdAt - 1).length, 0);
  assert.throws(() =>
    recordSchema.parse({ ...d, body: { ...d.body, date: "2026-02-30" } }),
  );
  assert.throws(
    () =>
      validateAppend(
        [d],
        [createRecord("day", { ...d.body, timezone: "UTC" }, d)],
        [],
      ),
    /immutable/,
  );
});
test("Postgres enforces process isolation, immutable writes, revision lineage, references and retry identity", async () => {
  const db = new PGlite(),
    alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`,
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261013082052_initial_trade_pulse_tenants.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261029081745_trading_command_center.sql",
        "utf8",
      ),
    );
    const d = day();
    await db.exec("set role service_role");
    await db.query("select pulse_process_append($1,$2)", [alice, [d]]);
    await db.query("select pulse_process_append($1,$2)", [alice, [d]]);
    await assert.rejects(
      db.query("select pulse_process_append($1,$2)", [bob, [d]]),
      /idempotency conflict/,
    );
    await assert.rejects(
      db.query("update trading_days set revision=2"),
      /permission denied/,
    );
    const next = withRefs(
      createRecord("day", { ...d.body, status: "no-trade" }, d),
    );
    await db.query("select pulse_process_append($1,$2)", [alice, [next]]);
    await assert.rejects(
      db.query("select pulse_process_append($1,$2)", [
        alice,
        [withRefs(createRecord("day", { ...d.body, status: "complete" }, d))],
      ]),
      /revision conflict/,
    );
    const invalid = createRecord("checkin", {
      dayId: d.id,
      observedAt: Date.now(),
      answers: [],
      physical: "",
      circumstances: "",
      reflection: "",
    });
    await assert.rejects(
      db.query("select pulse_process_append($1,$2)", [
        bob,
        [withRefs(invalid)],
      ]),
      /reference unavailable/,
    );
    await db.exec(
      `reset role; set role authenticated; set request.jwt.claim.sub='${bob}'`,
    );
    assert.equal((await db.query("select * from trading_days")).rows.length, 0);
    await assert.rejects(
      db.query("select pulse_process_append($1,$2)", [bob, [day()]]),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "insert into trading_days(id,user_id,root_id,revision,data) values($1,$2,$1,1,$3)",
        [d.id, bob, d],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from trading_days"),
      /permission denied/,
    );
    await db.exec(`set request.jwt.claim.sub='${alice}'`);
    assert.equal((await db.query("select * from trading_days")).rows.length, 2);
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select * from trading_days"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
