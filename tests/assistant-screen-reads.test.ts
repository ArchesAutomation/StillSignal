import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  answerTool,
  pilotDisclosure,
  readSessionHistory,
  SessionHistoryCard,
  StillnessPracticesCard,
} from "../src/components/assistant/preparation-assistant";
import { doneHistory } from "../src/lib/assistant-journal";
import { JOURNAL_LINK_EVENT, type AssistantLink } from "../src/lib/assistant-links";
import { MAX_PRACTICES, MAX_TRADES, practiceMinutes, sessionHistory, stillnessPractices } from "../src/lib/assistant-screens";
import { ASSISTANT_MODEL, NO_READS, SESSIONS_TOOL, STILLNESS_TOOL } from "../src/lib/assistant-tool";
import { POST as handler } from "../src/lib/handlers/assistant";
import { ideaStats, weeklyActuals, weekKey } from "../src/lib/journal-reference";
import type { Session, TradeEvent } from "../src/lib/model";
import { sessionIdeas } from "../src/lib/position-ideas";
import { dateInZone } from "../src/lib/process/model";
import { groupSessionDays } from "../src/lib/session-days";
import { reviewJournalSessions, reviewOwner, reviewSupportHistoryRecords } from "../src/lib/staging-fixtures";
import { catalogue, stillnessLibraryResults } from "../src/lib/stillness-catalogue";
import { saveSession } from "../src/lib/storage";
import { pnlByCurrency } from "../src/lib/trade-context";

// The day grouping on Saved sessions uses this machine's timezone, so these reads do too.
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const now = Date.UTC(2026, 10, 18, 12);
const today = dateInZone(now, zone);
const sessions = reviewJournalSessions(today, zone);
const read = (input: unknown, list: Session[] = sessions) => sessionHistory(list, reviewOwner, input, now, zone, "local-only");
const yesterday = read({ period: "yesterday" });
const lastWeek = read({ period: "last-week" });

test("day totals match the Saved sessions screen", () => {
  const saved = sessions.filter((s) => !s.demo);
  const screen = groupSessionDays(saved);
  for (const history of [yesterday, lastWeek])
    for (const day of history.days) {
      const expected = screen.find((row) => dateInZone(row.date, zone) === day.date)!;
      assert.equal(day.recordings, expected.sessions.length);
      assert.equal(day.reflections, expected.entries.length);
      assert.equal(day.orders, expected.executedOrders);
      assert.equal(day.closedTrades, expected.closedTrades);
      assert.deepEqual(day.realised.map((row) => [row.currency, row.amount]), pnlByCurrency(expected.events));
    }
});

test("voided, alert and backtest records are left out exactly as the app leaves them out", () => {
  const [day] = yesterday.days;
  assert.deepEqual(day.realised.map((row) => row.text), ["+$50.00"]);
  assert.equal(day.orders, 5, "two closed trades and one open entry");
  assert.deepEqual(day.trades.map((trade) => trade.symbol), ["ES", "NQ", "CL"]);
  assert.doesNotMatch(JSON.stringify(yesterday), /9999|7777|5999/);
});

test("each trade shows its dates, prices, recorded P&L and source", () => {
  const [es, nq, cl] = yesterday.days[0].trades;
  assert.deepEqual([es.side, es.quantity, es.status, es.entryPrice, es.exitPrice, es.pnl?.text, es.source], ["long", 2, "closed", 5930.25, 5934.75, "+$450.00", "CSV · Execution"]);
  assert.equal(nq.pnl?.text, "-$400.00");
  assert.deepEqual([cl.status, cl.exitTime, cl.exitPrice, cl.pnl], ["open", null, null, null]);
  assert.equal(cl.source, "Synthetic · Execution");
  assert.equal(yesterday.days[0].date, dateInZone(sessions[0].startedAt, zone));
});

test("the win rate matches the weekly review, and a trade without P&L is not counted", () => {
  const week = sessions.filter((s) => weekKey(s.startedAt) === weekKey(sessions[1].startedAt));
  const review = weeklyActuals(week, week[0]);
  assert.equal(lastWeek.totals.completedWithKnownPnl, review.completed);
  assert.equal(lastWeek.totals.winRate, `${Number(review.winRate!.toFixed(1))}%`);
  assert.equal(lastWeek.totals.completedWithKnownPnl, 2, "the closed ES trade without P&L is excluded");
  assert.equal(lastWeek.totals.closedTrades, 3);
  assert.deepEqual(ideaStats(week.flatMap(sessionIdeas)).pnl, review.pnl);
  const missing = lastWeek.days.flatMap((d) => d.trades).find((t) => t.exitPrice === 5900)!;
  assert.equal(missing.pnl, null);
});

