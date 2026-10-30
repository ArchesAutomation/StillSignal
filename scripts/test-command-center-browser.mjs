// Isolated local QA only. No cloud credentials or real account data are used.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import {
  mkdirSync,
  createWriteStream,
  readFileSync,
  writeFileSync,
} from "node:fs";
const executablePath =
  process.env.COMMAND_CENTER_CHROME || chromium.executablePath();
const output =
  process.env.COMMAND_CENTER_QA_OUTPUT || "/tmp/still-signal-command-center-qa";
mkdirSync(output, { recursive: true });
const originalConfig = readFileSync("tsconfig.json"),
  originalNextEnv = readFileSync("next-env.d.ts");
const env = {
  ...process.env,
  APP_ENV: "staging",
  TRADERPULSE_UI_REVIEW: "true",
  STILL_SIGNAL_QA_DIST: ".next-command-center-qa",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
};
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3101",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
const log = createWriteStream(output + "/server.log");
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch("http://127.0.0.1:3101/api/health");
      break;
    } catch {
      if (attempt === 49) throw new Error("Local QA server did not start.");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-zygote",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    timezoneId: "America/Denver",
  });
  const page = await context.newPage(),
    errors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const nav = async (name) => {
    const main = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    const primary = main.getByRole("button", {
      name: name === "Patterns" ? "Heart-rate analytics" : name,
      exact: true,
    });
    if (["Command Center", "Daily journal", "Patterns", "Stillness", "Settings"].includes(name)) {
      await primary.click();
      return;
    }
    await main
      .getByRole("button", { name: "Command Center", exact: true })
      .click();
    const links = {
      "Pre-Market": ["Pre-market non-negotiables", "Manage"],
      "Trading Thesis": ["Trading thesis", "Open plans"],
      "Trade Quality": ["Trade quality", "Review"],
      Missions: ["Active missions", "Manage"],
    };
    if (links[name]) {
      await panel(links[name][0])
        .getByRole("button", { name: links[name][1], exact: true })
        .click();
      return;
    }
    await button(
      { "Settings & Variables": "Personal variables", Audits: "Daily review" }[
        name
      ] || name,
    ).click();
  };
  const panel = (title) =>
    page
      .locator(".cc-panel")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const button = (name) =>
    page.locator(".cc-workspace").getByRole("button", { name, exact: true });
  const fits = async (label) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      label + " must fit viewport",
    );
    checks.push(label + " fits");
  };
  await page.goto("http://127.0.0.1:3101/review");
  await nav("Command Center");
  await page
    .getByRole("button", { name: "Day settings", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".cc-workspace select:visible").count(),
    0,
    "New day has no dropdown wall",
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("button")
      .count(),
    5,
  );
  await fits("Empty dashboard");
  await page.screenshot({
    path: output + "/empty-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Day settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Open trading day", exact: true })
    .waitFor();
  await page.getByLabel("Selected instrument", { exact: true }).fill("ES");
  await page
    .getByLabel("Selected trading account", { exact: true })
    .fill("QA paper account");
  await page.getByLabel("Day status", { exact: true }).selectOption("no-trade");
  await button("Open trading day").click();
  await page
    .getByRole("heading", { name: "Welcome, review", exact: true })
    .waitFor();
  await nav("Pre-Market");
  await button("New protocol").click();
  await page
    .getByLabel("Protocol name", { exact: true })
    .fill("My morning process");
  await panel("Protocol builder")
    .getByLabel("Name", { exact: true })
    .fill("Write daily plan");
  await panel("Protocol builder")
    .getByLabel("Verification", { exact: true })
    .selectOption("daily-thesis");
  await button("Add requirement").click();
  await panel("Protocol builder")
    .getByLabel("Name", { exact: true })
    .nth(1)
    .fill("Check workspace");
  await button("Create protocol").click();
  await page
    .getByLabel("Preparation protocol", { exact: true })
    .selectOption({ label: "My morning process · v1" });
  await button("Begin preparation").click();
  await page.getByText("0/2 required", { exact: false }).waitFor();
  await nav("Trading Thesis");
  await button("New weekly thesis").click();
  await page
    .getByLabel("Primary scenario", { exact: true })
    .fill("Weekly plan entered by the trader.");
  await button("Save thesis").click();
  await button("New daily thesis").click();
  await page
    .getByLabel("Directional bias", { exact: true })
    .selectOption("neutral");
  await page
    .getByLabel("Primary scenario", { exact: true })
    .fill("Observe only unless my setup forms.");
  await page
    .getByLabel("No-trade conditions", { exact: true })
    .fill("No valid setup.");
  await button("Save thesis").click();
  await nav("Pre-Market");
  await button("Verify saved thesis & check-ins").click();
  await page.getByText("1/2 required", { exact: false }).waitFor();
  const manual = page
    .locator(".cc-check-row")
    .filter({ has: page.getByText("Check workspace", { exact: true }) });
  await manual
    .getByLabel("Check workspace status", { exact: true })
    .selectOption("complete");
  await manual.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByText("2/2 required", { exact: false }).waitFor();
  checks.push(
    "Preparation verifies real thesis evidence and preserves manual completion",
  );
  await nav("Settings & Variables");
  await button("Check in now").click();
  await page
    .getByRole("button", { name: "Focus: 7 of 10", exact: true })
    .click();
  await page
    .getByLabel("Physical condition", { exact: true })
    .fill("No wearable connected.");
  await button("Record check-in").click();
  await button("Create variable").click();
  await page.getByLabel("Display name", { exact: true }).fill("Caffeine dose");
  await page
    .getByLabel("Category (create any name)", { exact: true })
    .fill("Lifestyle");
  await page.getByLabel("Unit", { exact: true }).fill("mg");
  await page
    .getByLabel("Collection frequency", { exact: true })
    .selectOption("event");
  await button("Save definition").click();
  await panel("Environmental variables")
    .locator(".cc-list-row")
    .filter({ has: page.getByText("Caffeine dose", { exact: true }) })
    .getByRole("button", { name: "Record value", exact: true })
    .click();
  await page.getByLabel("Caffeine dose (mg)", { exact: true }).fill("100");
  await button("Record observation").click();
  await page.getByText("Caffeine dose: 100 mg", { exact: true }).waitFor();
  checks.push("Custom variable definition and typed observation persist");
  await nav("Trade Quality");
  await button("New playbook").click();
  await page
    .getByLabel("Strategy name", { exact: true })
    .fill("My tested setup");
  await page
    .getByLabel("Rule name", { exact: true })
    .fill("Wait for my confirmation");
  await button("Save playbook version").click();
  await button("Assess setup or execution").click();
  await page
    .getByLabel("Playbook version", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Planned instrument (for planned setup)", { exact: true })
    .fill("ES");
  await page.getByLabel("Planned units", { exact: true }).fill("1");
  await button("Save assessment").click();
  await page
    .getByText("Process score not available", { exact: false })
    .waitFor();
  await page
    .getByLabel("Wait for my confirmation adherence", { exact: true })
    .selectOption("followed");
  await button("Record review").click();
  checks.push(
    "Planned setup reviews begin unknown and use explicit rule confirmation",
  );
  await nav("Missions");
  await button("Create mission").click();
  await page
    .getByLabel("Mission name", { exact: true })
    .fill("Complete my preparation");
  await page.getByLabel("Target count", { exact: true }).fill("1");
  await button("Save mission").click();
  await page.getByText("1 / 1", { exact: false }).first().waitFor();
  checks.push(
    "Mission derives progress from recorded preparation on a no-trade day",
  );
  await nav("Audits");
  await page
    .getByLabel("Review summary", { exact: true })
    .fill("Planned no-trade day: preparation completed and reviewed.");
  await button("Save review with evidence snapshot").click();
  await page
    .getByText("Planned no-trade day: preparation completed and reviewed.", {
      exact: true,
    })
    .waitFor();
  await nav("Command Center");
  await button("Layout settings").click();
  await page.getByText("Customize workspace", { exact: true }).click();
  await page.getByLabel("Preset name", { exact: true }).fill("My trading desk");
  await button("Save layout").click();
  await page.getByText("Customize workspace", { exact: true }).click();
  await button("Close layout settings").click();
  assert.equal(
    await page.locator(".cc-workspace select:visible").count(),
    0,
    "Dashboard has no visible dropdowns",
  );
  await fits("Desktop command center");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: output + "/command-center-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await nav("Command Center");
  await page
    .getByRole("heading", { name: "Welcome, review", exact: true })
    .waitFor();
  await page.getByText("Self-reported readiness", { exact: true }).waitFor();
  checks.push("Records and workspace preset survive reload");
  await nav("Patterns");
  await page
    .getByRole("heading", { name: "Connected Pattern Explorer", exact: true })
    .waitFor();
  await fits("Desktop Patterns");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Command Center", exact: true })
    .click();
  await fits("Mobile command center");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: output + "/command-center-mobile.png",
    fullPage: true,
  });
  await nav("Daily journal");
  await page.locator(".ss-journal-space").waitFor();
  await page.locator(".ss-reference-rhythm").waitFor();
  await fits("Mobile production journal");
  const writer = page.getByRole("region", {
    name: "Main journal",
    exact: true,
  });
  await writer
    .getByRole("textbox", { name: "Journal reflection", exact: true })
    .fill("Production journal survives the Command Center integration.");
  await writer
    .getByRole("button", { name: "Save to journal", exact: true })
    .click();
  await page
    .getByLabel("Search moments", { exact: true })
    .fill("Production journal survives");
  await page
    .locator(".ss-space-moment")
    .filter({ hasText: "Production journal survives" })
    .waitFor();
  await nav("Command Center");
  await nav("Daily journal");
  await page
    .getByLabel("Search moments", { exact: true })
    .fill("Production journal survives");
  await page
    .locator(".ss-space-moment")
    .filter({ hasText: "Production journal survives" })
    .waitFor();
  checks.push(
    "Production journal, chart, and saved reflection survive process-page navigation",
  );
  const freshContext = await browser.newContext({viewport:{width:390,height:844},timezoneId:"America/Denver"});
  const freshPage = await freshContext.newPage();
  freshPage.on("pageerror", e => errors.push(e.message));
  await freshPage.goto("http://127.0.0.1:3101/review");
  await freshPage.getByRole("navigation",{name:"Main navigation",exact:true}).getByRole("button",{name:"Command Center",exact:true}).click();
  await freshPage.getByRole("button",{name:"Prepare",exact:true}).click();
  await freshPage.getByRole("button",{name:"New protocol",exact:true}).waitFor();
  await freshPage.getByRole("button",{name:"← Command Center",exact:true}).click();
  await freshPage.getByRole("button",{name:"Check in now",exact:true}).click();
  const rating = freshPage.getByRole("button",{name:"Focus: 7 of 10",exact:true});
  await rating.click();
  assert.equal(await rating.getAttribute("aria-pressed"),"true");
  await rating.click();
  assert.equal(await rating.getAttribute("aria-pressed"),"false");
  assert.equal(await freshPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  checks.push("Mobile one-click day creation and clearable check-in ratings");
  await freshContext.close();
  assert.deepEqual(errors, [], "Browser must have no unhandled errors");
  console.log(JSON.stringify({ checks, errors, output }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null) resolve();
    else {
      server.once("exit", resolve);
      setTimeout(resolve, 3000).unref();
    }
  });
  writeFileSync("tsconfig.json", originalConfig);
  writeFileSync("next-env.d.ts", originalNextEnv);
  log.end();
}
