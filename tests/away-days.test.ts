import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { awayEntries, foldAwayEvents } from "../src/lib/away-day-state";
import {
  createAwayEvent, keepAwayScreenshot, readAwayEvents, saveAwayEvents, syncAwayEventsWith, type AwayTransport,
} from "../src/lib/away-day-storage";
import { awayActionSchema, awayEventSchema, type AwayEvent, type AwayEventBody } from "../src/lib/process/away-days";
import { readProcess } from "../src/lib/process/storage";
import { listSessions } from "../src/lib/storage";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const noteId = "33333333-3333-4333-8333-333333333333";
const date = "2026-11-16";
const at = (body: AwayEventBody, createdAt: number) => createAwayEvent(body, createdAt);
const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], "chart.png", { type: "image/png" });

test("every device derives the same away day from the same changes", () => {
  const events = [
    at({ type: "day", date, away: true }, 1000),
    at({ type: "reason", date, text: "I wanted room." }, 2000),
    at({ type: "followup", date, noteId, followupDate: "2026-11-17", text: "Still with me." }, 2500),
    at({ type: "note", date, noteId, text: "A pull to check.", images: [] }, 3000),
    at({ type: "reminder", date, noteId, text: "Notice the pull." }, 4000),
    at({ type: "reminder-surfaced", date, noteId, preparation: "2026-11-18" }, 5000),
  ];
  const days = foldAwayEvents(events);
  assert.deepEqual(foldAwayEvents([...events].reverse()), days);
  assert.equal(days[date]?.away, true);
  assert.deepEqual(days[date]?.reason, { text: "I wanted room.", recordedAt: 2000 });
  const [entry] = awayEntries(days);
  assert.deepEqual(entry.note.followups, [{ date: "2026-11-17", text: "Still with me." }], "A follow-up survives device clock differences.");
  assert.deepEqual(entry.note.reminder, { text: "Notice the pull.", preparation: "2026-11-18" });
  const cleared = foldAwayEvents([...events, at({ type: "reminder", date, noteId, text: null }, 6000)]);
  assert.equal(awayEntries(cleared)[0].note.reminder, undefined);
  const returned = foldAwayEvents([...events, at({ type: "day", date, away: false }, 7000)]);
  assert.equal(returned[date]?.away, false);
  assert.equal(returned[date]?.reason?.text, "I wanted room.", "Returning to trading keeps what was written.");
});

test("journal book words merge by revision on a date without a session", () => {
  const entry = { id: "page-1", t: 1000, label: "Journal", text: "First words" };
  const days = foldAwayEvents([
    at({ type: "book", date, entry: { ...entry, text: "Newer words", updatedAt: 3000 } }, 3000),
    at({ type: "book", date, entry: { ...entry, updatedAt: 2000 } }, 3500),
  ]);
  assert.deepEqual(days[date]?.bookNotes?.map(note => note.text), ["Newer words"]);
});

test("away changes reject malformed dates, screenshots and empty reflections", () => {
  assert.throws(() => createAwayEvent({ type: "day", date: "2026-02-30", away: true }));
  assert.throws(() => createAwayEvent({ type: "note", date, noteId, text: "  ", images: [] }));
  const image = { id: noteId, path: `${alice}/${noteId}/${noteId}.png`, name: "a", timeframe: "", caption: "" };
  assert.throws(() => createAwayEvent({ type: "note", date, noteId, text: "x", images: [image] }), "Session screenshot folders are not away-day paths.");
  assert.equal(awayActionSchema.safeParse({ action: "away-append", events: [] }).success, false);
});

test("marking and writing on an away day writes no session or process record", async () => {
  const owner = "44444444-4444-4444-8444-444444444444";
  await saveAwayEvents(owner, [
    createAwayEvent({ type: "day", date, away: true }),
    createAwayEvent({ type: "reason", date, text: "Rest." }),
    createAwayEvent({ type: "note", date, noteId, text: "A reflection.", images: [] }),
    createAwayEvent({ type: "book", date, entry: { id: "page-2", t: 1000, label: "Journal", text: "Book words" } }),
  ]);
  assert.equal((await readAwayEvents(owner)).length, 4);
  assert.deepEqual((await listSessions(owner)).filter(session => session.owner === owner), []);
  assert.deepEqual(await readProcess(owner), []);
});

