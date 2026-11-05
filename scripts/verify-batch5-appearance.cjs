// Synthetic localhost-only appearance audit; never reads a hosted account.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.BATCH5_QA_URL || "http://127.0.0.1:3005";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw Error("Localhost only");
const output = process.env.BATCH5_QA_OUTPUT || "../../outputs/batch5";
fs.mkdirSync(output, { recursive: true });
const baseline = process.argv.includes("--baseline");
async function styleAudit(locator) {
  return locator.evaluate(node => {
    const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
    const composite = (fg,bg) => fg.slice(0,3).map((n,i) => n*(fg[3] ?? 1)+bg[i]*(1-(fg[3] ?? 1)));
    const chain=[]; for(let p=node;p;p=p.parentElement) chain.unshift(p);
    let bg=rgb(getComputedStyle(document.documentElement).getPropertyValue("--ocean-bg"));
    // Resolve the theme's hex backdrop, then composite CSS fills. Glass/backdrop
    // imagery is separately reviewed in screenshots, not certified by this model.
    const hex=getComputedStyle(document.documentElement).getPropertyValue("--ocean-bg").trim();
    if(hex.startsWith("#")) bg=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    for(const p of chain) bg=composite(rgb(getComputedStyle(p).backgroundColor),bg);
    const s=getComputedStyle(node), fg=composite(rgb(s.color),bg);
    const lum=c=>c.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
    const a=lum(fg), b=lum(bg);
    return {text:(node.textContent||node.getAttribute("aria-label")||"").trim().slice(0,50),color:s.color,background:s.backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),outline:s.outlineStyle,outlineColor:s.outlineColor,opacity:s.opacity};
  });
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:"msedge"});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage(), errors=[], matrix=[], palettes=[], disabled=[], sweep=[];
  page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto(base+"/review");
    await page.getByRole("button",{name:"Customize workspace",exact:true}).waitFor();
    const appearance=page.locator(".appearance-controls"), summary=appearance.locator("summary");
    await summary.click();
    await page.mouse.click(5, 180);
    const outsideClosed=await appearance.evaluate(n=>!n.open);
    if(await appearance.evaluate(n=>!n.open)) await summary.click();
    await page.keyboard.press("Escape");
    const escapeClosed=await appearance.evaluate(n=>!n.open);
    console.log(JSON.stringify({outsideClosed,escapeClosed}));
    if(!baseline) {assert.ok(outsideClosed,"Appearance dismisses on outside pointer");assert.ok(escapeClosed,"Appearance dismisses on Escape");}
    if(await appearance.evaluate(n=>n.open)) await summary.click();
    await summary.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    assert.equal(await appearance.locator("select").first().evaluate(n=>n===document.activeElement),true);
    await page.keyboard.press("Escape");
    assert.equal(await summary.evaluate(n=>n===document.activeElement),true,"Escape restores the trigger focus");
    await page.getByRole("button",{name:"Customize workspace",exact:true}).click();
    await page.getByRole("button",{name:"Add modules",exact:true}).click();
    const library=page.getByRole("region",{name:"Module library",exact:true});
    await library.waitFor();
    for(const theme of ["dark","light"]) {
      if(await appearance.evaluate(n=>!n.open)) await summary.click();
      await appearance.locator("select").first().selectOption(theme);
      await page.waitForTimeout(150);
      for(const accent of ["#c5d7df","#ffffff","#000000","#ffff00","#0000ff"]) {
        await appearance.getByLabel("Button color",{exact:true}).fill(accent);
        await page.waitForTimeout(100);
        const controls=[page.getByRole("button",{name:"Save layout",exact:true}),library.getByRole("button",{name:/Close/}),appearance.getByRole("button",{name:"Reset appearance",exact:true})];
        for(const control of controls) {
          await page.mouse.move(5,5);
          const normal=await styleAudit(control);
          await control.hover(); const hover=await styleAudit(control);
          await control.focus(); await page.keyboard.press("Shift"); const focus=await styleAudit(control);
          matrix.push({theme,accent,normal,hover,focus});
          if(!baseline) {
            for(const state of [normal,hover,focus]) assert.ok(state.ratio>=4.5, `${theme} ${accent} ${state.text} contrast ${state.ratio}`);
            assert.notEqual(focus.outline,"none", "keyboard focus is visible");
            assert.equal(focus.outlineColor,normal.color,"focus uses readable theme ink rather than arbitrary accent");
          }
        }
      }
      const undo=page.getByRole("button",{name:"Undo",exact:true});
      assert.ok(await undo.isDisabled());
      disabled.push({theme,...await styleAudit(undo)});
      for(const palette of ["steel","sand","slate","reef","graphite","rose","purple","red","gold","teal"]) {
        await appearance.getByLabel("All shark palettes",{exact:true}).selectOption(palette);
        await page.waitForTimeout(80);
        const canvas=page.locator(".shark-background canvas");
        const pixels=await canvas.evaluate(n=>{
          const ctx=n.getContext("2d"), data=ctx.getImageData(0,0,n.width,n.height).data;
          const first=Array.from(data.slice(0,3)); let ink=0;
          for(let i=0;i<data.length;i+=16) if(Math.max(...first.map((v,j)=>Math.abs(v-data[i+j])))>45) ink++;
          return ink;
        });
        assert.ok(pixels>100,"ocean contains visible decorative ink");
        palettes.push({theme,palette,pixels});
      }
      await page.screenshot({path:output+"/batch5-"+theme+"-menus.png",fullPage:false});
    }
    await page.keyboard.press("Escape");
    const closeLibrary=library.getByRole("button",{name:/Close/});
    assert.ok(await closeLibrary.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),"library controls are above the board");
    await closeLibrary.click();
    await page.getByRole("button",{name:"Create module",exact:true}).click();
    const custom=page.locator('.ss-free-board > [data-module-id^="custom-"]').last();
    await custom.getByLabel("Title",{exact:true}).fill("My readable note");
    await custom.getByRole("textbox",{name:/Content for/}).fill("Keep the original thought. ".repeat(20));
    const customStyle=await styleAudit(custom.getByRole("textbox",{name:/Content for/}));
    assert.ok(customStyle.ratio>=4.5);
    await page.getByRole("button",{name:"Save layout",exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    await summary.click();
    await page.screenshot({path:output+"/batch5-mobile-appearance.png"});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const panelBox=await appearance.locator(".appearance-panel").boundingBox();
    assert.ok(panelBox.x>=0&&panelBox.y>=0&&panelBox.x+panelBox.width<=390&&panelBox.y+panelBox.height<=844);
    await page.keyboard.press("Escape");
    await page.setViewportSize({width:1440,height:1000});
    await page.locator(".ss-reference-nav").getByRole("button",{name:"Command Center",exact:true}).click();
    await page.getByRole("button",{name:"Edit dashboard",exact:true}).click();
    await page.getByRole("button",{name:/^Add cards/}).click();
    const catalogue=page.getByRole("region",{name:"Available cards",exact:true});
    await catalogue.waitFor();
    assert.ok((await styleAudit(catalogue.getByRole("heading").first())).ratio>=4.5);
    await page.screenshot({path:output+"/batch5-light-card-catalogue.png"});
    for(const theme of ["dark","light"]) {
      if(await appearance.evaluate(n=>!n.open)) await summary.click();
      await appearance.locator("select").first().selectOption(theme);
      await page.keyboard.press("Escape");
      const tools=page.locator(".ss-reference-tools");
      await tools.locator("summary").focus();
      await page.keyboard.press("Enter");
      const menuButton=tools.getByRole("button",{name:"Saved sessions",exact:true});
      sweep.push({theme,surface:"Session tools",...await styleAudit(menuButton)});
      await page.keyboard.press("Escape");
      const captureToggle=page.getByRole("button",{name:"Capture options",exact:true});
      await captureToggle.click();
      const captureMenu=page.locator(".ss-capture-menu");
      sweep.push({theme,surface:"Capture menu",...await styleAudit(captureMenu.locator("b").first())});
      await page.screenshot({path:output+"/batch5-"+theme+"-capture-menu.png"});
      await captureToggle.click();
      const buttons=page.locator(".ss-app button");
      for(let i=0;i<await buttons.count();i++) {
        const b=buttons.nth(i);
        if(await b.isVisible()&&!await b.isDisabled()&&(await b.textContent()).trim()) sweep.push({theme,surface:"Command Center",...await styleAudit(b)});
      }
    }
    console.log(JSON.stringify({sweepFailures:sweep.filter(s=>s.ratio<4.5)}));
    assert.deepEqual(sweep.filter(s=>s.ratio<4.5),[],"visible enabled action labels remain readable in both themes");
    assert.deepEqual(errors,[]);
    fs.writeFileSync(output+"/batch5-matrix.json",JSON.stringify({outsideClosed,escapeClosed,matrix,disabled,palettes,customStyle,sweep,errors},null,2));
    console.log(JSON.stringify({lowest:matrix.map(r=>({theme:r.theme,accent:r.accent,...r.normal})).sort((a,b)=>a.ratio-b.ratio).slice(0,9),errors}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});



