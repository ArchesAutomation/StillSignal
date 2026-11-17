import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  answerTool,
  readSupportHistory,
  SupportHistoryCard,
  toThreadMessage,
} from "../src/components/assistant/preparation-assistant";
import { ASSISTANT_MODEL, PREPARATION_TOOL, SUPPORT_HISTORY_TOOL } from "../src/lib/assistant-tool";
import { cloudConfigured } from "../src/lib/cloud";
import { POST as handler } from "../src/lib/handlers/assistant";
import { createRecord, type ProcessRecord } from "../src/lib/process/model";
import { saveProcess } from "../src/lib/process/storage";
import { supportHistory, type SupportHistory } from "../src/lib/process/support-history";
import { emptyTradingDay } from "../src/lib/process/trading-day";
import { reviewSupportHistoryRecords } from "../src/lib/staging-fixtures";

// Wednesday 18 November 2026, 00:30 in Auckland; still Tuesday 17 November in UTC.
const auckland = "Pacific/Auckland";
const nowAuckland = Date.UTC(2026, 10, 17, 11, 30);
const today = "2026-11-18";

const day = (date: string, timezone: string, body: object = {}) =>
  createRecord("day", { ...emptyTradingDay(date, timezone), ...body }, undefined, [], nowAuckland);

test("the local date boundary decides which saved day is yesterday", () => {
  const records = [
    day("2026-11-17", auckland, { supportFocuses: ["fear"] }),
    day("2026-11-16", auckland, { supportFocuses: ["greed"] }),
    // Same calendar date, saved in another timezone: the app's day lookup does not match it.
    day("2026-11-17", "UTC", { supportFocuses: ["impulsiveness"] }),
  ];
  const nz = supportHistory(records, { period: "yesterday" }, nowAuckland, auckland, "local-only");
  assert.equal(nz.from, "2026-11-17", "UTC still says the 17th is today; Auckland's yesterday is the 17th");
  assert.deepEqual(nz.days[0].homeFocus, ["Fear"]);

  const la = "America/Los_Angeles";
  const laHistory = supportHistory(
    [day("2026-11-15", la, { supportFocuses: ["greed"] })],
    { period: "yesterday" },
    Date.UTC(2026, 10, 17, 6, 0), // 22:00 on 16 November in Los Angeles
    la,
    "local-only",
  );
  assert.equal(laHistory.from, "2026-11-15");
  assert.deepEqual(laHistory.days[0].homeFocus, ["Greed"]);
});

const seeded = reviewSupportHistoryRecords([], today, auckland, nowAuckland);

test("yesterday separates multiple Home focuses from Preparation and Done practices, without completion", () => {
  assert.ok(
    seeded.every((record) => record.kind === "day" || record.kind === "checkin"),
    "only days and arrival check-ins; no completion event exists",
  );
  assert.deepEqual(reviewSupportHistoryRecords(seeded, today, auckland, nowAuckland), [], "existing days are kept");
  const history = supportHistory(seeded, { period: "yesterday" }, nowAuckland, auckland, "local-only");
  assert.equal(history.result, "found");
  assert.equal(history.completion, "not-recorded");
  assert.deepEqual(history.days, [{
    date: "2026-11-17",
    weekday: "Tuesday",
    saved: true,
    homeFocus: ["Impatience", "Fear"],
    preparation: [{ title: "Make room for waiting", kind: "Sequence" }],
    done: [{ title: "Open awareness", kind: "Practice" }],
  }]);
});

test("last week lists saved, support-free and empty days", () => {
  const history = supportHistory(seeded, { period: "last-week" }, nowAuckland, auckland, "local-only");
  assert.equal(history.result, "found");
  assert.deepEqual([history.from, history.to], ["2026-11-09", "2026-11-15"]);
  const byDay = Object.fromEntries(history.days.map((d) => [d.weekday, d]));
  assert.deepEqual(byDay.Monday.homeFocus, ["Impulsiveness"]);
  assert.deepEqual(byDay.Monday.preparation, [{ title: "Back to the room", kind: "Practice" }]);
  assert.deepEqual(byDay.Wednesday.homeFocus, ["Greed"]);
  assert.equal(byDay.Thursday.done[0].kind, "Step of Leave the result here");
  assert.deepEqual([byDay.Friday.saved, byDay.Friday.homeFocus, byDay.Friday.preparation], [true, [], []]);
  for (const name of ["Tuesday", "Saturday", "Sunday"]) assert.equal(byDay[name].saved, false);

  const empty = supportHistory([], { period: "last-week" }, nowAuckland, auckland, "local-only");
  assert.equal(empty.result, "empty");
  assert.ok(empty.days.every((d) => !d.saved));
});

