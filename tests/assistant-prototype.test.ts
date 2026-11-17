import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { PreparationStatusCard } from "../src/components/assistant/preparation-assistant";
import ReadingRoomPreparation from "../src/components/concept/reading-room-preparation";
import { POST as route } from "../src/app/api/assistant/route";
import { ASSISTANT_MODEL, PREPARATION_TOOL, SUPPORT_HISTORY_TOOL } from "../src/lib/assistant-tool";
import { APICallError } from "ai";
import { POST as handler, providerMessage } from "../src/lib/handlers/assistant";
import { dateInZone } from "../src/lib/process/model";
import { preparationStatus } from "../src/lib/process/preparation-status";
import { reviewPreparationRecords } from "../src/lib/staging-fixtures";

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const now = Date.now();
const date = dateInZone(now, timezone);

function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values))
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  return run().finally(() => {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
}

test("the assistant card shows exactly what the Preparation screen shows for the synthetic records", async () => {
  const records = reviewPreparationRecords([], date, timezone, now);
  assert.ok(records.length >= 2, "seeds a day and an arrival check-in");
  assert.deepEqual(reviewPreparationRecords(records, date, timezone, now), [], "never overwrites an existing day");
  const status = preparationStatus(records, date, timezone);
  assert.deepEqual(status.arrival, ["Restless", "Hopeful"]);
  assert.deepEqual(status.support.map((item) => item.title), ["Make room for waiting"]);
  assert.deepEqual(status.homeFocus.length, 1);

  const dom = new JSDOM('<div id="screen"></div><div id="card"></div>', { url: "http://127.0.0.1/review" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const screen = createRoot(document.getElementById("screen")!);
  const card = createRoot(document.getElementById("card")!);
  try {
    const store = { records, loaded: true, busy: false, error: "", async save() { return true; } };
    await act(async () => screen.render(createElement(ReadingRoomPreparation, {
      active: true, owner: "review", now, store: store as never, sessionActive: false, capturePending: false,
      onSetup() {}, async onStart() {}, onJournal() {}, onPreview() {}, onGuidance() {}, children: null,
    })));
    await act(async () => card.render(createElement(PreparationStatusCard, { status })));
    const screenRoot = document.getElementById("screen")!;
    const pressed = [...screenRoot.querySelectorAll('[aria-label="How are you arriving?"] button[aria-pressed="true"]')].map((b) => b.textContent);
    const [intention, boundary] = [...screenRoot.querySelectorAll("textarea")].map((t) => t.value);
    const shown = Object.fromEntries([...document.querySelectorAll("#card dl > div")].map((row) =>
      [row.querySelector("dt")!.textContent, row.querySelector("dd")!.textContent]));
    assert.equal(shown.Arriving, pressed.join(" · "));
    assert.equal(shown.Intention, intention);
    assert.equal(shown.Boundary, boundary);
    assert.equal(shown["Stillness support for today"], "Make room for waiting");
    assert.match(document.getElementById("card")!.textContent!, new RegExp(date));
  } finally {
    await act(async () => { screen.unmount(); card.unmount(); });
    dom.window.close();
  }
});

const review = { APP_ENV: "staging", TRADERPULSE_UI_REVIEW: "true", NEXT_PUBLIC_SUPABASE_URL: undefined, STILL_SIGNAL_ASSISTANT_PROTOTYPE: "true" };
const ask = (host = "127.0.0.1:3000", header = host) =>
  new Request(`http://${host}/api/assistant`, { method: "POST", headers: { "Content-Type": "application/json", Host: header }, body: '{"messages":[]}' });

test("the chat route is unavailable outside local synthetic review", async () => {
  for (const change of [
    { APP_ENV: "production" },
    { TRADERPULSE_UI_REVIEW: "false" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
    { STILL_SIGNAL_ASSISTANT_PROTOTYPE: undefined },
  ])
    await withEnv({ ...review, ...change }, async () => assert.equal((await route(ask())).status, 404, JSON.stringify(change)));
  await withEnv(review, async () => {
    assert.equal((await route(ask("still-signal.example.workers.dev"))).status, 404, "deployed host");
    assert.equal((await route(ask("192.168.1.20:3000"))).status, 404, "LAN host");
    // Next's dev server reports its bind address in request.url whatever Host the client sent.
    assert.equal((await route(ask("127.0.0.1:3000", "still-signal.example.workers.dev"))).status, 404, "foreign Host header");
  });
  await withEnv({ ...review, STILL_SIGNAL_ASSISTANT_FUNCTION_URL: "https://project.supabase.co/functions/v1/pulse-assistant" }, async () => {
    assert.equal((await route(ask())).status, 503, "hosted function address is refused");
  });
});

test("the chat route streams the local function's reply through incrementally", async () => {
  const gap = 250;
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" });
    let n = 0;
    const timer = setInterval(() => {
      response.write(`data: {"type":"text-delta","id":"t","delta":"part ${n}"}\n\n`);
      if (++n === 3) { clearInterval(timer); response.end("data: [DONE]\n\n"); }
    }, gap);
    request.on("close", () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await withEnv({ ...review, STILL_SIGNAL_ASSISTANT_FUNCTION_URL: `http://127.0.0.1:${port}/functions/v1/pulse-assistant` }, async () => {
      const started = Date.now();
      const response = await route(ask());
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
      const reader = response.body!.getReader(), decoder = new TextDecoder(), arrivals: number[] = [];
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        arrivals.push(Date.now() - started);
        text += decoder.decode(value);
      }
      assert.ok(arrivals.length >= 3, `received ${arrivals.length} chunks`);
      assert.ok(arrivals[0] < gap * 2, `first chunk arrived after ${arrivals[0]}ms, before the stream finished`);
      assert.ok(arrivals.at(-1)! - arrivals[0] >= gap, "later chunks arrived later");
      assert.match(text, /part 0[\s\S]*part 2/);
    });
  } finally {
    server.close();
  }
  await withEnv({ ...review, STILL_SIGNAL_ASSISTANT_FUNCTION_URL: `http://127.0.0.1:${port}/functions/v1/pulse-assistant` }, async () => {
    const response = await route(ask());
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /isn't running/);
  });
});

const local = { STILL_SIGNAL_ASSISTANT_LOCAL: "true", SUPABASE_URL: "http://kong:8000", OPENROUTER_API_KEY: "sk-or-test-secret" };
const question = () => new Request("http://kong:8000/functions/v1/pulse-assistant", {
  method: "POST",
  body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "What’s my preparation status?" }] }] }),
});
const sse = (events: unknown[]) => new Response(
  new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    },
  }),
  { headers: { "Content-Type": "text/event-stream" } },
);
const chunk = (delta: object, finish: string | null = null) =>
  ({ id: "gen-1", object: "chat.completion.chunk", created: 1, model: ASSISTANT_MODEL, choices: [{ index: 0, delta, finish_reason: finish }] });

