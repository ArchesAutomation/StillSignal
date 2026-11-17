import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  answerTool,
  PreparationHistoryCard,
  readPreparation,
  readSupportHistory,
} from "../src/components/assistant/preparation-assistant";
import { ASSISTANT_MODEL, PREPARATION_TOOL, SUPPORT_HISTORY_TOOL } from "../src/lib/assistant-tool";
import { POST as handler } from "../src/lib/handlers/assistant";
import { createRecord, dateInZone } from "../src/lib/process/model";
import { PeriodError, resolvePeriod } from "../src/lib/process/periods";
import {
  preparationForPeriod,
  preparationStatus,
  type PreparationHistory,
} from "../src/lib/process/preparation-status";
import { saveProcess } from "../src/lib/process/storage";
import { supportHistory } from "../src/lib/process/support-history";
import { emptyTradingDay } from "../src/lib/process/trading-day";
import { reviewSupportHistoryRecords } from "../src/lib/staging-fixtures";

const range = (input: unknown, today: string) => {
  const { label, from, to, dates } = resolvePeriod(input, today);
  return { label, from, to, days: dates.length };
};
const refuses = (input: unknown, today: string, message: RegExp) =>
  assert.throws(() => resolvePeriod(input, today), (error) => error instanceof PeriodError && message.test(error.message));

test("named periods resolve to local calendar dates; last week is Monday to Sunday and this period ends today", () => {
  const wednesday = "2026-11-18";
  assert.deepEqual(range({}, wednesday), { label: "Today", from: wednesday, to: wednesday, days: 1 });
  assert.deepEqual(range({ period: "today" }, wednesday), { label: "Today", from: wednesday, to: wednesday, days: 1 });
  assert.deepEqual(range({ period: "yesterday" }, wednesday), { label: "Yesterday", from: "2026-11-17", to: "2026-11-17", days: 1 });
  assert.deepEqual(range({ period: "this-week" }, wednesday), { label: "This week", from: "2026-11-16", to: wednesday, days: 3 });
  assert.deepEqual(range({ period: "last-week" }, wednesday), { label: "Last week", from: "2026-11-09", to: "2026-11-15", days: 7 });
  assert.deepEqual(range({ period: "this-month" }, wednesday), { label: "This month", from: "2026-11-01", to: wednesday, days: 18 });
  assert.deepEqual(range({ period: "last-month" }, wednesday), { label: "Last month", from: "2026-10-01", to: "2026-10-31", days: 31 });

  assert.deepEqual(range({ period: "this-week" }, "2026-11-16"), { label: "This week", from: "2026-11-16", to: "2026-11-16", days: 1 }, "Monday");
  assert.deepEqual(range({ period: "last-week" }, "2026-11-16"), { label: "Last week", from: "2026-11-09", to: "2026-11-15", days: 7 }, "Monday");
  assert.deepEqual(range({ period: "this-week" }, "2026-11-22"), { label: "This week", from: "2026-11-16", to: "2026-11-22", days: 7 }, "Sunday");
  assert.deepEqual(range({ period: "last-week" }, "2026-11-22"), { label: "Last week", from: "2026-11-09", to: "2026-11-15", days: 7 }, "Sunday");
});

test("month and year boundaries", () => {
  assert.deepEqual(range({ period: "last-month" }, "2026-12-01"), { label: "Last month", from: "2026-11-01", to: "2026-11-30", days: 30 });
  assert.deepEqual(range({ period: "this-month" }, "2026-12-01"), { label: "This month", from: "2026-12-01", to: "2026-12-01", days: 1 });
  assert.deepEqual(range({ period: "yesterday" }, "2027-01-01"), { label: "Yesterday", from: "2026-12-31", to: "2026-12-31", days: 1 });
  assert.deepEqual(range({ period: "last-month" }, "2027-01-01"), { label: "Last month", from: "2026-12-01", to: "2026-12-31", days: 31 });
  assert.deepEqual(range({ period: "last-week" }, "2027-01-01"), { label: "Last week", from: "2026-12-21", to: "2026-12-27", days: 7 });
  assert.deepEqual(range({ period: "last-month" }, "2027-03-15"), { label: "Last month", from: "2027-02-01", to: "2027-02-28", days: 28 });
});

