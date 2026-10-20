// Actual Next.js dashboard, isolated /review origin and synthetic trades only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.CSV_DASHBOARD_URL || "http://127.0.0.1:3101";
const csv = (await readFile(new URL("../tests/fixtures/tradingview-filled-orders.csv", import.meta.url), "utf8"))
  .replaceAll("2026-01-15 09:10:00", "2026-10-13 14:50:00")
  .replaceAll("2026-01-15 09:00:00", "2026-10-13 14:40:00");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
try {
  for (const viewport of [{width:1440,height:1100},{width:390,height:844}]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("**/*", (route) => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
    await page.goto(origin + "/review");
    await page.locator(".review-banner").filter({hasText:"Synthetic"}).waitFor();
    await page.getByRole("heading", {name:/Trade activity 4/}).waitFor();
    const sessionId = await page.getByLabel("Workspace session",{exact:true}).inputValue();
    const upload = async () => {
      await page.locator(".page-actions").getByRole("button",{name:"Import CSV",exact:true}).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading",{name:"Import CSV",exact:true}).waitFor();
      assert.equal(await dialog.getByText("Choose broker",{exact:true}).count(),0);
      await dialog.getByLabel("Trade CSV file",{exact:true}).setInputFiles({name:"synthetic-day.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
      await dialog.getByText("2 validated events.",{exact:false}).waitFor();
      await dialog.getByLabel("CSV timezone",{exact:true}).fill("UTC");
      await dialog.getByLabel("This export starts flat",{exact:false}).check();
      await dialog.getByRole("button",{name:"Import 2 events",exact:true}).click();
      await dialog.waitFor({state:"detached"});
      await page.getByRole("heading",{name:/Trade activity 6/}).waitFor();
      assert.equal(await page.getByLabel("Workspace session",{exact:true}).inputValue(),sessionId);
      assert.match(await page.locator(".events-panel").innerText(), /ESZ6/);
    };
    await upload();
    await upload();
    assert.equal(await page.getByLabel("Workspace session",{exact:true}).locator("option").count(),1);
    assert.match(await page.locator(".timeline-bottom").innerText(), /4,469 samples saved/);
    await page.locator(".events-panel").getByRole("button",{name:/ESZ6/}).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Position heart rate",{exact:true}).waitFor();
    assert.match(await dialog.innerText(), /Before entry/);
    assert.match(await dialog.innerText(), /During position/);
    assert.match(await dialog.innerText(), /Order update time/);
    if (process.env.CSV_SCREENSHOT_DIR) await page.screenshot({path:process.env.CSV_SCREENSHOT_DIR+"/manual-csv-session-"+viewport.width+".png"});
    await dialog.getByRole("button",{name:"Close",exact:true}).click();
    await page.locator("nav").getByRole("button",{name:"Connections",exact:true}).click();
    await page.getByRole("button").filter({has:page.locator("strong",{hasText:/^CSV$/})}).click();
    await page.getByRole("dialog").getByRole("heading",{name:"Import CSV",exact:true}).waitFor();
    assert.equal(await page.getByLabel("Brokerage name").count(),0,"CSV shortcut must never ask for broker setup");
    assert.equal(await page.locator("body").evaluate((body)=>body.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`Dashboard CSV passed ${viewport.width}px: direct entry, same recorded session, retained HR, position timing, deduplication and broker bypass.`);
  }
} finally { await browser.close(); }
