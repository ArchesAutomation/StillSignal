import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { POST as route } from "../src/app/api/assistant/route";
import { assistantPilotAccess, assistantPilotHeaders } from "../src/components/assistant/assistant-pilot";
import { ASSISTANT_MODEL, PREPARATION_TOOL } from "../src/lib/assistant-tool";
import { POST as handler, providerMessage } from "../src/lib/handlers/assistant";
import { APICallError } from "ai";

const invited = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const pilot = {
  STILL_SIGNAL_ASSISTANT_LOCAL: undefined,
  STILL_SIGNAL_ASSISTANT_PILOT: "true",
  STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS: ` ${invited} ,33333333-3333-4333-8333-333333333333`,
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  OPENROUTER_API_KEY: "sk-or-test-secret",
};

async function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const assign = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  };
  assign(values);
  try { await run(); } finally { assign(previous); }
}

type Call = { url: string; init?: RequestInit };
const stream = () => new Response(
  `data: ${JSON.stringify({ id: "gen-1", object: "chat.completion.chunk", created: 1, model: ASSISTANT_MODEL, choices: [{ index: 0, delta: { role: "assistant", content: "You arrived calm." }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
  { headers: { "Content-Type": "text/event-stream" } },
);

/** Supabase Auth, the rate limit and OpenRouter, with nothing reaching the network. */
async function withServices(
  options: { allowed?: boolean; openrouter?: () => Response },
  run: (calls: Call[]) => Promise<void>,
) {
  const original = globalThis.fetch, calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    if (url.includes("/auth/v1/user")) {
      const token = new Headers(input instanceof Request ? input.headers : init?.headers).get("authorization");
      if (token === "Bearer invited-token") return Response.json({ id: invited, aud: "authenticated", role: "authenticated" });
      if (token === "Bearer other-token") return Response.json({ id: other, aud: "authenticated", role: "authenticated" });
      return Response.json({ message: "invalid JWT" }, { status: 401 });
    }
    if (url.includes("/rpc/pulse_rate_limit")) return Response.json(options.allowed ?? true);
    if (url.startsWith("https://openrouter.ai/")) return (options.openrouter ?? stream)();
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try { await run(calls); } finally { globalThis.fetch = original; }
}

const ask = (token?: string, body: unknown = { messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "What's my preparation status?" }] }] }) =>
  new Request("https://project.supabase.co/functions/v1/pulse-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const modelCalls = (calls: Call[]) => calls.filter((call) => call.url.startsWith("https://openrouter.ai/"));

test("the function refuses everyone until the pilot is enabled", async () => {
  await withEnv({ ...pilot, STILL_SIGNAL_ASSISTANT_PILOT: undefined }, () => withServices({}, async (calls) => {
    assert.equal((await handler(ask("invited-token"))).status, 404);
    assert.equal(calls.length, 0, "no account or model request is made");
  }));
});

test("only a verified, invited account reaches the model", async () => {
  await withEnv(pilot, () => withServices({}, async (calls) => {
    assert.equal((await handler(ask())).status, 401, "anonymous");
    assert.equal((await handler(ask("forged-token"))).status, 401, "invalid session");
    assert.equal((await handler(ask("other-token"))).status, 404, "signed in but not invited");
    assert.equal((await handler(ask("other-token", { action: "access" }))).status, 404, "access probe");
    assert.equal(modelCalls(calls).length, 0);
    const response = await handler(ask("invited-token"));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /You arrived calm\./);
    assert.equal(modelCalls(calls).length, 1);
  }));
  await withEnv({ ...pilot, STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS: "" }, () => withServices({}, async () => {
    assert.equal((await handler(ask("invited-token"))).status, 404, "an empty allowlist admits nobody");
  }));
});

test("the access probe confirms an invited account without calling the model or using its limit", async () => {
  await withEnv(pilot, () => withServices({}, async (calls) => {
    const response = await handler(ask("invited-token", { action: "access" }));
    assert.deepEqual(await response.json(), { enabled: true });
    assert.equal(modelCalls(calls).length, 0);
    assert.ok(!calls.some((call) => call.url.includes("pulse_rate_limit")));
  }));
});

test("the pilot requires private endpoints, describes real records and leaves tools to the browser", async () => {
  await withEnv(pilot, () => withServices({}, async (calls) => {
    await (await handler(ask("invited-token"))).text();
    const sent = JSON.parse(String(modelCalls(calls)[0].init!.body));
    assert.equal(sent.model, ASSISTANT_MODEL);
    assert.equal(sent.models, undefined, "no fallback model list");
    assert.deepEqual(sent.provider, { allow_fallbacks: false, data_collection: "deny", zdr: true });
    const system = JSON.stringify(sent.messages.find((message: { role: string }) => message.role === "system").content);
    assert.match(system, /signed in/);
    assert.doesNotMatch(system, /synthetic/);
    assert.ok(sent.tools.some((item: { function: { name: string } }) => item.function.name === PREPARATION_TOOL));
  }));
});

test("the rate limit stops a request before the model", async () => {
  await withEnv(pilot, () => withServices({ allowed: false }, async (calls) => {
    const response = await handler(ask("invited-token"));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(modelCalls(calls).length, 0);
  }));
});

test("pilot errors do not expose setup details", async () => {
  await withEnv({ ...pilot, OPENROUTER_API_KEY: undefined }, () => withServices({}, async () => {
    const response = await handler(ask("invited-token"));
    assert.equal(response.status, 503);
    assert.doesNotMatch((await response.json()).error, /OPENROUTER|\.env/);
  }));
  const failed = (statusCode: number) => new APICallError({ message: "failed", url: "https://openrouter.ai/api/v1/chat/completions", requestBodyValues: {}, statusCode });
  assert.doesNotMatch(providerMessage(failed(401), true), /\.env|key/);
  assert.match(providerMessage(failed(404), true), /records were not sent/);
  assert.match(providerMessage(failed(401)), /supabase\/functions\/\.env/, "the local prototype keeps its setup help");
});

const routed = (headers: Record<string, string> = {}, body = '{"action":"access"}') =>
  new Request("https://still-signal.example.workers.dev/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });

test("the app route stays closed by default and requires a bearer token when enabled", async () => {
  await withEnv({ ...pilot, STILL_SIGNAL_ASSISTANT_PILOT: "false" }, async () => {
    assert.equal((await route(routed({ Authorization: "Bearer invited-token" }))).status, 404);
  });
  await withEnv(pilot, async () => {
    const response = await route(routed());
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("the app route forwards the session and streams the reply unchanged", async () => {
  const original = globalThis.fetch;
  let sent: { url: string; headers: Headers; body: string } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent = { url: String(url), headers: new Headers(init?.headers), body: String(init?.body) };
    return new Response("data: part\n\n", { headers: { "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
  }) as typeof fetch;
  try {
    await withEnv(pilot, async () => {
      const response = await route(routed({ Authorization: "Bearer invited-token" }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
      assert.equal(await response.text(), "data: part\n\n");
      assert.equal(sent!.url, "https://project.supabase.co/functions/v1/pulse-assistant");
      assert.equal(sent!.headers.get("authorization"), "Bearer invited-token");
      assert.equal(sent!.headers.get("apikey"), "sb_publishable_test");
      assert.equal(sent!.body, '{"action":"access"}');
    });
  } finally {
    globalThis.fetch = original;
  }
});

const client = (id: string | null) => ({
  auth: { getSession: async () => ({ data: { session: id ? { access_token: "token", user: { id } } : null } }) },
}) as never;

test("the browser only uses the workspace owner's session and hides the pilot on any failure", async () => {
  assert.deepEqual(await assistantPilotHeaders(invited, client(invited)), { Authorization: "Bearer token" });
  await assert.rejects(assistantPilotHeaders(invited, client(other)), /Sign in again/);
  await assert.rejects(assistantPilotHeaders(invited, client(null)), /Sign in again/);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ enabled: true })) as typeof fetch;
    assert.equal(await assistantPilotAccess(invited, client(invited)), true);
    assert.equal(await assistantPilotAccess(invited, client(other)), false, "another account");
    globalThis.fetch = (async () => Response.json({ error: "Not found." }, { status: 404 })) as typeof fetch;
    assert.equal(await assistantPilotAccess(invited, client(invited)), false, "not invited");
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    assert.equal(await assistantPilotAccess(invited, client(invited)), false, "offline");
  } finally {
    globalThis.fetch = original;
  }
});

test("the generated Edge Function carries the pilot's account checks", async () => {
  const generated = await readFile("supabase/functions/pulse-assistant/handler.ts", "utf8");
  assert.match(generated, /from "\.\/server\.ts"/);
  assert.match(generated, /Deno\.env\.get\("STILL_SIGNAL_ASSISTANT_PILOT_USER_IDS"\)/);
  assert.doesNotMatch(generated, /process\.env/);
  await readFile("supabase/functions/pulse-assistant/server.ts", "utf8");
});
