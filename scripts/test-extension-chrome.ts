// Real installed Chrome, isolated profile, real MediaRecorder + offscreen capture.
// Synthetic audio and a deterministic provider response: no live speech quality claim.
import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST as handler } from "../src/lib/handlers/extension";
import { POST as proxy } from "../src/app/api/extension/route";
async function main() {
  const user = "11111111-1111-4111-8111-111111111111",
    sid = randomUUID();
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${user}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
  );
  for (const f of [
    "20261013082052_initial_trade_pulse_tenants.sql",
    "20261013202920_smart_journal_screenshots.sql",
    "20261014064205_voice_journal_extension.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.query("select pulse_save_session($1,$2,$3)", [
    user,
    sid,
    {
      id: sid,
      owner: user,
      name: "ES · Chrome test",
      startedAt: Date.now() - 10000,
      source: "journal",
      events: [],
      journal: [],
      sampleCount: 0,
    },
  ]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "server-test-key";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  process.env.GROQ_API_KEY = "provider-test-key";
  const realFetch = globalThis.fetch;
  let transcript = "Log this: I am feeling fear of missing out.",
    offline = false,
    providerCalls = 0,
    unclear = false;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init),
      u = new URL(request.url);
    if (u.hostname === "api.groq.com") {
      providerCalls++;
      const form = await request.formData();
      assert.ok((form.get("file") as Blob).size > 100);
      assert.equal(form.get("model"), "whisper-large-v3-turbo");
      return Response.json({
        text: transcript,
        segments: [
          {
            no_speech_prob: unclear ? 0.95 : 0.01,
            avg_logprob: unclear ? -1.8 : -0.2,
          },
        ],
      });
    }
    if (u.hostname !== "supabase.test") return realFetch(input, init);
    if (u.pathname === "/functions/v1/pulse-extension") return handler(request);
    if (u.pathname === "/auth/v1/user")
      return request.headers.get("authorization") === "Bearer signed-in-test"
        ? Response.json({
            id: user,
            email: "chrome-trader@example.test",
            aud: "authenticated",
          })
        : Response.json({ message: "unauthorized" }, { status: 401 });
    try {
      if (u.pathname.startsWith("/rest/v1/rpc/")) {
        const name = u.pathname.split("/").at(-1)!;
        assert.match(
          name,
          /^pulse_(extension_action|extension_exchange|rate_limit)$/,
        );
        const body = await request.json(),
          keys = Object.keys(body);
        assert.ok(keys.every((k) => /^p_[a-z_]+$/.test(k)));
        const result = await db.query<{ result: unknown }>(
          `select ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) result`,
          Object.values(body),
        );
        return Response.json(result.rows[0].result);
      }
      const table = u.pathname.split("/").at(-1)!;
      assert.ok(
        ["pulse_extension_pairings", "pulse_extension_credentials"].includes(
          table,
        ),
      );
      if (request.method === "POST") {
        const body = await request.json(),
          keys = Object.keys(body);
        await db.query(
          `insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")})`,
          Object.values(body),
        );
        return new Response(null, { status: 201 });
      }
      const filters = [...u.searchParams.entries()].filter(
        ([k]) => !["select", "order", "limit"].includes(k),
      );
      const where = filters
        .map(([k, v], i) => {
          assert.match(k, /^[a-z_]+$/);
          assert.ok(v.startsWith("eq."));
          return `${k}=$${i + 1}`;
        })
        .join(" and ");
      const data = await db.query(
        `select * from ${table} where ${where || "true"}`,
        filters.map(([, v]) => v.slice(3)),
      );
      return Response.json(
        request.headers.get("accept")?.includes("vnd.pgrst.object")
          ? (data.rows[0] ?? null)
          : data.rows,
      );
    } catch (e) {
      return Response.json(
        { message: e instanceof Error ? e.message : "database", code: "P0001" },
        { status: 400 },
      );
    }
  };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (req.url === "/api/extension") {
      if (offline) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Offline test" }));
        return;
      }
      const response = await proxy(
        new Request("http://localhost:3000/api/extension", {
          method: "POST",
          headers: req.headers as Record<string, string>,
          body: Buffer.concat(chunks),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<!doctype html><title>Trade Pulse extension fixture</title><button id="approve">Connect account</button><p id="result"></p><script>document.getElementById('approve').onclick=async()=>{const q=new URLSearchParams(location.search);const p={action:'pair',extensionId:q.get('connectExtension'),instanceId:q.get('instance'),challenge:q.get('challenge')};const r=await fetch('/api/extension',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer signed-in-test'},body:JSON.stringify(p)});const d=await r.json();const result=await chrome.runtime.sendMessage(p.extensionId,{type:'pair-result',code:d.code,instanceId:p.instanceId,challenge:p.challenge});document.getElementById('result').textContent=JSON.stringify(result)};</script>`,
    );
  });
  await new Promise<void>((r) => server.listen(3000, "127.0.0.1", r));
  const results: string[] = [];
  const profile = path.resolve("../chrome-voice-test-full-" + randomUUID());
  let context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    args: [
      "--enable-unsafe-extension-debugging",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  let browserCDP = await context.browser()!.newBrowserCDPSession();
  try {
    const { id } = await browserCDP.send("Extensions.loadUnpacked", {
      path: path.resolve("extension/dist"),
    });
    const base = `chrome-extension://${id}/`;
    const setup = context.pages().find((p) => p.url() === base + "setup.html");
    const setupPage = setup ?? (await context.newPage());
    if (!setup) await setupPage.goto(base + "setup.html");
    await setupPage.locator("#grant").click();
    await setupPage
      .locator("#permission-status")
      .filter({ hasText: "Microphone enabled" })
      .waitFor();
    results.push(
      "visible setup grants synthetic microphone and immediately stops setup tracks",
    );
    let panel = await context.newPage();
    await panel.goto(base + "panel.html");
    const connectPage = context.waitForEvent("page");
    await panel.locator("#connect").click();
    const app = await connectPage;
    await app.waitForURL("http://localhost:3000/?connectExtension=**");
    await app.locator("#approve").click();
    await app.locator("#result").filter({ hasText: '"ok":true' }).waitFor();
    await panel
      .locator("#identity")
      .filter({ hasText: "chrome-trader@example.test" })
      .waitFor();
    results.push(
      "signed-in handoff pairs instance with scoped server credential through packaged runtime",
    );
    await panel.locator("#sessions").selectOption(sid);
    const start = Date.now();
    await panel.locator("#mic").click();
    await panel
      .locator("#status")
      .filter({ hasText: /^Recording$/ })
      .waitFor();
    const offscreen = async () => {
      const targets = await browserCDP.send("Target.getTargets");
      return targets.targetInfos.find(
        (t: { url: string }) => t.url === base + "offscreen.html",
      );
    };
    assert.ok(await offscreen());
    await panel.close();
    await app.bringToFront();
    await new Promise((r) => setTimeout(r, 1400));
    panel = await context.newPage();
    await panel.goto(base + "panel.html");
    await panel
      .locator("#status")
      .filter({ hasText: /^Recording$/ })
      .waitFor();
    const worker = (
      await browserCDP.send("Target.getTargets")
    ).targetInfos.find(
      (t: { type: string; url: string }) =>
        t.type === "service_worker" && t.url === base + "worker.js",
    )!;
    const appCDP = await context.newCDPSession(app);
    await appCDP.send("ServiceWorker.enable");
    await appCDP.send("ServiceWorker.stopAllWorkers");
    await panel.reload();
    await panel
      .locator("#status")
      .filter({ hasText: /^Recording$/ })
      .waitFor();
    await panel.locator("#stop").click();
    await panel
      .locator("#latest")
      .filter({ hasText: "I am feeling fear of missing out." })
      .waitFor();
    results.push(
      "offscreen recording survives panel closure, tab switching and actual worker termination; stop auto-saves one reflection",
    );
    const saved = (
      await db.query<{
        data: {
          journal: {
            t: number;
            activationAt: number;
            recordingStartedAt: number;
            id: string;
          }[];
        };
      }>("select data from pulse_sessions where id=$1", [sid])
    ).rows[0].data.journal;
    assert.equal(saved.length, 1);
    assert.ok(
      saved[0].activationAt >= start && saved[0].activationAt < start + 1000,
    );
    assert.equal(saved[0].t, saved[0].activationAt);
    assert.ok(saved[0].recordingStartedAt >= saved[0].activationAt);
    await panel.locator('[data-emotion="Calm"]').click();
    await panel.locator("#latest").filter({ hasText: "Calm" }).waitFor();
    await panel.locator("#correct").click();
    await panel
      .locator("#correction-text")
      .fill("These are my exact corrected words.");
    await panel.locator("#save-correction").click();
    await panel
      .locator("#latest")
      .filter({ hasText: "These are my exact corrected words." })
      .waitFor();
    results.push(
      "button tags and corrections preserve original activation timestamp and note identity",
    );
    transcript = "I need a pause before another trade.";
    offline = true;
    await panel.locator("#mic").click();
    await panel
      .locator("#status")
      .filter({ hasText: /^Recording$/ })
      .waitFor();
    await new Promise((r) => setTimeout(r, 1400));
    await panel.locator("#stop").click();
    await panel.locator("#error").filter({ hasText: "Offline test" }).waitFor();
    await panel.close();
    offline = false;
    panel = await context.newPage();
    await panel.goto(base + "panel.html");
    await panel
      .locator("#latest")
      .filter({ hasText: "I need a pause before another trade." })
      .waitFor();
    results.push(
      "offline finalized audio persists with frozen destination and recovers after reopening without duplicate writes",
    );
    await panel.locator("#undo").click();
    await new Promise((r) => setTimeout(r, 250));
    const rows = (
      await db.query<{ data: { journal: { deletedAt?: number }[] } }>(
        "select data from pulse_sessions where id=$1",
        [sid],
      )
    ).rows[0].data.journal;
    assert.equal(rows.filter((n) => !n.deletedAt).length, 1);
    results.push("undo uses existing deletion tombstone");
    unclear = true;
    transcript = "Unclear words need review.";
    await panel.locator("#mic").click();
    await panel
      .locator("#status")
      .filter({ hasText: /^Recording$/ })
      .waitFor();
    await new Promise((r) => setTimeout(r, 1200));
    await panel.locator("#stop").click();
    await panel.locator("#review-box").waitFor({ state: "visible" });
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select jsonb_array_length(data->'journal') n from pulse_sessions where id=$1",
          [sid],
        )
      ).rows[0].n,
      2,
    );
    await panel.locator("#review-text").fill("I am staying patient.");
    await panel.locator("#save-review").click();
    await panel
      .locator("#latest")
      .filter({ hasText: "I am staying patient." })
      .waitFor();
    results.push(
      "unclear provider output is held for review and only explicit corrected words save",
    );
    unclear = false;
    const moment = Date.now();
    const promptMessage = {
      type: "hr-prompt",
      userId: user,
      sessionId: sid,
      momentId: `hr-${moment}`,
      t: moment,
    };
    const claimed = await app.evaluate(
      async ({ id, promptMessage }) =>
        chrome.runtime.sendMessage(id, promptMessage),
      { id, promptMessage },
    );
    assert.equal(claimed.claimed, true);
    await panel.locator("#prompt").waitFor({ state: "visible" });
    const repeat = await app.evaluate(
      async ({ id, promptMessage }) =>
        chrome.runtime.sendMessage(id, promptMessage),
      { id, promptMessage },
    );
    assert.equal(repeat.claimed, true);
    const live = context
      .serviceWorkers()
      .find((w) => w.url() === base + "worker.js")!;
    assert.equal(
      (
        await live.evaluate(async () =>
          chrome.runtime.sendMessage({
            target: "offscreen",
            type: "capture-state",
          }),
        )
      ).captureBusy,
      false,
    );
    await panel.locator("#snooze").click();
    await panel.locator("#prompt").waitFor({ state: "hidden" });
    results.push(
      "HR prompt ownership deduplicates runtime messages, requires explicit voice response, and supports snooze",
    );
    await panel.screenshot({
      path: "extension/test-results/windows-panel.png",
      fullPage: true,
    });
    const actualWorker = context
      .serviceWorkers()
      .find((w) => w.url() === base + "worker.js")!;
    const cleanup = await actualWorker.evaluate(async () => {
      const x = await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "capture-state",
      });
      const audioCount = await new Promise<number>((resolve, reject) => {
        const r = indexedDB.open("trade-pulse-voice", 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("audio").objectStore("audio").count();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      });
      return {
        audioCount,
        capture: x,
        commands: await chrome.commands.getAll(),
        sidePanel: await chrome.sidePanel.getOptions({}),
      };
    });
    assert.equal(cleanup.capture.captureBusy, false);
    assert.equal(cleanup.capture.wakeOn, false);
    assert.equal(cleanup.capture.liveTracks, 0);
    assert.equal(
      cleanup.audioCount,
      0,
      "raw audio is erased after successful transcription",
    );
    assert.ok(
      cleanup.commands.find((c) => c.name === "toggle-recording")?.shortcut,
    );
    assert.equal(cleanup.sidePanel.path, "panel.html");
    assert.equal(await panel.locator("#wake").isDisabled(), true);
    results.push(
      "microphone tracks stop, wake stays off without licensed model, Chrome registers shortcut and persistent side panel",
    );
    const denied = await chromium.launchPersistentContext(
      path.resolve("../chrome-voice-denial-" + randomUUID()),
      {
        channel: "chrome",
        headless: true,
        args: [
          "--enable-unsafe-extension-debugging",
          "--use-fake-device-for-media-stream",
          "--deny-permission-prompts",
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
      },
    );
    try {
      const cdp = await denied.browser()!.newBrowserCDPSession();
      const extension = await cdp.send("Extensions.loadUnpacked", {
        path: path.resolve("extension/dist"),
      });
      const page = await denied.newPage();
      await page.goto(`chrome-extension://${extension.id}/setup.html`);
      await page.locator("#grant").click();
      await page
        .locator("#permission-status")
        .filter({ hasText: "Microphone denied or unavailable" })
        .waitFor();
      results.push(
        "real Chrome microphone denial reports recovery without acquiring tracks",
      );
    } finally {
      await denied.close();
    }
    await actualWorker.evaluate(async () => {
      const s = (await chrome.storage.local.get("journal")).journal as Record<
        string,
        unknown
      >;
      await chrome.storage.local.set({
        journal: { ...s, wakeEnabled: true, autoRespond: true },
      });
      await chrome.storage.session.set({
        wakeConsent: true,
        autoRespondConsent: true,
      });
    });
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: true,
      args: [
        "--enable-unsafe-extension-debugging",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    browserCDP = await context.browser()!.newBrowserCDPSession();
    const reloaded=await browserCDP.send("Extensions.loadUnpacked",{path:path.resolve("extension/dist")});assert.equal(reloaded.id,id);
    panel = await context.newPage();
    await panel.goto(base + "panel.html");
    await panel
      .locator("#identity")
      .filter({ hasText: "chrome-trader@example.test" })
      .waitFor();
    assert.equal(await panel.locator("#wake").isChecked(), false);
    assert.equal(await panel.locator("#auto").isChecked(), false);
    results.push(
      "actual browser restart clears wake and automatic HR response consent without restarting microphone listening",
    );
    await db.query(
      "update pulse_extension_credentials set revoked_at=now() where user_id=$1",
      [user],
    );
    await panel.locator("#refresh").click();
    await panel
      .locator("#identity")
      .filter({ hasText: "Connect your Trade Pulse account" })
      .waitFor();
    results.push(
      "server revocation disconnects the account and disables capture",
    );
    console.log(
      JSON.stringify(
        {
          chrome: await context.browser()!.version(),
          platform: process.platform,
          audio: "synthetic",
          transcription:
            "deterministic provider fixture; live provider unverified",
          providerCalls,
          passed: results,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    const worker = context.serviceWorkers()[0];
    if (worker)
      console.error(
        "Extension state at failure",
        await worker.evaluate(async () => {
          const s = (await chrome.storage.local.get("journal"))
            .journal as Record<string, unknown>;
          delete s.credential;
          delete s.pairing;
          return s;
        }),
      );
    console.error("Provider fixture", { providerCalls, unclear, transcript });
    throw e;
  } finally {
    await context.close();
    server.close();
    globalThis.fetch = realFetch;
    await db.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