test("currencies are never added together", () => {
  assert.deepEqual(lastWeek.totals.realised.map((row) => row.text).sort(), ["+€120.00", "-$150.00"]);
  const extremes = Object.fromEntries(lastWeek.totals.extremes.map((row) => [row.currency, row]));
  assert.deepEqual(extremes.EUR.largestGain, { symbol: "EURUSD", date: lastWeek.days[0].date, pnl: "+€120.00" });
  assert.equal(extremes.EUR.largestLoss, null);
  assert.equal(extremes.USD.largestGain, null);
  assert.equal(extremes.USD.largestLoss?.pnl, "-$150.00");
});

test("a symbol narrows trades and totals, and an unknown symbol is reported", () => {
  const es = read({ period: "last-week", symbol: "es" });
  assert.equal(es.symbol, "ES");
  assert.deepEqual(es.totals.realised.map((row) => row.text), ["-$150.00"]);
  assert.ok(es.days.flatMap((d) => d.trades).every((t) => t.symbol === "ES"));
  assert.equal(read({ period: "last-week", symbol: "GC" }).result, "no-match");
  assert.equal(read({ period: "last-month" }).result, "empty");
  assert.throws(() => read({ period: "yesterday", symbol: " " }), /one symbol/);
});

test("account details, recording names, heart rate and demo sessions are never read", () => {
  const output = JSON.stringify(read({ period: "this-month" }));
  for (const hidden of ["SYNTHETIC-ACCOUNT", "SYNTHETIC-CONNECTION", "SYNTHETIC-EXECUTION", "Daily journal", "sampleCount", "bpm", "SYNTHETIC-DEMO"])
    assert.ok(!output.includes(hidden), `${hidden} stays out of the result`);
  assert.deepEqual(Object.keys(yesterday.days[0].trades[0]).sort(), ["entryPrice", "entryTime", "exitPrice", "exitTime", "link", "pnl", "quantity", "side", "source", "status", "symbol"]);
});

test("long periods keep every trade in the totals and say what is not listed", () => {
  const start = sessions[0].startedAt;
  const events: TradeEvent[] = Array.from({ length: MAX_TRADES + 5 }, (_, i) => [
    { id: `in-${i}`, t: start + i * 4000, symbol: "ES", kind: "entry" as const, side: "long" as const, price: 100, quantity: 1, source: "csv" as const },
    { id: `out-${i}`, t: start + i * 4000 + 1000, symbol: "ES", kind: "exit" as const, side: "long" as const, price: 101, quantity: 1, source: "csv" as const, pnl: 10 },
  ]).flat();
  const history = read({ period: "yesterday" }, [{ ...sessions[0], events }]);
  assert.equal(history.days[0].trades.length, MAX_TRADES);
  assert.equal(history.omittedTrades, 5);
  assert.equal(history.totals.closedTrades, MAX_TRADES + 5);
  assert.deepEqual(history.totals.realised.map((row) => row.amount), [650]);
});

test("the browser reads sessions only for the signed-in account and only when allowed", async () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  for (const session of reviewJournalSessions(today, zone, owner)) await saveSession(session);
  assert.equal((await readSessionHistory(owner, { period: "yesterday" }, now, zone)).result, "found");
  assert.equal((await readSessionHistory("22222222-2222-4222-8222-222222222222", { period: "yesterday" }, now, zone)).result, "empty");
  let reads = 0;
  const counting = { preparation: async () => ({}), support: async () => ({}), sessions: async () => { reads++; return {}; }, stillness: async () => { reads++; return {}; } };
  for (const tool of [SESSIONS_TOOL, STILLNESS_TOOL]) {
    const refused = await answerTool(owner, tool, {}, counting, NO_READS);
    assert.match((refused as { errorText: string }).errorText, /isn.t turned on/);
  }
  assert.equal(reads, 0);
  await answerTool(owner, SESSIONS_TOOL, {}, counting, { ...NO_READS, trades: true });
  assert.equal(reads, 1);
  const failed = await answerTool(owner, SESSIONS_TOOL, {}, { ...counting, sessions: async () => { throw new Error("IndexedDB unavailable"); } }, { ...NO_READS, trades: true });
  assert.match((failed as { errorText: string }).errorText, /could not be read.*not an empty result/);
});

