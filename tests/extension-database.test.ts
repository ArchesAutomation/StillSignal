import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Session, JournalEntry } from "../src/lib/model";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
export async function extensionDatabase() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('${alice}'),('${bob}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
  );
  for (const f of [
    "20261013082052_initial_trade_pulse_tenants.sql",
    "20261013091657_journal_tradingview_connections.sql",
    "20261013093620_tradingview_active_journal.sql",
    "20261013202920_smart_journal_screenshots.sql",
    "20261014064042_broker_workspace.sql",
    "20261014064205_voice_journal_extension.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  return db;
}
async function credential(
  db: PGlite,
  user = alice,
  instance = randomUUID(),
  code = randomUUID(),
) {
  const id = randomUUID(),
    token = randomUUID();
  await db.query(
    "insert into pulse_extension_pairings(code_hash,user_id,instance_id,extension_id,challenge,identity,expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '2 minutes')",
    [code, user, instance, "a".repeat(32), "challenge", "alice@example.test"],
  );
  const r = await db.query<{ result: unknown }>(
    "select pulse_extension_exchange($1,$2,$3,$4,$5) result",
    [code, instance, "challenge", token, id],
  );
  return { id, token, instance, code, result: r.rows[0].result };
}
const action = async (
  db: PGlite,
  c: { token: string; instance: string },
  p: unknown,
) =>
  (
    await db.query<{ result: { note: JournalEntry; session: Session } }>(
      "select pulse_extension_action($1,$2,$3) result",
      [c.token, c.instance, p],
    )
  ).rows[0].result;
test("instrument/account scope and the app's measured baseline settings remain attached to the captured moment", async () => {
  const db = await extensionDatabase();
  try {
    const c = await credential(db),
      sid = randomUUID();
    const events = [
      {
        id: "es-A",
        t: 70000,
        symbol: "ES",
        account: "A",
        kind: "entry",
        side: "long",
        price: 5000,
        quantity: 1,
        source: "manual",
      },
      {
        id: "nq-B",
        t: 70500,
        symbol: "NQ",
        account: "B",
        kind: "entry",
        side: "long",
        price: 20000,
        quantity: 1,
        source: "manual",
      },
    ];
    await db.query("select pulse_save_session($1,$2,$3)", [
      alice,
      sid,
      {
        id: sid,
        owner: alice,
        name: "Measured context",
        startedAt: 1000,
        source: "journal",
        sampleCount: 31,
        events,
        journal: [],
      },
    ]);
    await db.query("select pulse_ingest_batch($1,$2,$3,$4)", [
      alice,
      sid,
      randomUUID(),
      [
        ...Array.from({ length: 30 }, (_, i) => ({
          t: 1000 + i * 2000,
          bpm: 70,
        })),
        { t: 70000, bpm: 110 },
      ],
    ]);
    const note = {
      id: randomUUID(),
      t: 70000,
      label: "Other",
      text: "My words",
      source: "voice",
    };
    const result = await action(db, c, {
      action: "mutate",
      requestId: randomUUID(),
      sessionId: sid,
      mutation: {
        kind: "create",
        note,
        selection: {
          instrumentId: "NQ",
          accountId: "B",
          baselineSeconds: 60,
          windowSeconds: 15,
        },
      },
    });
    assert.equal(result.note.context?.eventId, "nq-B");
    assert.equal(result.note.context?.baseline, 70);
    assert.equal(result.note.context?.delta, 40);
    assert.equal(result.note.label, "Other");
    assert.equal(result.note.captureScope?.accountId, "B");
  } finally {
    await db.close();
  }
});
test("pairing is instance-bound, expiring, single-use; scoped credentials rotate and revoke", async () => {
  const db = await extensionDatabase();
  try {
    const c = await credential(db);
    await assert.rejects(
      db.query("select pulse_extension_exchange($1,$2,$3,$4,$5)", [
        c.code,
        c.instance,
        "challenge",
        "new",
        randomUUID(),
      ]),
      /unauthorized/,
    );
    const exp = randomUUID();
    await db.query(
      "insert into pulse_extension_pairings values($1,$2,$3,$4,$5,$6,now()-interval '1 second',null)",
      [exp, alice, randomUUID(), "a".repeat(32), "challenge", "alice"],
    );
    await assert.rejects(
      db.query("select pulse_extension_exchange($1,$2,$3,$4,$5)", [
        exp,
        c.instance,
        "challenge",
        "new",
        randomUUID(),
      ]),
      /unauthorized/,
    );
    await assert.rejects(
      action(db, { ...c, instance: randomUUID() }, { action: "context" }),
      /unauthorized/,
    );
    await action(db, c, { action: "rotate", tokenHash: "rotated" });
    await assert.rejects(action(db, c, { action: "context" }), /unauthorized/);
    const updated = { ...c, token: "rotated" };
    await action(db, updated, { action: "context" });
    await action(db, updated, { action: "disconnect" });
    await assert.rejects(
      action(db, updated, { action: "context" }),
      /unauthorized/,
    );
    const next = await credential(db, alice, c.instance);
    await credential(db, bob, c.instance);
    await assert.rejects(
      action(db, next, { action: "context" }),
      /unauthorized/,
      "pairing another account revokes old installation token",
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select * from pulse_extension_credentials"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select pulse_extension_action($1,$2,$3)", [
        c.token,
        c.instance,
        { action: "context" },
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("atomic notes preserve records, timestamps, revisions, tombstones; retries and deleted sessions are safe", async () => {
  const db = await extensionDatabase();
  try {
    const c = await credential(db),
      other = await credential(db, bob);
    const sid = randomUUID();
    const session: Session = {
      id: sid,
      owner: alice,
      startedAt: 1000,
      name: "ES journal",
      source: "journal",
      sampleCount: 3,
      events: [
        {
          id: "trade",
          t: 2000,
          symbol: "ES",
          kind: "entry",
          side: "long",
          price: 5000,
          quantity: 1,
          source: "manual",
        },
      ],
      journal: [
        {
          id: "photo",
          t: 1000,
          text: "Screenshot",
          label: "Other",
          screenshot: {
            path: `${alice}/${sid}/${randomUUID()}.png`,
            name: "private",
          },
        },
        {
          id: "deleted",
          t: 1100,
          text: "",
          label: "Other",
          deletedAt: 2000,
          updatedAt: 2000,
        },
      ],
    };
    await db.query("select pulse_save_session($1,$2,$3)", [
      alice,
      sid,
      session,
    ]);
    const note = {
      id: randomUUID(),
      t: 2000,
      activationAt: 2000,
      recordingStartedAt: 2300,
      label: "Other",
      text: "I felt impatient.",
      source: "voice",
    };
    const p = {
      action: "mutate",
      requestId: randomUUID(),
      sessionId: sid,
      mutation: { kind: "create", note },
    };
    const first = await action(db, c, p);
    assert.deepEqual(await action(db, c, p), first);
    assert.equal(first.note.t, 2000);
    assert.equal(first.note.recordingStartedAt, 2300);
    assert.equal(first.note.context?.eventId, "trade");
    assert.equal(first.note.context?.bpm, undefined);
    await assert.rejects(
      action(db, c, {
        ...p,
        mutation: { kind: "create", note: { ...note, text: "different" } },
      }),
      /idempotency conflict/,
    );
    await assert.rejects(
      action(db, other, { ...p, requestId: randomUUID() }),
      /session not found/,
    );
    const tag = await action(db, c, {
      action: "mutate",
      requestId: randomUUID(),
      sessionId: sid,
      mutation: {
        kind: "tag",
        noteId: note.id,
        label: "FOMO",
        expectedRevision: first.note.updatedAt,
      },
    });
    const correction = await action(db, c, {
      action: "mutate",
      requestId: randomUUID(),
      sessionId: sid,
      mutation: {
        kind: "correct",
        noteId: note.id,
        text: "My exact replacement.",
        expectedRevision: tag.note.updatedAt,
      },
    });
    assert.equal(correction.note.t, note.t);
    assert.equal(correction.note.label, "FOMO");
    assert.equal(correction.note.text, "My exact replacement.");
    await assert.rejects(
      action(db, c, {
        action: "mutate",
        requestId: randomUUID(),
        sessionId: sid,
        mutation: {
          kind: "correct",
          noteId: note.id,
          text: "stale",
          expectedRevision: first.note.updatedAt,
        },
      }),
      /revision conflict/,
    );
    await db.query("select pulse_save_session($1,$2,$3)", [
      alice,
      sid,
      session,
    ]);
    const row = (
      await db.query<{ data: Session }>(
        "select data from pulse_sessions where id=$1",
        [sid],
      )
    ).rows[0].data;
    assert.deepEqual(row.events, session.events);
    assert.deepEqual(
      row.journal.find((n) => n.id === "photo"),
      session.journal[0],
    );
    assert.equal(row.journal.find((n) => n.id === "deleted")?.deletedAt, 2000);
    assert.equal(
      row.journal.find((n) => n.id === note.id)?.text,
      "My exact replacement.",
    );
    assert.equal(row.sampleCount, 3);
    const removed = await action(db, c, {
      action: "mutate",
      requestId: randomUUID(),
      sessionId: sid,
      mutation: {
        kind: "delete",
        noteId: note.id,
        expectedRevision: correction.note.updatedAt,
      },
    });
    assert.ok(removed.note.deletedAt);
    await assert.rejects(
      action(db, c, {
        action: "mutate",
        requestId: randomUUID(),
        sessionId: sid,
        mutation: {
          kind: "tag",
          noteId: note.id,
          label: "Calm",
          expectedRevision: removed.note.updatedAt,
        },
      }),
      /note not found/,
    );
    await db.query("select pulse_delete_session($1,$2)", [alice, sid]);
    await assert.rejects(action(db, c, p), /session deleted/);
    await assert.rejects(
      action(db, c, {
        action: "start",
        requestId: randomUUID(),
        sessionId: sid,
        startedAt: 1000,
        name: "Resurrect",
      }),
      /session deleted/,
    );
  } finally {
    await db.close();
  }
});
test("late matching HR samples enrich one reflection without inferring emotion", async () => {
  const db = await extensionDatabase();
  try {
    const c = await credential(db),
      sid = randomUUID();
    await action(db, c, {
      action: "start",
      requestId: randomUUID(),
      sessionId: sid,
      startedAt: 1000,
      name: "Normal journal",
    });
    const note = {
      id: randomUUID(),
      t: 400000,
      label: "Other",
      text: "Thinking through my trade.",
      source: "voice",
    };
    await action(db, c, {
      action: "mutate",
      requestId: randomUUID(),
      sessionId: sid,
      mutation: { kind: "create", note },
    });
    await db.query("select pulse_ingest_batch($1,$2,$3,$4)", [
      alice,
      sid,
      randomUUID(),
      [{ t: 400000, bpm: 100 }],
    ]);
    const result = await action(db, c, {
      action: "mutate",
      requestId: randomUUID(),
      sessionId: sid,
      mutation: { kind: "enrich", noteId: note.id },
    });
    assert.equal(result.note.context?.bpm, 100);
    assert.equal(result.note.context?.baseline, undefined);
    assert.equal(result.note.label, "Other");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select jsonb_array_length(data->'journal') n from pulse_sessions",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