async function withOpenRouter(reply: () => Response, run: (calls: { url: string; init: RequestInit }[]) => Promise<void>) {
  const original = globalThis.fetch, calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.match(String(url), /^https:\/\/openrouter\.ai\/api\/v1\//);
    calls.push({ url: String(url), init: init! });
    return reply();
  }) as typeof fetch;
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test("the Edge Function runs only in the local stack and explains a missing key", async () => {
  for (const change of [{ STILL_SIGNAL_ASSISTANT_LOCAL: undefined }, { SUPABASE_URL: "https://abc.supabase.co" }])
    await withEnv({ ...local, ...change }, async () => assert.equal((await handler(question())).status, 404));
  await withEnv({ ...local, OPENROUTER_API_KEY: undefined }, async () => {
    const response = await handler(question());
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /OPENROUTER_API_KEY is missing.*supabase\/functions\/\.env/);
  });
});

test("the Edge Function streams the free model's text and leaves the read-only tool to the browser", async () => {
  const logged: string[] = [];
  const log = console.log, error = console.error, warn = console.warn;
  console.log = console.error = console.warn = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
  try {
    await withEnv(local, () => withOpenRouter(() => sse([
      chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: PREPARATION_TOOL, arguments: "{}" } }] }, "tool_calls"),
    ]), async (calls) => {
      const text = await (await handler(question())).text();
      const sent = JSON.parse(String(calls[0].init.body));
      assert.equal(sent.model, ASSISTANT_MODEL);
      assert.equal(sent.models, undefined, "no fallback model list");
      assert.equal(sent.provider.allow_fallbacks, false);
      assert.deepEqual(sent.reasoning, { exclude: true }, "reasoning is left out of the response");
      assert.deepEqual(sent.tools.map((t: { function: { name: string } }) => t.function.name), [PREPARATION_TOOL, SUPPORT_HISTORY_TOOL]);
      assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer sk-or-test-secret");
      assert.match(text, /"type":"tool-input-available"[^\n]*"toolName":"preparation_status"/);
      assert.doesNotMatch(text, /tool-output-available/, "the server never answers the tool itself");
    }));
    await withEnv(local, () => withOpenRouter(() => sse([
      chunk({ role: "assistant", content: "Today you " }),
      chunk({ content: "arrived restless and hopeful." }),
      chunk({}, "stop"),
    ]), async () => {
      const response = await handler(question());
      assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
      const deltas = [...(await response.text()).matchAll(/"type":"text-delta"[^\n]*"delta":"([^"]*)"/g)].map((m) => m[1]);
      assert.deepEqual(deltas, ["Today you ", "arrived restless and hopeful."]);
    }));
    await withEnv(local, () => withOpenRouter(() => Response.json(
      { error: { code: 429, message: "Rate limit exceeded: free-models-per-min." } },
      { status: 429 },
    ), async (calls) => {
      const text = await (await handler(question())).text();
      assert.equal(calls.length, 1, "no retry against the free tier");
      assert.match(text, /"type":"error"[^\n]*rate-limited by OpenRouter/);
    }));
  } finally {
    console.log = log; console.error = error; console.warn = warn;
  }
  assert.ok(!logged.some((line) => line.includes("sk-or-test-secret")), "the key never reaches logs");
  assert.match(
    providerMessage(new APICallError({ message: "Cannot connect to API", url: "https://openrouter.ai/api/v1/chat/completions", requestBodyValues: {} })),
    /could not reach OpenRouter/,
    "no HTTP answer is a connection problem",
  );
  for (const broken of [new TypeError("terminated"), Object.assign(new Error("aborted"), { name: "AbortError" }), "unknown"])
    assert.equal(providerMessage(broken), "The answer stopped before it finished. Ask again.", "a stream cut short is not blamed on OpenRouter");
});

test("streamed reasoning never reaches the browser", async () => {
  await withEnv(local, () => withOpenRouter(() => sse([
    chunk({ role: "assistant", content: "", reasoning: "Thinking about the records" }),
    chunk({ reasoning: " for today." }),
    chunk({ content: "You arrived restless." }),
    chunk({}, "stop"),
  ]), async () => {
    const text = await (await handler(question())).text();
    assert.doesNotMatch(text, /reasoning/);
    assert.match(text, /"type":"text-delta"[^\n]*"delta":"You arrived restless\."/);
  }));
});
