// Format-only regression test. Uses synthetic transactions, isolated browser
// storage and no cloud/broker credentials. Never upload customer CSVs here.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixturePath = new URL("../tests/fixtures/tradingview-filled-orders.csv", import.meta.url);
const csv = await readFile(fixturePath);
const bundle = await build({
  stdin: {
    contents: `import React,{useState} from "react";
      import {createRoot} from "react-dom/client";
      import CsvImporter from "./src/components/csv-importer";
      import TradeContextPanel from "./src/components/trade-context-panel";
      import {usePulse} from "./src/components/use-pulse";
      import {saveSession,appendSamples} from "./src/lib/storage";
      function Harness(){
        const p=usePulse({id:"77777777-7777-4777-8777-777777777777"});
        const [result,setResult]=useState("");
        return <>
          <CsvImporter active={false} hasSession={false} onImport={async(events,name,destination,timezone)=>{
            await p.importEvents(events,name,destination,timezone);setResult("Imported "+events.length+" events");
          }}/>
          <p role="status">{result}</p>
          <p data-testid="journal-count">{p.history.length}</p>
          <p data-testid="saved-count">{p.session?.events.length || 0}</p>
          <p data-testid="sample-count">{p.samples.length}</p>
          <button onClick={()=>void p.openSession(p.history[0])} disabled={!p.history.length}>Reopen saved journal</button>
          <div data-testid="saved-events" style={{overflowWrap:"anywhere"}}>{JSON.stringify(p.session?.events || [])}</div>
          <TradeContextPanel event={p.session?.events.at(-1)} events={p.session?.events || []} samples={p.samples} end={p.session?.endedAt} seconds={60} onSelect={()=>{}} onReflect={()=>{}}/>
        </>;
      }
      void (async()=>{
        const id="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",owner="77777777-7777-4777-8777-777777777777";
        const t=Date.parse("2026-01-15T09:00:00Z");
        const samples=[{t:t-30000,bpm:70},{t,bpm:80},{t:t+300000,bpm:100},{t:t+600000,bpm:90},{t:t+630000,bpm:75}];
        await saveSession({id,owner,name:"Synthetic recorded day",source:"journal",startedAt:t-1800000,endedAt:t+3600000,sampleCount:samples.length,events:[],journal:[]});
        await appendSamples(id,samples,owner,false);
        createRoot(document.getElementById("root")).render(<Harness/>);
      })();`,
    resolveDir: process.cwd(), sourcefile: "csv-fixture.tsx", loader: "tsx",
  },
  bundle: true, write: false, format: "iife", platform: "browser",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_SUPABASE_URL": '""',
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": '""',
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '""',
  },
});
const css = await readFile("src/app/globals.css", "utf8") + await readFile("src/app/workspace.css", "utf8");
const server = createServer((req, res) => {
  const send = (type, value) => { res.setHeader("Content-Type", type); res.end(value); };
  if (req.url === "/fixture.js") return send("application/javascript", bundle.outputFiles[0].text);
  if (req.url === "/fixture.css") return send("text/css", css);
  if (req.url?.startsWith("/api/")) { res.writeHead(500); return res.end("No cloud in isolated CSV test"); }
  send("text/html", '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body><p class="review-banner">ISOLATED CSV FORMAT TEST · Synthetic trades only</p><main style="max-width:1100px;margin:24px auto;padding:0 16px"><div id="root"></div></main><script src="/fixture.js"></script></body></html>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const requests = [];
    await context.route("**/*", (route) => {
      requests.push(route.request().url());
      return route.request().url().startsWith(origin + "/") ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    const loadAndImport = async () => {
      await page.getByLabel("Trade CSV file", { exact: true }).setInputFiles({ name: "synthetic-orders.csv", mimeType: "text/csv", buffer: csv });
      await page.getByRole("heading", { name: "Broker executions / filled orders" }).waitFor();
      await page.getByRole("note").filter({ hasText: "This export provides order Update Time" }).waitFor();
      await page.getByLabel("CSV timezone", { exact: true }).fill("UTC");
      await page.getByText("2 validated events.", { exact: false }).waitFor();
      const save = page.getByRole("button", { name: "Import 2 events", exact: true });
      assert.equal(await save.isEnabled(), false, "starting position must be confirmed before import");
      await page.getByLabel("This export starts flat", { exact: false }).check();
      assert.equal(await save.isEnabled(), true);
      if (process.env.CSV_SCREENSHOT_DIR) await page.screenshot({path:process.env.CSV_SCREENSHOT_DIR+"/csv-preview-"+viewport.width+".png",fullPage:true});
      await save.click();
      await page.getByTestId("saved-count").filter({ hasText: /^2$/ }).waitFor();
      await page.getByRole("heading", { name: "Broker executions / filled orders" }).waitFor({ state: "detached" });
    };
    await loadAndImport();
    const events = JSON.parse(await page.getByTestId("saved-events").innerText());
    assert.deepEqual(events.map((e) => [e.kind, e.side, e.quantity]), [["entry", "long", 1], ["exit", "long", 1]]);
    assert.ok(events.every((e) => e.timestampSource === "order-update" && e.pnl === undefined));
    assert.equal(await page.getByTestId("sample-count").innerText(), "5", "manual import must keep the recorded day's HR");
    const position = page.getByLabel("Position heart rate", {exact:true});
    assert.match(await position.innerText(), /Before entry\s+70/);
    assert.match(await position.innerText(), /During position\s+90/);
    assert.match(await position.innerText(), /After exit\s+75/);
    if (process.env.CSV_SCREENSHOT_DIR) await position.screenshot({path:process.env.CSV_SCREENSHOT_DIR+"/csv-position-"+viewport.width+".png"});
    await page.getByText("Order update time", { exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Reopen saved journal" }).click();
    await page.getByTestId("saved-count").filter({ hasText: /^2$/ }).waitFor();
    assert.deepEqual(JSON.parse(await page.getByTestId("saved-events").innerText()), events, "saved events retain timestamp provenance");
    await loadAndImport();
    assert.equal(await page.getByTestId("journal-count").innerText(), "1", "identical re-imports must not duplicate journals");
    await page.getByLabel("Trade CSV file", { exact: true }).setInputFiles({ name: "replacement.csv", mimeType: "text/csv", buffer: csv });
    await page.getByLabel("This export starts flat", { exact: false }).check();
    await page.getByLabel("Trade CSV file", { exact: true }).setInputFiles({ name: "another.csv", mimeType: "text/csv", buffer: csv });
    await page.getByText("2 rows · another", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("This export starts flat", { exact: false }).isChecked(), false, "replacement files require a fresh position confirmation");
    assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth > innerWidth), false, "no horizontal overflow");
    assert.ok(requests.every((url) => url.startsWith(origin + "/") && !url.includes("/api/")), "no external or cloud upload");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`CSV format browser test passed at ${viewport.width}px: preview, confirmations, persistence, re-import, replacement and no network upload.`);
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