test("weekdays, days of a month and explicit dates are the most recent on or before today", () => {
  const wednesday = "2026-11-18";
  assert.deepEqual(range({ weekday: "monday" }, wednesday), { label: "Monday", from: "2026-11-16", to: "2026-11-16", days: 1 });
  assert.deepEqual(range({ weekday: "wednesday" }, wednesday), { label: "Wednesday", from: wednesday, to: wednesday, days: 1 }, "today counts");
  assert.deepEqual(range({ weekday: "friday" }, wednesday), { label: "Friday", from: "2026-11-13", to: "2026-11-13", days: 1 });
  assert.deepEqual(range({ weekday: "monday", which: "last" }, wednesday), { label: "Last Monday", from: "2026-11-09", to: "2026-11-09", days: 1 });
  assert.deepEqual(range({ weekday: "sunday", which: "last" }, wednesday), { label: "Last Sunday", from: "2026-11-15", to: "2026-11-15", days: 1 });
  assert.deepEqual(range({ weekday: "tuesday", which: "this" }, wednesday), { label: "This Tuesday", from: "2026-11-17", to: "2026-11-17", days: 1 });
  refuses({ weekday: "friday", which: "this" }, wednesday, /Friday this week hasn’t happened yet/);

  assert.deepEqual(range({ monthDay: "11-12" }, wednesday), { label: "12 November", from: "2026-11-12", to: "2026-11-12", days: 1 });
  assert.deepEqual(range({ monthDay: "12-25" }, wednesday), { label: "25 December", from: "2025-12-25", to: "2025-12-25", days: 1 }, "last year's");
  assert.deepEqual(range({ monthDay: "11-18" }, wednesday).from, wednesday);
  refuses({ monthDay: "02-30" }, wednesday, /within the last year/);
  refuses({ monthDay: "02-29" }, wednesday, /within the last year/);
  assert.equal(range({ monthDay: "02-29" }, "2028-03-01").from, "2028-02-29", "leap year");

  assert.deepEqual(range({ date: "2026-11-12" }, wednesday), { label: "12 November", from: "2026-11-12", to: "2026-11-12", days: 1 });
  assert.equal(range({ date: "2025-11-17" }, wednesday).from, "2025-11-17", "366 days back is allowed");
});

