import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const origin = process.env.PAGE_LAYOUT_URL || "http://127.0.0.1:3217";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.PAGE_LAYOUT_BROWSER ? { executablePath: process.env.PAGE_LAYOUT_BROWSER } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin+"/review");
  const button = name => page.getByRole("button", { name, exact: true });
  await button("Edit dashboard").waitFor();
  assert.equal(await page.getByText("Your workspace", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Journal guide & text", { exact: true }).count(), 0);
  await page.getByLabel("My account", { exact: true }).click();
  await button("Sign out").waitFor({state:"visible"});
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".ss-account-menu").getAttribute("open"), null);
  const nav = page.getByRole("navigation", {name:"Main navigation"}).first();
  let journalCode;
  for (const label of ["Daily journal", "Patterns", "Stillness", "Command Center"]) {
    await nav.getByRole("button", {name:label === "Patterns" ? "Heart-rate analytics" : label, exact:true}).click();
    if (label === "Stillness") await button("I’m here").click();
    await button("Edit dashboard").waitFor();
    assert.equal(await button("Edit dashboard").count(),1);
    await button("New dashboard").click();
    await page.getByLabel("Dashboard name",{exact:true}).fill(label+" review");
    await button("Save dashboard").click();
    await button("Edit dashboard").waitFor();
    await button("Dashboard snapshots").click();
    await button("Generate share code").click();
    const code = await page.getByLabel("Dashboard snapshot code",{exact:true}).inputValue();
    assert.equal(JSON.parse(code).layout.page ?? "Command Center", label === "Daily journal" ? "Journal" : label);
    if (label === "Daily journal") journalCode=code;
    if (label === "Patterns") {
      assert.equal(await page.getByText("Your Command Center", {exact:true}).count(),0);
      await page.getByLabel("Dashboard snapshot code",{exact:true}).fill(journalCode);
      await button("Preview snapshot").click();
      await page.getByText("This snapshot is invalid or belongs to another page.",{exact:true}).waitFor();
    }
    await button("Dashboard snapshots").click();
  }
  await page.reload(); await button("Edit dashboard").waitFor();
  await nav.getByRole("button",{name:"Command Center",exact:true}).click();
  await page.getByText("Command Center review", {exact:true}).waitFor({state:"attached"});
  await nav.getByRole("button",{name:"Daily journal",exact:true}).click();
  await page.getByText("Daily journal review",{exact:true}).waitFor({state:"attached"});
  // Settings changes should affect journal cards after returning, and survive reload.
  await nav.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Journal text size",{exact:true}).selectOption("130");
  await page.getByRole("button",{name:"Close workspace tools",exact:true}).click();
  await button("Edit dashboard").waitFor();
  const text = page.locator(".ss-space-moments textarea").first();
  assert.ok(await text.count(), "populated journal reflection text exists");
  assert.ok(parseFloat(await text.evaluate(n => getComputedStyle(n).fontSize)) > 18);
  assert.equal(await page.locator(".ss-app").evaluate(n=>n.style.getPropertyValue("--journal-text-scale")),"1.3");
  for (const width of [1920, 1024, 390]) {
    await page.setViewportSize({width,height:1080});
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),"no page overflow at "+width);
  }
  if (process.env.PAGE_LAYOUT_SCREENSHOTS) {
    await mkdir(process.env.PAGE_LAYOUT_SCREENSHOTS,{recursive:true});
    await page.setViewportSize({width:1920,height:1080});
    await page.screenshot({path:process.env.PAGE_LAYOUT_SCREENSHOTS+"/dashboard-toolbar.png"});
  }
  // A fresh, isolated browser storage context provides three predictable cards.
  const context = await browser.newContext({viewport:{width:1600,height:1080}});
  const groupPage = await context.newPage(); groupPage.on("pageerror", e=>errors.push(e.message));
  await groupPage.addInitScript(() => {
    const modules={};
    for(const id of ["post-exit-review","day-summary","timeline","calendar","moments","evidence","observations","journal-heading","review-chart","writing","process-context","session-controls","intentions","weekly-reflection","linked-preparation","linked-thesis","linked-variables","linked-missions","linked-quality"])
      modules[id]={section:"main",order:0,width:4,hidden:true};
    for(const [id,x] of [["custom-a",40],["custom-b",316],["custom-c",900]]) modules[id]={section:"main",order:0,width:3,hidden:false,heightMode:"fixed",height:160,box:{x,y:60,w:260,h:160}};
    modules["custom-d"]={section:"main",order:1,width:3,hidden:false,heightMode:"fixed",height:160,box:{x:900,y:236,w:260,h:160}};
    localStorage.setItem("still-signal-modules-v2:88888888-8888-4888-8888-888888888888:Journal",JSON.stringify({boardWidth:1200,sections:[{id:"main",title:"Main",width:12}],modules,custom:[{id:"custom-a",title:"A",text:"Alpha"},{id:"custom-b",title:"B",text:"Beta"},{id:"custom-c",title:"C",text:"Gamma"},{id:"custom-d",title:"D",text:"Delta"}]}));
  });
  await groupPage.goto(origin+"/review");
  const gb = name => groupPage.getByRole("button",{name,exact:true});
  await gb("Edit dashboard").click();
  const card = id => groupPage.locator('.ss-free-board > [data-module-id="'+id+'"]');
  await card("custom-a").waitFor();
  const beforeA=await card("custom-a").boundingBox(), beforeB=await card("custom-b").boundingBox();
  const board=await groupPage.locator(".ss-free-board").first().boundingBox();
  await groupPage.mouse.move(board.x+3,board.y+3); await groupPage.mouse.down();
  await groupPage.mouse.move(beforeB.x+beforeB.width+5,beforeB.y+beforeB.height+5,{steps:12}); await groupPage.mouse.up();
  assert.equal(await groupPage.locator(".ss-module-selected").count(),2);
  const grip=await gb("Drag A module").boundingBox();
  await groupPage.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await groupPage.mouse.down();
  await groupPage.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2+260,{steps:12});await groupPage.mouse.up();
  const movedA=await card("custom-a").boundingBox(),movedB=await card("custom-b").boundingBox();
  assert.ok(Math.abs(movedA.y-beforeA.y-260)<1);assert.ok(Math.abs(movedB.y-beforeB.y-260)<1);
  await gb("Undo").click();assert.ok(Math.abs((await card("custom-a").boundingBox()).y-beforeA.y)<1);
  // Escape cancels a selected-group drag.
  const grip2=await gb("Drag A module").boundingBox();
  await groupPage.mouse.move(grip2.x+grip2.width/2,grip2.y+grip2.height/2);await groupPage.mouse.down();await groupPage.mouse.move(grip2.x+grip2.width/2,grip2.y+grip2.height/2+220,{steps:8});await groupPage.keyboard.press("Escape");await groupPage.mouse.up();
  assert.ok(Math.abs((await card("custom-a").boundingBox()).y-beforeA.y)<1);
  // A group overlapping an unselected widget is rejected as a unit.
  const collide=await gb("Drag A module").boundingBox();
  await groupPage.mouse.move(collide.x+collide.width/2,collide.y+collide.height/2);await groupPage.mouse.down();await groupPage.mouse.move(collide.x+collide.width/2+900,collide.y+collide.height/2,{steps:12});await groupPage.mouse.up();
  assert.equal(await card("custom-a").evaluate(n=>parseFloat(n.style.top)),60);
  await card("custom-c").hover();await gb("Hide C module").click();await gb("Close gap").click();
  assert.equal(await card("custom-d").evaluate(n=>parseFloat(n.style.top)),60);
  await gb("Undo").click();assert.equal(await card("custom-d").evaluate(n=>parseFloat(n.style.top)),236);
  await gb("Undo").click();await card("custom-c").waitFor();
  await gb("Drag A module").press("ArrowDown");
  assert.equal(await card("custom-a").evaluate(n=>parseFloat(n.style.top)),72);
  assert.equal(await card("custom-b").evaluate(n=>parseFloat(n.style.top)),72);
  await gb("Save dashboard").click();await groupPage.reload();await gb("Edit dashboard").waitFor();
  assert.ok(Math.abs((await card("custom-a").boundingBox()).x-beforeA.x)<1);
  assert.equal(await card("custom-a").evaluate(n=>parseFloat(n.style.top)),72);
  assert.deepEqual(errors,[]);
  console.log("PASS: four page dashboards, save/reload, page-safe snapshots, account menu, text setting, responsive overflow, marquee/group move/Undo/Escape, occupied group rejection, close-gap Undo and group keyboard persistence.");
} finally { await browser.close(); }
