// Isolated UI fixtures only. No brokerage, Supabase project or production server is contacted.
// Run: node --import tsx scripts/test-broker-browser.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";
import { routeAvailability } from "../src/lib/brokers/registry.ts";

const id = "33333333-3333-4333-8333-333333333333";
const env = {
  APP_ORIGIN: "https://fixture.test",
  BROKER_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  ALPACA_CLIENT_ID: "fixture",
  ALPACA_CLIENT_SECRET: "fixture",
  ALPACA_APPROVED: "true",
  PROJECTX_ENABLED: "true",
  OANDA_ENABLED: "true",
};
const routes = routeAvailability(env);
const fixture = {
  provider: "alpaca",
  connected: false,
  count: 0,
  started: false,
};
const calls = [];
const bundle = await build({
  stdin: {
    contents: `import {createElement} from "react"; import {createRoot} from "react-dom/client";
    import BrokerConnections from "./src/components/broker-connections";
    createRoot(document.getElementById("root")).render(createElement(BrokerConnections,{owner:"fixture-owner",onChanged(){},onViewJournal(){window.journalOpened=true}}));`,
    resolveDir: process.cwd(),
    sourcefile: "broker-fixture.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "isolated-auth",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/cloud$/ }, () => ({
          path: "fixture-auth",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `export function authClient(){return {auth:{async getSession(){return {data:{session:{access_token:"fixture-session"}}}}}}}`,
          loader: "js",
        }));
      },
    },
  ],
});
const css =
  (await readFile("src/app/globals.css", "utf8")) +
  (await readFile("src/app/workspace.css", "utf8"));