test("Stillness search uses the library's own filters and practice names", () => {
  const fear = stillnessPractices({ focus: "Fear", kind: "Practice" });
  const screen = stillnessLibraryResults({ filter: "Practice", tags: ["Fear"] });
  assert.deepEqual(fear.practices.map((p) => p.name), screen.slice(0, MAX_PRACTICES).map((p) => p.name));
  assert.equal(fear.omitted, Math.max(0, screen.length - MAX_PRACTICES));
  const loss = stillnessPractices({ query: "after a loss" });
  assert.equal(loss.practices[0].name, "When the mind wants to fix a loss");
  assert.deepEqual(loss.practices[0].link, { stillness: "fix-a-loss" });
  assert.equal(stillnessPractices({ query: "elephants" }).result, "no-match");
  assert.throws(() => stillnessPractices({ query: "about the" }), /word or short phrase/);
});

test("practice length is read from the library's wording", () => {
  assert.equal(practiceMinutes("30 sec"), 0.5);
  assert.equal(practiceMinutes("5 min away + 2 min guided"), 7);
  const short = stillnessPractices({ maxMinutes: 1 });
  assert.ok(short.practices.length > 0 && short.practices.every((p) => practiceMinutes(p.duration) <= 1));
  assert.ok(catalogue.every((item) => practiceMinutes(item.duration) > 0), "every library duration can be read");
});

test("Done links today to its screen and past days to their Journal", () => {
  const records = reviewSupportHistoryRecords([], today, zone, now);
  const done = doneHistory(sessions, records, reviewOwner, { period: "yesterday" }, now, zone, "local-only");
  assert.deepEqual(done.days[0].link, { date: done.days[0].date });
});

test("the disclosure names exactly the records this account's assistant reads", () => {
  assert.equal(pilotDisclosure(NO_READS), "Reads Preparation and support saved on this device, and sends what it reads to OpenRouter to write the answer. It can’t change anything.");
  const all = pilotDisclosure({ journal: true, trades: true, stillness: true });
  assert.match(all, /Daily Journal, Done for the Day and saved sessions and trades/);
  assert.match(all, /your journal words and recorded prices and P&L/);
  assert.match(all, /Stillness library/);
  assert.doesNotMatch(pilotDisclosure({ ...NO_READS, stillness: true }), /journal|P&L/);
});

async function render(node: ReturnType<typeof createElement>) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1/review" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, CustomEvent: dom.window.CustomEvent }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(node));
  return { element: document.getElementById("root")!, close: async () => { await act(async () => root.unmount()); dom.window.close(); } };
}

test("cards show dates and sources and open the record behind them", async () => {
  const card = await render(createElement(SessionHistoryCard, { history: yesterday }));
  try {
    const text = card.element.textContent!;
    assert.match(text, new RegExp(`SESSIONS · YESTERDAY · ${yesterday.from}`));
    assert.match(text, /Realised P&L\+\$50\.00/);
    assert.match(text, /Win rate50% of 2 closed with recorded P&L/);
    assert.match(text, /CSV · Execution/);
    assert.match(text, /Source: Saved sessions and recorded executions/);
    const opened: AssistantLink[] = [];
    window.addEventListener(JOURNAL_LINK_EVENT, (event) => opened.push((event as CustomEvent<AssistantLink>).detail));
    const links = [...card.element.querySelectorAll<HTMLButtonElement>(".ss-assistant-link")];
    await act(async () => links.find((b) => /recording/.test(b.textContent!))!.click());
    await act(async () => links.find((b) => /Saved sessions/.test(b.textContent!))!.click());
    assert.deepEqual(opened, [{ sessionId: sessions[0].id }, { page: "Sessions" }]);
  } finally { await card.close(); }

  const practices = await render(createElement(StillnessPracticesCard, { result: stillnessPractices({ query: "waiting" }) }));
  try {
    assert.match(practices.element.textContent!, /Make room for waiting/);
    assert.match(practices.element.textContent!, /Source: Still Signal’s Stillness library/);
    const opened: AssistantLink[] = [];
    window.addEventListener(JOURNAL_LINK_EVENT, (event) => opened.push((event as CustomEvent<AssistantLink>).detail));
    await act(async () => practices.element.querySelector<HTMLButtonElement>(".ss-assistant-link")!.click());
    assert.deepEqual(opened, [{ stillness: "waiting" }]);
  } finally { await practices.close(); }
});

