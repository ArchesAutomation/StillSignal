import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import CapturePanel from "../src/components/concept/capture-panel";
import {
  environmentAt,
  labelsFor,
  localInstant,
  proximityEvents,
  validQuote,
  captureSymbol,
  momentPnl,
  weeklyActuals,
} from "../src/lib/journal-reference";
import { sessionSchema } from "../src/lib/validation";
import {
  keepPrivateFile,
  privateFile,
  removePrivateFile,
} from "../src/lib/private-files";
import type { JournalEntry, Session } from "../src/lib/model";
import { referenceAnalysis } from "../src/lib/reference-analysis";
import { noCombination } from "../src/lib/blueprint-schema";
import { dailyJournalSession } from "../src/lib/journal-collection";
const owner = "11111111-1111-4111-8111-111111111111",
  t = Date.parse("2026-10-23T14:30:00Z");
const session = (patch: Partial<Session> = {}): Session => ({
  id: crypto.randomUUID(),
  owner,
  name: "Reference tests",
  source: "journal",
  startedAt: t,
  endedAt: t + 3 * 3600000,
  timezone: "UTC",
  sampleCount: 0,
  events: [],
  journal: [],
  ...patch,
});
test("per-moment P&L excludes stale/future samples and ambiguous account scopes without turning missing marks into zero", () => {
  const note: JournalEntry = {
    id: "note",
    t,
    eventTime: t,
    label: "Calm",
    text: "My moment",
  };
  const point = {
    t,
    account: "A",
    symbol: "Account",
    currency: "USD",
    position: 1,
    realised: 10,
    source: "csv" as const,
  };
  const s = session({ blueprint: { updatedAt: t, pnl: [point] } });
  assert.equal(momentPnl(s, note)?.unrealised, undefined);
  assert.equal(momentPnl(s, note)?.realised, 10);
  assert.equal(momentPnl(s, { ...note, eventTime: t - 1 }), null);
  assert.equal(momentPnl(s, { ...note, eventTime: t + 10001 }), null);
  s.blueprint!.pnl!.push({ ...point, account: "B" });
  assert.equal(momentPnl(s, note), null);
});
test("capture quotes use the chosen idea and do not guess across multiple instruments", () => {
  const s = session({
    events: [
      {
        id: "a",
        t,
        symbol: "AAPL",
        kind: "entry",
        side: "long",
        quantity: 1,
        price: 100,
        source: "manual",
      },
      {
        id: "b",
        t,
        symbol: "MSFT",
        kind: "entry",
        side: "long",
        quantity: 1,
        price: 200,
        source: "manual",
      },
    ],
  });
  assert.equal(captureSymbol(s), "");
  assert.equal(captureSymbol(s, "b"), "MSFT");
  assert.equal(captureSymbol(s, "missing"), "");
  s.events.pop();
  assert.equal(captureSymbol(s), "AAPL");
});
test("day-level writing follows its latest revision across same-day recordings without crossing owners or dates", () => {
  const current = session({
    blueprint: {
      updatedAt: 500,
      dailyWriting: "Older writing",
      dailyWritingUpdatedAt: 10,
    },
  });
  const sibling = session({
    blueprint: {
      updatedAt: 100,
      dailyWriting: "Latest writing",
      dailyWritingUpdatedAt: 20,
    },
  });
  const otherDay = session({
    startedAt: t - 86400000,
    blueprint: {
      updatedAt: 1000,
      dailyWriting: "Another day",
      dailyWritingUpdatedAt: 1000,
    },
  });
  const otherOwner = session({
    owner: crypto.randomUUID(),
    blueprint: {
      updatedAt: 2000,
      dailyWriting: "Private other owner",
      dailyWritingUpdatedAt: 2000,
    },
  });
  const day = dailyJournalSession(current, [sibling, otherDay, otherOwner]);
  assert.equal(day.blueprint?.dailyWriting, "Latest writing");
  assert.equal(day.id, current.id);
  assert.equal(day.blueprint?.updatedAt, 500);
});
test("note filters do not change the continuous-profit population and account scopes remain separate", () => {
  const s = session({
    blueprint: {
      updatedAt: t,
      combine: { ...noCombination, hr: true, transcript: true, pnl: true },
      pnl: [
        {
          t: t + 301000,
          account: "A",
          symbol: "MNQ",
          currency: "USD",
          position: 1,
          realised: 0,
          unrealised: 50,
          source: "csv",
        },
        {
          t: t + 302000,
          account: "A",
          symbol: "MNQ",
          currency: "USD",
          position: 1,
          realised: 0,
          unrealised: 200,
          source: "csv",
        },
        {
          t: t + 303000,
          account: "A",
          symbol: "MNQ",
          currency: "USD",
          position: 1,
          realised: 0,
          unrealised: 300,
          source: "csv",
        },
        {
          t: t + 303000,
          account: "B",
          symbol: "MNQ",
          currency: "USD",
          position: 1,
          realised: 0,
          unrealised: 1000,
          source: "csv",
        },
        {
          t: t + 304000,
          account: "A",
          symbol: "MNQ",
          currency: "USD",
          realised: 0,
          unrealised: 5000,
          source: "csv",
        },
      ],
    },
    journal: [
      {
        id: "live",
        t: t + 301000,
        eventTime: t + 301000,
        label: "Calm",
        text: "Live words",
        section: "entry",
        captureMode: "live",
      },
      {
        id: "later",
        t: t + 601000,
        eventTime: t + 301000,
        label: "Curious",
        text: "Later words",
        section: "after",
        captureMode: "post-session",
      },
    ],
  });
  const points = Array.from({ length: 620 }, (_, i) => ({
    t: t + i * 1000,
    bpm: i < 300 ? 60 : 70,
  }));
  const filter = {
    from: "2026-10-01",
    to: "2026-10-31",
    origin: "all",
    stage: "all",
    scope: JSON.stringify(["A", "USD", "MNQ"]),
    baselineSeconds: 300,
  };
  const all = referenceAnalysis([s], owner, { [s.id]: points }, filter),
    live = referenceAnalysis(
      [s],
      owner,
      { [s.id]: points },
      { ...filter, origin: "live", stage: "entry" },
    );
  assert.equal(all.records.length, 2);
  assert.equal(live.records.length, 1);
  assert.equal(all.matchedPoints, 3);
  assert.equal(live.matchedPoints, 3);
  assert.equal(all.bins[3].points, 1);
  assert.equal(all.bins[3].delta, 10);
  const disabled = referenceAnalysis(
    [{ ...s, blueprint: { ...s.blueprint!, combine: noCombination } }],
    owner,
    { [s.id]: points },
    filter,
  );
  assert.equal(disabled.matchedPoints, 0);
  assert.equal(disabled.labels[0].mean, null);
});
test("live/later comparisons require an explicit original link and preserve both texts", () => {
  const s = session({
    blueprint: {
      updatedAt: t,
      combine: { ...noCombination, transcript: true },
    },
    journal: [
      {
        id: "original",
        t,
        eventTime: t,
        label: "Focused",
        text: "Original words",
        captureMode: "live",
      },
      {
        id: "later",
        t: t + 60000,
        eventTime: t,
        label: "Curious",
        text: "Later words",
        captureMode: "post-session",
      },
    ],
  });
  const filter = {
    from: "2026-10-01",
    to: "2026-10-31",
    origin: "all",
    stage: "all",
    scope: "",
    baselineSeconds: 300,
  };
  assert.equal(referenceAnalysis([s], owner, {}, filter).pairs.length, 0);
  s.journal[1].revisitsId = "original";
  const data = referenceAnalysis([s], owner, {}, filter);
  assert.equal(data.pairs.length, 1);
  assert.equal(data.pairs[0].original.text, "Original words");
  assert.equal(data.pairs[0].later.text, "Later words");
});