const server = createServer(async (req, res) => {
  const send = (body, type = "application/json") => {
    res.setHeader("Content-Type", type);
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  if (req.url === "/fixture.js")
    return send(bundle.outputFiles[0].text, "application/javascript");
  if (req.url === "/fixture.css") return send(css, "text/css");
  if (req.url === "/approve") {
    fixture.connected = true;
    return send(
      "<p>Fixture broker approval complete. Return to the journal.</p>",
      "text/html",
    );
  }
  if (req.url === "/api/brokers") {
    assert.equal(req.headers.authorization, "Bearer fixture-session");
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    calls.push(body);
    if (body.action === "status")
      return send({
        routes,
        jobs: [],
        connections: fixture.started
          ? [
              {
                id,
                provider: fixture.provider,
                status: fixture.connected ? "connected" : "pending",
                environment: "paper",
              },
            ]
          : [],
        accounts: fixture.connected
          ? [
              {
                id: "fixture-account",
                connection_id: id,
                name: "Practice account",
                currency: "USD",
                environment: "paper",
                identity_verified: true,
                institution: "Fixture",
                metadata: { maskedNumber: "••••1234" },
              },
            ]
          : [],
      });
    if (body.action === "connect") {
      fixture.provider = body.provider;
      fixture.started = true;
      fixture.connected = body.provider === "oanda";
      return send({
        connectionId: id,
        ...(body.provider === "oanda" ? { queued: true } : { url: "/approve" }),
      });
    }
    if (body.action === "progress")
      return send({
        importedExecutions: fixture.count,
        historyChecked: fixture.count > 0,
      });
    return send({ queued: true });
  }
  return send(
    '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body><p class="review-banner">ISOLATED UI REVIEW · Synthetic accounts and imports. No brokerage connected.</p><main style="max-width:1100px;margin:24px auto;padding:0 16px"><div id="root"></div><section id="trade-csv">CSV import</section></main><script src="/fixture.js"></script></body></html>',
    "text/html",
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    headless: true,
  });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    Object.assign(fixture, {
      provider: "alpaca",
      connected: false,
      count: 0,
      started: false,
    });
    const context = await browser.newContext({ viewport });
    await context.route("**/*", (route) =>
      route
        .request()
        .url()
        .startsWith(origin + "/")
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    const chooseType = async (name) => page.getByRole("button").filter({ has: page.locator("strong", { hasText: new RegExp("^" + name + "$") }) }).click();
    await page.getByRole("heading", { name: "Choose connection type", exact: true }).waitFor();
    assert.equal(await page.locator("select").count(), 0);
    if (process.env.BROKER_SCREENSHOT_DIR) await page.screenshot({path: process.env.BROKER_SCREENSHOT_DIR + "/connection-types-" + viewport.width + ".png", fullPage:true});
    await chooseType("SnapTrade");
    await page.getByLabel("SnapTrade broker").selectOption("Fidelity");
    assert.match(await page.locator(".broker-wizard").innerText(), /KYC approval/);
    assert.match(await page.locator(".broker-wizard").innerText(), /future app pricing is undecided/i);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: /Personal OAuth unavailable/ }).isEnabled(), false);
    assert.equal(calls.some((c) => c.action === "connect" && c.provider === "snaptrade"), false);
    await page.getByRole("button", { name: "Change broker", exact: false }).click();
    await page.getByRole("button", { name: "Change connection type", exact: false }).click();
    await chooseType("CSV");
    assert.equal(await page.getByLabel("Brokerage name").count(), 0, "CSV must bypass broker setup");
    await page.getByRole("heading", { name: "Choose connection type", exact: true }).waitFor();
    for (const type of ["TradingView"]) {
      await chooseType(type);
      await page.getByLabel("Brokerage name").fill("My brokerage");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      assert.equal(await page.getByRole("link", { name: type === "CSV" ? "Open CSV importer" : "Open TradingView alert setup", exact: false }).count(), 1);
      await page.getByRole("button", { name: "Change broker", exact: false }).click();
      await page.getByRole("button", { name: "Change connection type", exact: false }).click();
    }
    await chooseType("Direct");
    const select = page.getByLabel("Your broker", { exact: true });
    await select.selectOption("tastytrade");
    await page.getByText("Missing configuration or approval:", { exact: false }).first().waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Continue to authentication", exact: true }).isEnabled(), false);
    await page.getByRole("button", { name: "Change broker", exact: false }).click();
    await select.selectOption("alpaca");
    await page.getByRole("button", { name: "Continue", exact: false }).click();
    await page.getByRole("button", { name: "Continue to authentication", exact: true }).click();
    await page.getByLabel("Broker account type").selectOption("paper");
    await page
      .getByRole("button", { name: "Review permissions", exact: true })
      .click();
    assert.equal(await page.getByRole("button", { name: "Connect account", exact: true }).isEnabled(), false);
    await page.getByLabel("I authorize reading my account", { exact: false }).check();
    await page.getByRole("button", { name: "Connect account", exact: true }).click();
    const popup = context.waitForEvent("page");
    await page
      .getByRole("link", { name: "Continue to secure sign-in", exact: false })
      .click();
    const brokerPage = await popup;
    await brokerPage.waitForLoadState();
    await brokerPage.close();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByText("Broker authorization confirmed", { exact: false })
      .waitFor();
    assert.equal(
      await page
        .getByRole("heading", { name: "Your first trades are in" })
        .count(),
      0,
    );
    fixture.count = 2;
    await page
      .getByRole("button", { name: "I've finished signing in", exact: false })
      .click();
    await page
      .getByRole("heading", { name: "Your first trades are in" })
      .waitFor();
    await page.getByText("2 executions imported", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "View journal", exact: false })
      .click();
    assert.equal(await page.evaluate(() => window.journalOpened), true);
    await page.getByRole("button", { name: "Connect another broker" }).click();
    await chooseType("Direct");
    await select.selectOption("oanda");
    await page.getByRole("button", { name: "Continue", exact: false }).click();
    await page.getByText("Manage API Access", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Continue to authentication", exact: true }).click();
    await page.getByLabel("Broker account type").selectOption("paper");
    await page
      .getByLabel("API token", { exact: true })
      .fill("fixture-private-token");
    await page
      .getByRole("button", { name: "Review permissions", exact: true })
      .click();
    await page.getByLabel("I authorize reading my account", { exact: false }).check();
    await page.getByRole("button", { name: "Connect account", exact: true }).click();
    await page
      .getByRole("heading", { name: "Your first trades are in" })
      .waitFor();
    assert.equal(
      await page.getByLabel("API token", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .locator("body")
        .evaluate((body) => body.scrollWidth > innerWidth),
      false,
      "no horizontal overflow",
    );
    assert.deepEqual(errors, []);
    if (process.env.BROKER_SCREENSHOT_DIR)
      await page.screenshot({
        path:
          process.env.BROKER_SCREENSHOT_DIR +
          "/broker-" +
          viewport.width +
          ".png",
        fullPage: true,
      });
    await context.close();
  }
  assert.ok(
    calls.some(
      (c) =>
        c.action === "connect" &&
        c.provider === "alpaca" &&
        c.environment === "paper",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.action === "connect" &&
        c.provider === "oanda" &&
        c.accessToken === "fixture-private-token",
    ),
  );
  console.log(
    "Broker walkthrough passed in Edge at desktop and mobile widths using isolated fixtures; no live provider tested.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