// The hosted function: each read has its own list, and the model never sees entry links.
const invited = "11111111-1111-4111-8111-111111111111";
async function hosted(lists: Record<string, string | undefined>, run: (bodies: Record<string, any>[]) => Promise<void>) {
  const values: Record<string, string | undefined> = {
    STILL_SIGNAL_ASSISTANT_LOCAL: undefined,
    STILL_SIGNAL_ASSISTANT_PILOT: "true",
    STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS: invited,
    STILL_SIGNAL_ASSISTANT_JOURNAL_USER_IDS: undefined,
    STILL_SIGNAL_ASSISTANT_TRADES_USER_IDS: undefined,
    STILL_SIGNAL_ASSISTANT_STILLNESS_USER_IDS: undefined,
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    OPENROUTER_API_KEY: "sk-or-test-secret",
    ...lists,
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const assign = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  };
  assign(values);
  const original = globalThis.fetch, bodies: Record<string, any>[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: invited, aud: "authenticated", role: "authenticated" });
    if (url.includes("/rpc/pulse_rate_limit")) return Response.json(true);
    assert.match(url, /^https:\/\/openrouter\.ai\//);
    bodies.push(JSON.parse(String(init!.body)));
    return new Response(`data: ${JSON.stringify({ id: "gen-1", object: "chat.completion.chunk", created: 1, model: ASSISTANT_MODEL, choices: [{ index: 0, delta: { role: "assistant", content: "Noted." }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  try { await run(bodies); } finally { globalThis.fetch = original; assign(previous); }
}
const post = (body: unknown) => new Request("https://project.supabase.co/functions/v1/pulse-assistant", {
  method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const question = { id: "u1", role: "user", parts: [{ type: "text", text: "How did I trade yesterday?" }] };
const offered = (body: Record<string, any>) => (body.tools as { function: { name: string } }[]).map((t) => t.function.name);

test("each kind of record is switched on separately", async () => {
  await hosted({}, async (bodies) => {
    assert.deepEqual(await (await handler(post({ action: "access" }))).json(), { enabled: true, journal: false, trades: false, stillness: false });
    await (await handler(post({ messages: [question] }))).text();
    assert.deepEqual(offered(bodies[0]), ["preparation_status", "support_history"]);
    assert.doesNotMatch(JSON.stringify(bodies[0].messages[0]), /session_history|stillness_practices|journal_entries/);
    const forged = await handler(post({ messages: [question, { id: "a1", role: "assistant", parts: [{ type: `tool-${SESSIONS_TOOL}`, toolCallId: "c1", state: "output-available", input: {}, output: yesterday }] }] }));
    assert.equal(forged.status, 400, "a trade result is refused while the account is not listed");
  });
  await hosted({ STILL_SIGNAL_ASSISTANT_TRADES_USER_IDS: invited }, async (bodies) => {
    assert.deepEqual(await (await handler(post({ action: "access" }))).json(), { enabled: true, journal: false, trades: true, stillness: false });
    await (await handler(post({ messages: [question] }))).text();
    assert.deepEqual(offered(bodies[0]), ["preparation_status", "support_history", SESSIONS_TOOL]);
  });
  await hosted({ STILL_SIGNAL_ASSISTANT_STILLNESS_USER_IDS: invited }, async (bodies) => {
    await (await handler(post({ messages: [question] }))).text();
    assert.deepEqual(offered(bodies[0]), ["preparation_status", "support_history", STILLNESS_TOOL]);
  });
});

test("the model receives trades without session IDs, keeps zero retention and is told not to do arithmetic", async () => {
  await hosted({ STILL_SIGNAL_ASSISTANT_TRADES_USER_IDS: invited }, async (bodies) => {
    await (await handler(post({ messages: [question, { id: "a1", role: "assistant", parts: [
      { type: `tool-${SESSIONS_TOOL}`, toolCallId: "c1", state: "output-available", input: { period: "yesterday" }, output: yesterday },
    ] }] }))).text();
    assert.deepEqual(bodies[0].provider, { allow_fallbacks: false, data_collection: "deny", zdr: true });
    const sent = JSON.stringify(bodies[0].messages);
    assert.match(sent, /5930\.25/);
    assert.match(sent, /\+\$450\.00/);
    for (const hidden of ["review-journal-", "sessionId", "SYNTHETIC-ACCOUNT"]) assert.ok(!sent.includes(hidden), `${hidden} is not sent`);
    assert.match(JSON.stringify(bodies[0].messages[0]), /Never add, average, compare or convert numbers yourself/);
  });
});