test("historical context uses effective and recorded times; a backdated edit cannot rewrite original evidence", () => {
  const base = {
    country: "GB",
    social: "Alone",
    setup: "Desk",
    interruptions: "Unlikely",
    timezone: "UTC",
  };
  const s = session({
    blueprint: {
      updatedAt: 2,
      environmentHistory: [
        {
          ...base,
          id: "home",
          location: "Home",
          effectiveAt: t,
          recordedAt: t,
        },
        {
          ...base,
          id: "cafe",
          location: "Coffee shop",
          effectiveAt: t + 3600000,
          recordedAt: t + 4000000,
        },
      ],
    },
  });
  assert.equal(environmentAt(s, t + 1800000)?.location, "Home");
  assert.equal(environmentAt(s, t + 3800000, t + 3800000)?.location, "Home");
  assert.equal(environmentAt(s, t + 3800000)?.location, "Coffee shop");
});
test("commitment proximity respects the linked day, overnight windows and the 90-minute boundary", () => {
  const event = {
    id: "commitment",
    category: "Upcoming commitment" as const,
    text: "Meet a friend",
    start: t + 2 * 3600000,
    linkedDay: "2026-10-23",
    timezone: "UTC",
    recordedAt: t,
  };
  const s = session({
    blueprint: {
      updatedAt: t,
      plan: {
        start: "14:30",
        end: "17:00",
        intention: "Observe",
        currency: "USD",
      },
      lifestyle: [event],
    },
  });
  assert.equal(proximityEvents(s).length, 1);
  s.blueprint!.lifestyle![0].start = Date.parse("2026-10-24T16:30:00Z");
  assert.equal(proximityEvents(s).length, 0);
  s.blueprint!.plan!.start = "22:00";
  s.blueprint!.plan!.end = "01:00";
  s.blueprint!.lifestyle![0].start = Date.parse("2026-10-24T02:30:00Z");
  assert.equal(proximityEvents(s).length, 1);
  s.blueprint!.lifestyle![0].start += 1;
  assert.equal(proximityEvents(s).length, 0);
  assert.throws(() => localInstant("2026-11-01T01:30", "America/New_York"));
});
test("quotes reject future, stale, wrong-symbol and malformed measurements", () => {
  const q = {
    price: 100,
    symbol: "MNQ",
    source: "Test source",
    observedAt: t,
    currency: "USD",
  };
  assert.deepEqual(validQuote(q, t, "MNQ"), q);
  assert.equal(validQuote({ ...q, observedAt: t + 1 }, t, "MNQ"), null);
  assert.equal(validQuote(q, t + 10001, "MNQ"), null);
  assert.equal(validQuote(q, t, "NQ"), null);
  assert.equal(validQuote({ ...q, price: NaN }, t, "MNQ"), null);
});
test("per-stage custom vocabularies preserve other stages and allow an empty suggestion list", () => {
  assert.deepEqual(labelsFor("exit", { exit: ["My exit label"] }), [
    "My exit label",
  ]);
  assert.ok(
    labelsFor("entry", { exit: [] }).includes("Following plan / model"),
  );
  assert.deepEqual(labelsFor("exit", { exit: [] }), []);
});
test("weekly rates exclude incomplete or unknown results, deduplicate sessions and isolate owners", () => {
  const s = session();
  assert.equal(weeklyActuals([s, s], s).sessions, 1);
  assert.equal(weeklyActuals([], s).winRate, null);
  assert.equal(
    weeklyActuals([session({ owner: crypto.randomUUID() })], s).sessions,
    1,
  );
  s.events = [
    {
      id: "entry",
      t,
      symbol: "MNQ",
      kind: "entry",
      side: "long",
      quantity: 1,
      price: 100,
      source: "manual",
      currency: "USD",
    },
    {
      id: "exit",
      t: t + 1000,
      symbol: "MNQ",
      kind: "exit",
      side: "long",
      quantity: 1,
      price: 101,
      source: "manual",
      currency: "USD",
      pnl: 2,
    },
  ];
  const actual = weeklyActuals([s], s);
  assert.equal(actual.completed, 1);
  assert.equal(actual.winRate, 100);
  assert.deepEqual(actual.pnl, [["USD", 2]]);
});
test("new context, weekly and capture fields survive API validation and originals remain owner-scoped", async () => {
  const s = session({
    blueprint: {
      updatedAt: t,
      dailyWriting: "A quiet day",
      modules: [{ id: "custom", title: "Settling in", text: "New place" }],
      weeks: {
        "2026-10-19": {
          intentions: "Wait",
          process: "Check the setup",
          response: "Pause",
          plannedAt: t,
          review: "I noticed an urge",
          nextPractice: "Wait again",
          reviewedAt: t + 1000,
        },
      },
    },
    journal: [
      {
        id: "moment",
        t,
        eventTime: null,
        label: "Calm",
        text: "My words",
        captureMode: "post-session",
        capture: {
          pressedAt: t,
          confirmedAt: t + 1000,
          imageMissing: "Not shared",
          quoteMissing: "Not connected",
        },
      },
    ],
  });
  assert.deepEqual(sessionSchema.parse(s), s);
  const file = await keepPrivateFile(
    owner,
    "moment",
    "image",
    new Blob(["original"]),
    s.id,
  );
  assert.equal(await (await privateFile(file.path, owner)).text(), "original");
  await assert.rejects(privateFile(file.path, crypto.randomUUID()));
  await removePrivateFile(file.path, owner);
});
test("current metadata migration keeps newer context when an older client uploads notes and rejects another owner", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema auth;create table pulse_sessions(id uuid primary key,user_id uuid,started_at bigint,data jsonb,updated_at timestamptz);create table pulse_deleted_sessions(id uuid);create table pulse_events(session_id uuid,user_id uuid,data jsonb);",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261025231150_journal_reference_metadata.sql",
        "utf8",
      ),
    );
    const s = session({
      blueprint: { updatedAt: 100, dailyWriting: "Keep this writing" },
    });
    await db.query("select pulse_save_session($1,$2,$3)", [owner, s.id, s]);
    await db.query("select pulse_save_session($1,$2,$3)", [
      owner,
      s.id,
      {
        ...s,
        blueprint: undefined,
        journal: [
          { id: "new", t, label: "Calm", text: "An older client note" },
        ],
      },
    ]);
    const result = (
      await db.query<{ data: Session }>("select data from pulse_sessions")
    ).rows[0].data;
    assert.equal(result.blueprint?.dailyWriting, "Keep this writing");
    assert.equal(result.journal[0].text, "An older client note");
    await assert.rejects(
      db.query("select pulse_save_session($1,$2,$3)", [
        crypto.randomUUID(),
        s.id,
        s,
      ]),
    );
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','pulse_save_session(uuid,uuid,jsonb)','execute') as allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
test("capture recovery discards cleanly and failed saves retain the same origin and identity", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!),
    s = session(),
    attempts: JournalEntry[] = [],
    saved: JournalEntry[] = [];
  let fail = true;
  const props = {
    session: s,
    samples: [],
    baselineSeconds: 300,
    now: Date.now(),
    active: false,
    recording: false,
    onClose() {},
    onReflect() {},
    async onSave(n: JournalEntry) {
      attempts.push(n);
      if (fail) {
        fail = false;
        throw Error("Simulated storage failure");
      }
      saved.push(n);
    },
  };
  const click = async (text: string) => {
    await act(async () => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === text,
      );
      assert.ok(button, text);
      button.click();
    });
  };
  try {
    await act(async () => root.render(createElement(CapturePanel, props)));
    await click("●");
    assert.equal(attempts.length, 0);
    await click("Discard capture");
    assert.equal(saved.length, 0);
    await click("●");
    await click("Retry / save moment");
    assert.equal(saved.length, 0);
    assert.match(document.body.textContent!, /Simulated storage failure/);
    // Ending/changing active state before confirmation cannot relabel the frozen draft.
    await act(async () =>
      root.render(createElement(CapturePanel, { ...props, active: true })),
    );
    await click("Retry / save moment");
    assert.equal(saved.length, 1);
    assert.equal(saved[0].captureMode, "post-session");
    assert.equal(attempts[0].id, attempts[1].id);
    assert.ok(saved[0].capture!.confirmedAt >= saved[0].capture!.pressedAt);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
