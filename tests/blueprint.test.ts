import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { parseTrades } from "../src/lib/csv";
import { positionIdeas, sessionIdeas } from "../src/lib/position-ideas";
import {
  cropCsv,
  availableCsvSessions,
  missingOpeningFills,
} from "../src/lib/import-selection";
import { sessionSchema } from "../src/lib/validation";
import { saveSession, listSessions } from "../src/lib/storage";
import { mergeSessions } from "../src/lib/workspace";
import {
  privateFile,
  keepPrivateFile,
  removePrivateFile,
} from "../src/lib/private-files";
import {
  environmentPatterns,
  parsePnlCsv,
  pnlExposure,
  sessionObservations,
  normalizedTimeline,
} from "../src/lib/session-timeline";
import { noCombination } from "../src/lib/blueprint-schema";
import { journalTradeGroups } from "../src/lib/journal-phases";
import { validateDestination } from "../src/lib/journal-routing";
import type { Session, TradeEvent } from "../src/lib/model";
const owner = "77777777-7777-4777-8777-777777777777";
const start = Date.parse("2026-10-23T15:32:00Z");
const event = (
  id: string,
  minute: number,
  kind: "entry" | "exit",
  price: number,
  account = "leader",
): TradeEvent => ({
  id,
  t: start + minute * 60000,
  symbol: "MNQ",
  side: "long",
  quantity: 1,
  price,
  kind,
  source: "csv",
  account,
  currency: "USD",
  provenance: "execution",
});
const fills = [
  event("a", 0, "entry", 25000),
  event("b", 1, "entry", 25001),
  event("c", 2, "entry", 25002),
  event("d", 5, "exit", 25010),
  event("e", 6, "exit", 25012),
  event("f", 7, "exit", 25011),
];
const session = (patch: Partial<Session> = {}): Session => ({
  id: crypto.randomUUID(),
  owner,
  name: "Blueprint test",
  source: "csv",
  startedAt: start,
  endedAt: start + 10 * 60000,
  events: fills,
  journal: [],
  sampleCount: 0,
  timezone: "UTC",
  ...patch,
});
test("three entries and three partial exits form one lifecycle with all six fills and weighted prices", () => {
  const ideas = positionIdeas(fills);
  assert.equal(ideas.length, 1);
  assert.deepEqual(ideas[0].fillIds, ["a", "b", "c", "d", "e", "f"]);
  assert.equal(ideas[0].entry, start);
  assert.equal(ideas[0].exit, start + 7 * 60000);
  assert.equal(ideas[0].quantity, 3);
  assert.equal(ideas[0].entryPrice, 25001);
  assert.equal(ideas[0].exitPrice, 25011);
  assert.equal(ideas[0].openQuantity, 0);
});
test("account separation, reversals and missing openings do not invent or combine positions", () => {
  const csv =
    "FillTime,Contract,B/S,Fill Qty,Fill Price,Fill ID,Status,Account\n2026-10-23T15:32:00Z,MNQ,Buy,2,25000,a,Filled,A\n2026-10-23T15:33:00Z,MNQ,Sell,3,25001,b,Filled,A\n2026-10-23T15:34:00Z,MNQ,Buy,1,25002,c,Filled,A\n";
  const ideas = positionIdeas(parseTrades(csv, { fillsStartFlat: true }));
  assert.equal(ideas.length, 2);
  assert.deepEqual(
    ideas.map((i) => [i.side, i.quantity, i.openQuantity]),
    [
      ["long", 2, 0],
      ["short", 1, 0],
    ],
  );
  assert.equal(positionIdeas([fills[3]]).length, 0);
  assert.equal(
    positionIdeas([
      ...fills,
      ...fills.map((e) => ({
        ...e,
        id: "follower-" + e.id,
        account: "follower",
      })),
    ]).length,
    2,
  );
});
test("legacy partial-entry note destinations stay attached and merge/split preserve raw executions", () => {
  const s = session({
    journal: [
      {
        id: "note",
        t: start,
        eventTime: start + 60000,
        tradeId: "b",
        section: "entry",
        label: "Calm",
        text: "Live",
        captureMode: "live",
      },
    ],
  });
  validateDestination(s.journal[0], s);
  assert.equal(journalTradeGroups(s).trades[0].phases[1].notes.length, 1);
  const split = sessionIdeas({
    ...s,
    blueprint: { updatedAt: 1, grouping: { splits: ["b"], merges: [] } },
  });
  assert.equal(split.length, 2);
  assert.equal(new Set(split.flatMap((i) => i.fillIds)).size, 6);
  const merged = sessionIdeas({
    ...s,
    blueprint: {
      updatedAt: 2,
      grouping: { splits: ["b"], merges: [["a", "b"]] },
    },
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].fillIds.length, 6);
  assert.equal(merged[0].quantity, 3);
  assert.deepEqual(s.events, fills);
});
test("CSV crop selects exact date, timezone, account and inclusive boundaries; DST ambiguity rejects", () => {
  const all = [
    ...fills,
    event("other", 1, "entry", 1, "other"),
    { ...fills[0], id: "tomorrow", t: start + 86400000 },
  ];
  const cropped = cropCsv(all, {
    day: "2026-10-23",
    account: "leader",
    start: "2026-10-23T15:33:00",
    end: "2026-10-23T15:38:00",
    timezone: "UTC",
  });
  assert.deepEqual(
    cropped.map((e) => e.id),
    ["b", "c", "d", "e"],
  );
  assert.equal(availableCsvSessions(all, "UTC").length, 3);
  assert.equal(missingOpeningFills(fills, fills.slice(1)).length, 1);
  assert.equal(missingOpeningFills(fills, fills).length, 0);
  assert.throws(() =>
    cropCsv(all, {
      start: "2026-11-01T01:30:00",
      timezone: "America/New_York",
    }),
  );
});
test("P&L isolates leader, currency and instrument; realised-only data never invents open profit", () => {
  const points = parsePnlCsv(
    "timestamp,account,currency,realised,unrealised,symbol\n2026-10-23T15:32:00Z,leader,USD,0,100,Account\n2026-10-23T15:32:30Z,leader,USD,0,60,Account\n2026-10-23T15:33:00Z,follower,USD,0,10000,Account\n2026-10-23T15:33:00Z,leader,EUR,0,5000,Account\n2026-10-23T15:33:00Z,leader,USD,0,9000,ES\n",
    "UTC",
  );
  const s = session({ blueprint: { updatedAt: 1, pnl: points } });
  const exposure = pnlExposure(s, "leader", "USD");
  assert.equal(exposure.curve.length, 2);
  assert.equal(exposure.peakOpen, 100);
  assert.equal(exposure.giveback, 40);
  assert.equal(exposure.maxDrawdown, 40);
  assert.equal(exposure.aboveMs, 30000);
  const realised = pnlExposure(
    session({ events: [{ ...fills[3], pnl: 50 }] }),
    "leader",
    "USD",
  );
  assert.equal(realised.peakOpen, null);
  assert.equal(realised.giveback, null);
  assert.equal(realised.hasOpenPnl, false);
  assert.throws(() =>
    parsePnlCsv(
      "timestamp,account,currency,realised\n2026-11-01T01:30:00,A,USD,0\n",
      "America/New_York",
    ),
  );
});
test("environment evidence uses distinct days, owner, demo exclusions and explicit consent", () => {
  const now = Date.parse("2026-10-24T20:00:00Z"),
    context = {
      location: "Home desk",
      social: "Alone",
      setup: "Main desk",
      noise: 2,
      privacy: 4,
      comfort: 4,
      connection: 5,
      readiness: 4,
      stress: 2,
      intention: "Observe",
      strategy: "My setup",
      newsDay: false,
    };
  const rows = Array.from({ length: 10 }, (_, i) =>
    session({
      startedAt: start - i * 86400000,
      blueprint: {
        updatedAt: 1,
        context,
        combine: { ...noCombination, environment: true },
        commitments: [
          {
            id: "rule-" + i,
            category: "Risk",
            rule: "One idea",
            result: "followed",
            recordedAt: start - i * 86400000,
          },
        ],
      },
    }),
  );
  assert.equal(
    environmentPatterns(rows.slice(0, 4), owner, now)[0].adherence,
    null,
  );
  const group = environmentPatterns(rows, owner, now)[0];
  assert.equal(group.count, 10);
  assert.equal(group.adherence, 1);
  assert.equal(group.evidence, "More established");
  assert.equal(
    environmentPatterns(
      rows.map((s) => ({ ...s, demo: true })),
      owner,
      now,
    ).length,
    0,
  );
  assert.equal(environmentPatterns(rows, "someone-else", now).length, 0);
  assert.equal(
    environmentPatterns(
      Array.from({ length: 10 }, () => rows[0]),
      owner,
      now,
    )[0].count,
    1,
  );
  assert.equal(
    environmentPatterns(
      rows.map((s) => ({
        ...s,
        blueprint: { ...s.blueprint!, combine: noCombination },
      })),
      owner,
      now,
    ).length,
    0,
  );
});
test("reflection provenance, original transcript and revisioned context survive IndexedDB refresh and stale merge", async () => {
  const s = session({
    journal: [
      {
        id: "voice",
        t: start,
        eventTime: start,
        capturedAt: start + 700000,
        captureMode: "post-session",
        inputMethod: "voice",
        reflectionScope: "day",
        source: "voice",
        originalTranscript: "Original words",
        text: "Corrected words",
        label: "Calm",
      },
    ],
    blueprint: {
      updatedAt: 100,
      leaderAccount: "leader",
      combine: { ...noCombination, transcript: true },
    },
  });
  assert.equal(sessionSchema.safeParse(s).success, true);
  await saveSession(s);
  await saveSession({
    ...s,
    blueprint: { updatedAt: 1, leaderAccount: "stale" },
  });
  const saved = (await listSessions(owner)).find((x) => x.id === s.id)!;
  assert.equal(saved.blueprint?.leaderAccount, "leader");
  assert.equal(saved.journal[0].originalTranscript, "Original words");
  assert.equal(
    mergeSessions(s, { ...s, blueprint: undefined }).blueprint?.updatedAt,
    100,
  );
  const timeline = normalizedTimeline(saved, []);
  assert.equal(timeline.find((x) => x.id === "voice")!.t, start);
  const observations = sessionObservations(saved, []);
  assert.equal(observations.baseline, null);
  assert.equal(observations.voice.length, 0);
});
test("raw audio is owner scoped and deletion keeps transcript records intact", async () => {
  const id = crypto.randomUUID(),
    saved = await keepPrivateFile(
      owner,
      id,
      "audio",
      new Blob(["recording"], { type: "audio/webm" }),
    );
  assert.ok(saved.expiresAt! > Date.now());
  assert.equal(
    await (await privateFile(saved.path, owner)).text(),
    "recording",
  );
  await assert.rejects(privateFile(saved.path, crypto.randomUUID()));
  await assert.rejects(removePrivateFile(saved.path, crypto.randomUUID()));
  await removePrivateFile(saved.path, owner);
  await assert.rejects(privateFile(saved.path, owner));
});
test("database metadata revision guard is applied without changing journal merge or broker ownership", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table pulse_sessions(id uuid primary key,user_id uuid,started_at bigint,data jsonb,updated_at timestamptz);create table pulse_deleted_sessions(id uuid);create table pulse_events(session_id uuid,user_id uuid,data jsonb);",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261025005839_blueprint_session_metadata.sql",
        "utf8",
      ),
    );
    const s = session({
      blueprint: { updatedAt: 100, leaderAccount: "leader" },
    });
    await db.query("select pulse_save_session($1,$2,$3)", [owner, s.id, s]);
    await db.query("select pulse_save_session($1,$2,$3)", [
      owner,
      s.id,
      {
        ...s,
        blueprint: { updatedAt: 1, leaderAccount: "stale" },
        journal: [{ id: "new", t: start, label: "Calm", text: "New note" }],
      },
    ]);
    const result = await db.query<{ data: Session }>(
      "select data from pulse_sessions",
    );
    assert.equal(result.rows[0].data.blueprint?.leaderAccount, "leader");
    assert.equal(result.rows[0].data.journal[0].text, "New note");
    await assert.rejects(
      db.query("select pulse_save_session($1,$2,$3)", [
        crypto.randomUUID(),
        s.id,
        s,
      ]),
    );
  } finally {
    await db.close();
  }
});