async function render(node: ReturnType<typeof createElement>) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1/review" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(node));
  const element = document.getElementById("root")!;
  return { element, close: async () => { await act(async () => root.unmount()); dom.window.close(); } };
}

test("the card shows dates, only saved fields, and says completion is not recorded", async () => {
  const week = supportHistory(seeded, { period: "last-week" }, nowAuckland, auckland, "local-only");
  const card = await render(createElement(SupportHistoryCard, { history: week }));
  try {
    const text = card.element.textContent!;
    assert.match(text, /SUPPORT · LAST WEEK · 2026-11-09 to 2026-11-15/);
    const monday = card.element.querySelector('[data-support-day="2026-11-09"]')!;
    assert.deepEqual([...monday.querySelectorAll("dt")].map((dt) => dt.textContent), ["Chosen on Home", "Added to Preparation"]);
    assert.match(monday.textContent!, /Back to the room \(Practice\)/);
    assert.match(card.element.querySelector('[data-support-day="2026-11-10"]')!.textContent!, /Nothing saved\./);
    assert.match(card.element.querySelector('[data-support-day="2026-11-13"]')!.textContent!, /Day saved · no support chosen\./);
    assert.match(text, /doesn’t record whether a practice was completed/);
    assert.doesNotMatch(text, /No support was saved/);
  } finally { await card.close(); }

  const empty: SupportHistory = { ...supportHistory([], { period: "yesterday" }, nowAuckland, auckland, "not-checked") };
  const emptyCard = await render(createElement(SupportHistoryCard, { history: empty }));
  try {
    assert.match(emptyCard.element.textContent!, /No support was saved for these dates\./);
    assert.match(emptyCard.element.textContent!, /Days saved on another device may be missing\./);
  } finally { await emptyCard.close(); }
});

test("a read failure is reported as an error, not as an empty result", async () => {
  const failing = {
    preparation: async () => { throw new Error("IndexedDB unavailable"); },
    support: async () => { throw new Error("IndexedDB unavailable"); },
  };
  const support = await answerTool("owner", SUPPORT_HISTORY_TOOL, { range: "yesterday" }, failing as never);
  assert.deepEqual(support && "state" in support && support.state, "output-error");
  assert.match((support as { errorText: string }).errorText, /could not be read.*not an empty result/);
  const prep = await answerTool("owner", PREPARATION_TOOL, {}, failing as never);
  assert.match((prep as { errorText: string }).errorText, /Preparation could not be read/);
  const range = await answerTool("owner", SUPPORT_HISTORY_TOOL, { range: "last-month" });
  assert.match((range as { errorText: string }).errorText, /isn.t supported/);
  assert.equal(await answerTool("owner", "unknown_tool", {}), undefined);

  const message = toThreadMessage({
    id: "a1",
    role: "assistant",
    parts: [{ type: `tool-${SUPPORT_HISTORY_TOOL}`, toolCallId: "c1", state: "output-error", input: { range: "yesterday" }, errorText: "Saved support could not be read." }],
  } as never);
  const part = (message.content as readonly { isError?: boolean; result?: unknown }[])[0];
  assert.equal(part.isError, true);
  assert.equal(part.result, "Saved support could not be read.");
});

test("the browser read covers only the signed-in account", async () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  await saveProcess(owner, reviewSupportHistoryRecords([], today, auckland, nowAuckland), false);
  await saveProcess(other, [day("2026-11-17", auckland, {
    supportFocuses: ["greed"],
    stillness: [{ id: crypto.randomUUID(), itemId: "enough", destination: "Done" }],
  }) as ProcessRecord], false);

  const mine = await readSupportHistory(owner, { period: "yesterday" }, nowAuckland, auckland);
  assert.deepEqual(mine.days[0].homeFocus, ["Impatience", "Fear"]);
  assert.deepEqual(mine.days[0].done.map((p) => p.title), ["Open awareness"]);
  assert.equal(mine.sync, cloudConfigured ? "not-checked" : "local-only");

  const theirs = await readSupportHistory(other, { period: "yesterday" }, nowAuckland, auckland);
  assert.deepEqual(theirs.days[0].homeFocus, ["Greed"]);
  assert.deepEqual(theirs.days[0].done.map((p) => p.title), ["Enough is a choice"]);

  const nobody = await readSupportHistory("33333333-3333-4333-8333-333333333333", { period: "last-week" }, nowAuckland, auckland);
  assert.equal(nobody.result, "empty");
});

