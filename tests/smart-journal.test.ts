import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  defaults,
  type Session,
  type Sample,
  type JournalEntry,
} from "../src/lib/model";
import {
  detectHrMoments,
  mergeNotes,
  personalProfile,
  personalQuestion,
  reconstructTrades,
  reflectionContext,
} from "../src/lib/smart-journal";
import { parseTrades, inspectCsv } from "../src/lib/csv";
import { sessionSchema } from "../src/lib/validation";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  sid = "33333333-3333-4333-8333-333333333333";
const session: Session = {
  id: sid,
  owner: alice,
  startedAt: 1000,
  name: "Verification",
  source: "journal",
  sampleCount: 0,
  events: [],
  journal: [],
};
const settings = { ...defaults, baselineSeconds: 60 };
function readings(sequence: { seconds: number; bpm: number }[]) {
  const samples: Sample[] = [];
  for (const segment of sequence)
    for (let i = 0; i < segment.seconds; i++)
      samples.push({ t: 1000 + samples.length * 1000, bpm: segment.bpm });
  return samples;
}
test("HR episodes require an opening baseline, rearm after recovery, and ignore signal gaps", () => {
  assert.equal(
    detectHrMoments(readings([{ seconds: 30, bpm: 110 }]), settings).length,
    0,
  );
  const pts = readings([
    { seconds: 60, bpm: 70 },
    { seconds: 120, bpm: 105 },
    { seconds: 45, bpm: 70 },
    { seconds: 30, bpm: 100 },
  ]);
  const moments = detectHrMoments(pts, settings);
  assert.equal(moments.length, 2);
  assert.equal(moments[0].baseline, 70);
  assert.equal(moments[0].delta, 35);
  assert.equal(moments[0].kind, "rise");
  const gap = readings([
    { seconds: 60, bpm: 70 },
    { seconds: 10, bpm: 100 },
  ]);
  gap.push({ t: 150000, bpm: 100 }, { t: 151000, bpm: 100 });
  assert.equal(
    detectHrMoments(gap, settings).length,
    1,
    "gap must not count as a new sustained elevation",
  );
  const gradual = readings([{ seconds: 60, bpm: 70 }]);
  for (let i = 0; i < 60; i++)
    gradual.push({ t: 61000 + i * 1000, bpm: Math.min(100, 70 + i) });
  assert.equal(detectHrMoments(gradual, settings)[0].kind, "elevation");
});
test("confirmed records personalize only the owner and corrections/deletions immediately change insights", () => {
  const note: JournalEntry = {
    id: "n",
    t: 2000,
    label: "FOMO",
    text: "I wanted to chase",
    context: { bpm: 100, baseline: 70, delta: 30 },
  };
  const corrected = { ...note, label: "Calm", updatedAt: 3000 };
  const deleted = {
    id: note.id,
    t: note.t,
    label: "Other",
    text: "",
    deletedAt: 4000,
    updatedAt: 4000,
  };
  assert.equal(mergeNotes([corrected], [note])[0].label, "Calm");
  assert.equal(mergeNotes([deleted], [corrected])[0].deletedAt, 4000);
  const foreign = { ...session, id: bob, owner: bob, journal: [note] };
  assert.equal(personalProfile([foreign], alice).count, 0);
  assert.equal(
    personalProfile([{ ...session, journal: [deleted] }], alice).count,
    0,
  );
  const sessions = Array.from({ length: 3 }, (_, i) => ({
    ...session,
    id: String(i),
    journal: Array.from({ length: 3 }, (_, j) => ({
      ...note,
      id: `${i}-${j}`,
    })),
  }));
  const profile = personalProfile(sessions, alice);
  assert.equal(profile.count, 9);
  assert.equal(profile.suggestedThreshold, 30);
  assert.match(
    personalQuestion(profile, [], 3000),
    /marked fomo in 9 reflections/,
  );
  assert.equal(reflectionContext([], 2000, defaults, [])?.bpm, undefined);
  assert.ok(
    sessionSchema.safeParse({ ...session, journal: [corrected] }).success,
  );
});
test("broker fill CSV skips unfilled orders and reconstructs partial exits, reversals and per-account positions", () => {
  const csv =
    "FillTime,Contract,B/S,Fill Qty,Fill Price,Fill ID,Status,Account\n2026-01-15T12:00:00Z,ES,Buy,2,5000,a,Filled,A\n2026-01-15T12:01:00Z,ES,Sell,1,5010,b,Filled,A\n2026-01-15T12:02:00Z,ES,Sell,3,5020,c,Filled,A\n2026-01-15T12:03:00Z,ES,Buy,2,5030,d,Filled,A\n2026-01-15T12:04:00Z,ES,Buy,1,5040,e,Cancelled,A\n2026-01-15T12:00:00Z,ES,Sell,1,5000,f,Filled,B\n";
  assert.equal(inspectCsv(csv).fills, true);
  assert.throws(() => parseTrades(csv), /starts with a flat position/);
  const events = parseTrades(csv, { fillsStartFlat: true });
  assert.equal(events.length, 6);
  const a = events.filter((e) => e.account === "A");
  assert.deepEqual(
    a.map((e) => [e.kind, e.side, e.quantity]),
    [
      ["entry", "long", 2],
      ["exit", "long", 1],
      ["exit", "long", 1],
      ["entry", "short", 2],
      ["exit", "short", 2],
    ],
  );
  const trades = reconstructTrades(events);
  assert.equal(trades.filter((t) => t.exit).length, 3);
  assert.equal(trades.filter((t) => !t.exit).length, 1);
  assert.ok(trades.every((t) => t.quantity > 0));
  assert.deepEqual(parseTrades(csv, { fillsStartFlat: true }), events);
  const conflicting = csv + "2026-01-15T12:05:00Z,ES,Buy,2,5040,a,Filled,A\n";
  assert.throws(
    () => parseTrades(conflicting, { fillsStartFlat: true }),
    /repeated execution\/order ID/,
  );
  const alert = { ...events[0], provenance: "alert" as const };
  assert.equal(reconstructTrades([alert]).length, 0);
  const indistinguishable = 'FillTime,Contract,B/S,Fill Qty,Fill Price\n2026-01-15T12:00:00Z,ES,Buy,1,5000\n2026-01-15T12:00:00Z,ES,Buy,1,5000\n';
  assert.throws(() => parseTrades(indistinguishable, {fillsStartFlat:true}), /unique fill IDs/);
});
test("Postgres edits and tombstones survive stale uploads; screenshot storage enforces ownership", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('${alice}'),('${bob}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;grant usage,select on sequence storage.objects_id_seq to authenticated;`,
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261013082052_initial_trade_pulse_tenants.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261013202920_smart_journal_screenshots.sql",
        "utf8",
      ),
    );
    const first = {
      id: "n",
      t: 2000,
      label: "FOMO",
      text: "Original",
      updatedAt: 2000,
    };
    const save = (journal: unknown[]) =>
      db.query("select pulse_save_session($1,$2,$3)", [
        alice,
        sid,
        { ...session, journal },
      ]);
    await save([first]);
    await save([
      { ...first, label: "Calm", text: "Corrected", updatedAt: 3000 },
    ]);
    await save([first]);
    let row = await db.query<{ data: Session }>(
      "select data from pulse_sessions",
    );
    assert.equal(row.rows[0].data.journal[0].text, "Corrected");
    await save([
      {
        id: "n",
        t: 2000,
        label: "Other",
        text: "",
        updatedAt: 4000,
        deletedAt: 4000,
      },
    ]);
    await save([first]);
    row = await db.query<{ data: Session }>("select data from pulse_sessions");
    assert.equal(row.rows[0].data.journal[0].deletedAt, 4000);
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${alice}';insert into storage.objects(bucket_id,name) values('pulse-screenshots','${alice}/${sid}/image.png');`,
    );
    await db.exec(`set request.jwt.claim.sub='${bob}';`);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name) values('pulse-screenshots','${alice}/${sid}/foreign.png')`,
      ),
      /row-level security/,
    );
    assert.equal(
      (await db.query("delete from storage.objects returning *")).rows.length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${alice}';`);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("delete from storage.objects returning *")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