function transport(overrides: Partial<AwayTransport> = {}) {
  const server: AwayEvent[] = [];
  const uploads: string[] = [];
  const api: AwayTransport = {
    append: async events => { for (const event of events) if (!server.some(row => row.id === event.id)) server.push(event); },
    list: async after => ({ events: server.slice(Number(after)), cursor: String(server.length), more: false }),
    upload: async image => { uploads.push(image.path); },
    ...overrides,
  };
  return { api, server, uploads };
}

test("a reflection waits for its screenshots, then syncs once", async () => {
  const owner = "55555555-5555-4555-8555-555555555555";
  const image = await keepAwayScreenshot(owner, png());
  assert.match(image.path, new RegExp(`^${owner}/away-days/[a-f0-9-]{36}\\.png$`));
  const reason = createAwayEvent({ type: "reason", date, text: "Rest." });
  const note = createAwayEvent({ type: "note", date, noteId, text: "", images: [image] });
  await saveAwayEvents(owner, [reason, note]);
  const remote = transport();
  await assert.rejects(syncAwayEventsWith(owner, { ...remote.api, upload: async () => { throw new Error("offline"); } }), /offline/);
  assert.deepEqual(remote.server.map(event => event.id), [reason.id], "Words without screenshots are not held back.");
  assert.equal(await syncAwayEventsWith(owner, remote.api), 0);
  assert.deepEqual(remote.server.map(event => event.id), [reason.id, note.id]);
  assert.deepEqual(remote.uploads, [image.path]);
  await syncAwayEventsWith(owner, remote.api);
  assert.equal(remote.server.length, 2);
  assert.deepEqual(remote.uploads, [image.path], "An uploaded screenshot is not sent again.");
});

test("changes from another device arrive without disturbing unsynced local words", async () => {
  const owner = "66666666-6666-4666-8666-666666666666";
  const local = createAwayEvent({ type: "reason", date, text: "Written offline." });
  await saveAwayEvents(owner, [local]);
  const remote = transport();
  remote.server.push(awayEventSchema.parse(createAwayEvent({ type: "day", date, away: true })));
  await syncAwayEventsWith(owner, remote.api);
  const days = foldAwayEvents(await readAwayEvents(owner));
  assert.equal(days[date]?.away, true);
  assert.equal(days[date]?.reason?.text, "Written offline.");
  assert.equal(remote.server.length, 2);
});

test("Postgres keeps away days private, append-only and separate from sessions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${alice}'),('${bob}');
      create schema storage;create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
      grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
      grant usage on schema public to authenticated,service_role;`);
    await db.exec(readFileSync("supabase/migrations/20261118230000_away_days.sql", "utf8"));
    const event = createAwayEvent({ type: "day", date, away: true });
    await db.exec("set role service_role");
    await db.query("select pulse_away_append($1,$2)", [alice, JSON.stringify([event])]);
    await db.query("select pulse_away_append($1,$2)", [alice, JSON.stringify([event])]);
    await assert.rejects(db.query("select pulse_away_append($1,$2)", [bob, JSON.stringify([event])]), /idempotency conflict/);
    await assert.rejects(db.query("select pulse_away_append($1,$2)", [alice, JSON.stringify([{ ...event, createdAt: 1 }])]), /idempotency conflict/);
    await assert.rejects(db.query("update away_day_events set data=data"), /permission denied/);
    await assert.rejects(db.query("delete from away_day_events"), /permission denied/);
    assert.equal((await db.query("select * from away_day_events")).rows.length, 1);
    const tables = await db.query<{ name: string }>("select tablename as name from pg_tables where schemaname='public'");
    assert.deepEqual(tables.rows.map(row => row.name), ["away_day_events"], "The migration creates no session or trading-day rows.");

    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${alice}'`);
    assert.equal((await db.query("select * from away_day_events")).rows.length, 1);
    await assert.rejects(db.query("select pulse_away_append($1,$2)", [alice, "[]"]), /permission denied/);
    await assert.rejects(db.query("delete from away_day_events"), /permission denied/);
    await db.query("insert into storage.objects(bucket_id,name) values('pulse-screenshots',$1)", [`${alice}/away-days/${noteId}.png`]);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('pulse-screenshots',$1)", [`${bob}/away-days/${noteId}.png`]), /row-level security/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('pulse-screenshots',$1)", [`${alice}/away-days/nested/${noteId}.png`]), /row-level security/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('other-bucket',$1)", [`${alice}/away-days/${noteId}.png`]), /row-level security/);
    await db.exec(`set request.jwt.claim.sub='${bob}'`);
    assert.equal((await db.query("select * from away_day_events")).rows.length, 0);
  } finally {
    await db.close();
  }
});