// Edge Function: the model is offered the tool with a fixed period and the follow-up keeps context.
const local = { STILL_SIGNAL_ASSISTANT_LOCAL: "true", SUPABASE_URL: "http://kong:8000", OPENROUTER_API_KEY: "sk-or-test-secret" };
async function withLocal(reply: () => Response, run: (bodies: Record<string, unknown>[]) => Promise<void>) {
  const env = Object.fromEntries(Object.keys(local).map((key) => [key, process.env[key]]));
  Object.assign(process.env, local);
  const original = globalThis.fetch, bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.match(String(url), /^https:\/\/openrouter\.ai\/api\/v1\//);
    bodies.push(JSON.parse(String(init!.body)));
    return reply();
  }) as typeof fetch;
  try { await run(bodies); } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
const sse = (events: unknown[]) => new Response(
  events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n",
  { headers: { "Content-Type": "text/event-stream" } },
);
const chunk = (delta: object, finish: string | null = null) =>
  ({ id: "gen-1", object: "chat.completion.chunk", created: 1, model: ASSISTANT_MODEL, choices: [{ index: 0, delta, finish_reason: finish }] });
const ask = (messages: unknown[]) => new Request("http://kong:8000/functions/v1/pulse-assistant", { method: "POST", body: JSON.stringify({ messages }) });

test("the Edge Function offers support_history with a fixed period and leaves it to the browser", async () => {
  await withLocal(() => sse([
    chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: SUPPORT_HISTORY_TOOL, arguments: '{"period":"yesterday"}' } }] }, "tool_calls"),
  ]), async (bodies) => {
    const text = await (await handler(ask([{ id: "u1", role: "user", parts: [{ type: "text", text: "What support did I choose yesterday?" }] }]))).text();
    const tools = bodies[0].tools as { function: { name: string; parameters: { properties: Record<string, { enum?: string[] }> } } }[];
    const support = tools.find((t) => t.function.name === SUPPORT_HISTORY_TOOL)!;
    assert.deepEqual(support.function.parameters.properties.period.enum, ["today", "yesterday", "this-week", "last-week", "this-month", "last-month"]);
    assert.equal(support.function.parameters.properties.range, undefined);
    assert.match(text, /"type":"tool-input-available"[^\n]*"toolName":"support_history"[^\n]*"period":"yesterday"/);
    assert.doesNotMatch(text, /tool-output-available/);
  });
});

test("a follow-up sends the earlier support answer so the model can keep the topic", async () => {
  const history = supportHistory(seeded, { period: "yesterday" }, nowAuckland, auckland, "local-only");
  await withLocal(() => sse([
    chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_2", type: "function", function: { name: SUPPORT_HISTORY_TOOL, arguments: '{"period":"last-week"}' } }] }, "tool_calls"),
  ]), async (bodies) => {
    const response = await handler(ask([
      { id: "u1", role: "user", parts: [{ type: "text", text: "What support did I choose yesterday?" }] },
      { id: "a1", role: "assistant", parts: [
        { type: `tool-${SUPPORT_HISTORY_TOOL}`, toolCallId: "call_1", state: "output-available", input: { period: "yesterday" }, output: history },
        { type: "text", text: "On Tuesday 2026-11-17 you chose Impatience and Fear on Home." },
      ] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "And last week?" }] },
    ]));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /"period":"last-week"/);
    const sent = JSON.stringify(bodies[0].messages);
    assert.match(sent, /support_history/, "the earlier tool call is in the conversation");
    assert.match(sent, /Impatience/, "the earlier tool result is in the conversation");
    const system = (bodies[0].messages as { role: string; content: string | { text: string }[] }[])[0];
    assert.equal(system.role, "system");
    const instructions = typeof system.content === "string" ? system.content : system.content.map((p) => p.text).join("");
    assert.match(instructions, /And last week\?.*same tool as before with the new period/);
    assert.match(instructions, /If only the topic changes.*period from the trader's previous question/);
    assert.match(instructions, /Never work out dates yourself/);
    assert.match(instructions, /completion wasn't recorded/);
    assert.match(instructions, /Use preparation_status for preparation, arrival, intention or boundary/, "Preparation questions keep their tool");
  });
});