test("future, too old, too long and unsupported periods are refused", () => {
  const today = "2026-11-18";
  refuses({ date: "2026-11-19" }, today, /in the future/);
  refuses({ date: "2025-11-16" }, today, /last year at most/);
  refuses({ date: "2026-02-30" }, today, /isn't recognised/);
  refuses({ period: "next-week" }, today, /isn't supported/);
  refuses({ range: "yesterday" }, today, /isn't supported/);
  refuses("yesterday", today, /isn't supported/);
  refuses({ period: "yesterday", weekday: "monday" }, today, /one period at a time/);
  refuses({ which: "last" }, today, /only applies to a weekday/);
  refuses({ weekday: "someday" }, today, /isn't recognised/);
});

test("the local date boundary and daylight-saving change use the screens' day timezone", () => {
  // Auckland is already on the 18th while UTC is still on the 17th.
  const auckland = preparationForPeriod([], { period: "yesterday" }, Date.UTC(2026, 10, 17, 11, 30), "Pacific/Auckland", "local-only");
  assert.equal((auckland as PreparationHistory).from, "2026-11-17");
  // London leaves summer time on Sunday 25 October 2026.
  assert.equal(dateInZone(Date.UTC(2026, 9, 24, 23, 30), "Europe/London"), "2026-10-25", "00:30 BST");
  assert.equal(dateInZone(Date.UTC(2026, 9, 25, 23, 30), "Europe/London"), "2026-10-25", "23:30 GMT");
  const afterChange = preparationForPeriod([], { period: "yesterday" }, Date.UTC(2026, 9, 26, 0, 30), "Europe/London", "local-only");
  assert.equal((afterChange as PreparationHistory).from, "2026-10-25");
  const week = preparationForPeriod([], { period: "last-week" }, Date.UTC(2026, 9, 28, 12), "Europe/London", "local-only") as PreparationHistory;
  assert.deepEqual([week.from, week.to, week.days.length], ["2026-10-19", "2026-10-25", 7]);
});

const zone = "Pacific/Auckland";
const now = Date.UTC(2026, 10, 17, 11, 30); // Wednesday 18 November in Auckland
const seeded = reviewSupportHistoryRecords([], "2026-11-18", zone, now);

test("no period, or today, is exactly today's Preparation screen", () => {
  const today = preparationStatus(seeded, "2026-11-18", zone);
  assert.deepEqual(preparationForPeriod(seeded, {}, now, zone, "local-only"), today);
  assert.deepEqual(preparationForPeriod(seeded, { period: "today" }, now, zone, "local-only"), today);
  assert.deepEqual(preparationForPeriod(seeded, { weekday: "wednesday" }, now, zone, "local-only"), today);
});

test("Preparation for a past period keeps saved, empty and missing days apart", () => {
  const week = preparationForPeriod(seeded, { period: "last-week" }, now, zone, "local-only") as PreparationHistory;
  assert.equal(week.result, "found");
  const byDay = Object.fromEntries(week.days.map((d) => [d.weekday, d]));
  assert.deepEqual(byDay.Monday.arrival, ["Settled", "Uncertain"]);
  assert.equal(byDay.Monday.intention, "Enter only after a pullback to the level.");
  assert.equal(byDay.Monday.boundary, "Stop after three trades.");
  assert.deepEqual(byDay.Monday.homeFocus, ["Impulsiveness"]);
  assert.deepEqual(byDay.Monday.support.map((s) => s.title), ["Back to the room"]);
  assert.deepEqual([byDay.Wednesday.boundary, byDay.Wednesday.intention], ["No trades in the last half hour.", ""]);
  assert.deepEqual([byDay.Thursday.recorded, byDay.Thursday.support], [true, []], "a Done practice is not Preparation support");
  assert.equal(byDay.Friday.intention, "Trade only the opening range.");
  for (const name of ["Tuesday", "Saturday", "Sunday"]) assert.equal(byDay[name].recorded, false);

  const yesterday = preparationForPeriod(seeded, { period: "yesterday" }, now, zone, "local-only") as PreparationHistory;
  assert.deepEqual([yesterday.days[0].arrival, yesterday.days[0].intention], [["Tired"], "Let the first setup pass if it feels rushed."]);

  const month = preparationForPeriod(seeded, { period: "last-month" }, now, zone, "local-only") as PreparationHistory;
  assert.equal(month.days.length, 31);
  assert.deepEqual(month.days.filter((d) => d.recorded).map((d) => [d.date, d.intention]), [["2026-10-22", "Sit out the first ten minutes."]]);

  assert.equal((preparationForPeriod([], { period: "last-week" }, now, zone, "local-only") as PreparationHistory).result, "empty");
  const otherZone = [createRecord("day", { ...emptyTradingDay("2026-11-17", "UTC"), goal: "Saved elsewhere." })];
  assert.equal((preparationForPeriod(otherZone, { period: "yesterday" }, now, zone, "local-only") as PreparationHistory).result, "empty",
    "a day saved under another timezone is not matched, as on the screens");
});

test("support history accepts the same periods", () => {
  const month = supportHistory(seeded, { period: "this-month" }, now, zone, "local-only");
  assert.deepEqual([month.label, month.from, month.to, month.days.length, month.result], ["This month", "2026-11-01", "2026-11-18", 18, "found"]);
  const lastMonth = supportHistory(seeded, { period: "last-month" }, now, zone, "local-only");
  assert.deepEqual(lastMonth.days.filter((d) => d.homeFocus.length).map((d) => [d.date, d.homeFocus]), [["2026-10-22", ["Fear"]]]);
  const day = supportHistory(seeded, { monthDay: "11-12" }, now, zone, "local-only");
  assert.deepEqual([day.label, day.days[0].weekday, day.days[0].done.map((p) => p.kind)], ["12 November", "Thursday", ["Step of Leave the result here"]]);
});

test("the Preparation range card shows dates and only saved fields", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1/review" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  try {
    const week = preparationForPeriod(seeded, { period: "last-week" }, now, zone, "local-only") as PreparationHistory;
    await act(async () => root.render(createElement(PreparationHistoryCard, { history: week })));
    const card = document.getElementById("root")!;
    assert.match(card.textContent!, /PREPARATION · LAST WEEK · 2026-11-09 to 2026-11-15/);
    const monday = card.querySelector('[data-preparation-day="2026-11-09"]')!;
    assert.deepEqual([...monday.querySelectorAll("dt")].map((dt) => dt.textContent),
      ["Arriving", "Intention", "Boundary", "Support you chose on Home", "Stillness support for Preparation"]);
    assert.deepEqual([...card.querySelectorAll('[data-preparation-day="2026-11-11"] dt')].map((dt) => dt.textContent), ["Boundary", "Support you chose on Home"]);
    assert.match(card.querySelector('[data-preparation-day="2026-11-12"]')!.textContent!, /Day saved · nothing recorded in Preparation\./);
    assert.match(card.querySelector('[data-preparation-day="2026-11-10"]')!.textContent!, /Nothing saved\./);

    const empty = preparationForPeriod([], { weekday: "monday", which: "last" }, now, zone, "not-checked") as PreparationHistory;
    await act(async () => root.render(createElement(PreparationHistoryCard, { history: empty })));
    assert.match(card.textContent!, /PREPARATION · LAST MONDAY · 2026-11-09/);
    assert.match(card.textContent!, /No Preparation was saved for these dates\./);
    assert.match(card.textContent!, /Days saved on another device may be missing\./);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("browser reads stay within the account, and a refused period is not a read failure", async () => {
  const owner = "44444444-4444-4444-8444-444444444444";
  const other = "55555555-5555-4555-8555-555555555555";
  await saveProcess(owner, seeded, false);
  await saveProcess(other, [createRecord("day", { ...emptyTradingDay("2026-11-09", zone), goal: "Another account's intention." })], false);

  const mine = await readPreparation(owner, { weekday: "monday", which: "last" }, now, zone) as PreparationHistory;
  assert.equal(mine.days[0].intention, "Enter only after a pullback to the level.");
  const theirs = await readPreparation(other, { weekday: "monday", which: "last" }, now, zone) as PreparationHistory;
  assert.equal(theirs.days[0].intention, "Another account's intention.");
  assert.equal((await readSupportHistory(other, { period: "last-week" }, now, zone)).result, "empty");

  await assert.rejects(readPreparation(owner, { date: "2030-01-01" }, now, zone), PeriodError);
  const refused = await answerTool(owner, PREPARATION_TOOL, { date: "2999-01-01" });
  assert.match((refused as { errorText: string }).errorText, /in the future/);
  const failed = await answerTool(owner, PREPARATION_TOOL, {}, {
    preparation: async () => { throw new Error("IndexedDB unavailable"); },
    support: async () => { throw new Error("IndexedDB unavailable"); },
  } as never);
  assert.match((failed as { errorText: string }).errorText, /could not be read.*not an empty result/);
});

const local = { STILL_SIGNAL_ASSISTANT_LOCAL: "true", SUPABASE_URL: "http://kong:8000", OPENROUTER_API_KEY: "sk-or-test-secret" };
test("both tools offer only the period fields to the model and stay browser-answered", async () => {
  const env = Object.fromEntries(Object.keys(local).map((key) => [key, process.env[key]]));
  Object.assign(process.env, local);
  const original = globalThis.fetch;
  let body: { tools: { function: { name: string; parameters: { properties: Record<string, { enum?: string[] }>; additionalProperties?: boolean } } }[] } | undefined;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init!.body));
    const event = { id: "gen-1", object: "chat.completion.chunk", created: 1, model: ASSISTANT_MODEL,
      choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: PREPARATION_TOOL, arguments: '{"weekday":"monday"}' } }] }, finish_reason: "tool_calls" }] };
    return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  try {
    const response = await handler(new Request("http://kong:8000/functions/v1/pulse-assistant", {
      method: "POST",
      body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "What was my intention on Monday?" }] }] }),
    }));
    const text = await response.text();
    for (const name of [PREPARATION_TOOL, SUPPORT_HISTORY_TOOL]) {
      const tool = body!.tools.find((t) => t.function.name === name)!;
      assert.deepEqual(Object.keys(tool.function.parameters.properties).sort(), ["date", "monthDay", "period", "weekday", "which"]);
      assert.equal(tool.function.parameters.additionalProperties, false);
      assert.deepEqual(tool.function.parameters.properties.weekday.enum?.length, 7);
    }
    assert.match(text, /"toolName":"preparation_status"[^\n]*"weekday":"monday"/);
    assert.doesNotMatch(text, /tool-output-available/);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("explicit day-of-month and full-date requests pass the handler's schema, live and in history", async () => {
  const env = Object.fromEntries(Object.keys(local).map((key) => [key, process.env[key]]));
  Object.assign(process.env, local);
  const original = globalThis.fetch;
  let args = "";
  globalThis.fetch = (async () => {
    const event = { id: "gen-1", object: "chat.completion.chunk", created: 1, model: ASSISTANT_MODEL,
      choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_9", type: "function", function: { name: SUPPORT_HISTORY_TOOL, arguments: args } }] }, finish_reason: "tool_calls" }] };
    return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  const ask = (messages: unknown[]) => handler(new Request("http://kong:8000/f", { method: "POST", body: JSON.stringify({ messages }) }));
  const user = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] });
  try {
    for (const [input, question] of [
      [{ monthDay: "11-12" }, "What support did I choose on 12 November?"],
      [{ date: "2026-11-12" }, "What support did I choose on 12 November 2026?"],
    ] as const) {
      args = JSON.stringify(input);
      const text = await (await ask([user("u1", question)])).text();
      assert.match(text, new RegExp(`"type":"tool-input-available"[^\n]*${JSON.stringify(input).slice(1, -1).replace(/[{}]/g, "")}`), question);
      assert.doesNotMatch(text, /tool-input-error|"type":"error"/, question);

      // The same call, answered by the browser, must validate when it comes back as history.
      const history = supportHistory(seeded, input, now, zone, "local-only");
      args = '{"period":"last-week"}';
      const followUp = await ask([
        user("u1", question),
        { id: "a1", role: "assistant", parts: [{ type: `tool-${SUPPORT_HISTORY_TOOL}`, toolCallId: "call_9", state: "output-available", input, output: history }] },
        user("u2", "And last week?"),
      ]);
      assert.equal(followUp.status, 200, `history with ${JSON.stringify(input)} is accepted`);
      assert.match(await followUp.text(), /"type":"tool-input-available"[^\n]*"period":"last-week"/);
    }
    args = '{"monthDay":"12th"}';
    assert.match(await (await ask([user("u1", "x")])).text(), /tool-input-error/, "a malformed monthDay is still refused");
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
