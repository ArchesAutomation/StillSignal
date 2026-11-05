// Local isolated test route only; never connects to a real account.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
const output = process.env.FOUR_FIX_OUTPUT || '../four-fix-qa';
mkdirSync(output, { recursive: true });
const fixture = 'src/app/four-fix-qa/page.tsx';
assert.equal(existsSync(fixture),false,'Do not overwrite an existing route');
mkdirSync('src/app/four-fix-qa',{recursive:true});
writeFileSync(fixture, `'use client';
import { useEffect, useState } from 'react';
import Dashboard from '@/components/dashboard';
export default function QA() {
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  if(!ready) return null;
  return <Dashboard user={{id:'99999999-9999-4999-8999-999999999999',email:'four-fix@example.test'}} />;
}`);
const browser = await chromium.launch({ headless:true, executablePath: process.env.FOUR_FIX_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport:{width:1440,height:1000}, timezoneId:'America/Denver' });
await page.addInitScript(()=>{
  window.SpeechRecognition=class {
    start(){ this.onresult?.({results:[{isFinal:true,0:{transcript:'Dictated QA reflection.'}}]}); }
    stop(){this.onend?.();} abort(){}
  };
});
const errors=[], checks=[];
page.on('pageerror',e=>errors.push(e.message));
const button = name => page.getByRole('button',{name,exact:true});
const main = () => page.getByRole('navigation',{name:'Main navigation',exact:true});
try {
  await page.goto(process.env.FOUR_FIX_URL || 'http://127.0.0.1:3101/four-fix-qa');
  await button("Start today's preparation").click();
  await page.getByRole('heading',{name:"Let's build your journal together"}).waitFor();
  for(let i=0;i<4;i++) await button('Continue →').click();
  await page.locator('.guide-approval input').check();
  for(let i=0;i<3;i++) await button('Continue →').click();
  await page.getByLabel('Name your journal routine').fill('Four fix QA routine');
  await button('Guide me through my first rule & mission').click();
  await button('Keep draft & close').click();
  assert.equal(await page.getByLabel('Name your journal routine').inputValue(),'Four fix QA routine');
  await page.reload();
  await page.getByLabel('Name your journal routine').waitFor();
  assert.equal(await page.getByLabel('Name your journal routine').inputValue(),'Four fix QA routine');
  await button('Save & open my preparation →').click();
  await page.locator('.prep-focus').waitFor();
  assert.equal((await page.getByRole('alert').allTextContents()).join('').trim(),'');
  checks.push('Routine save from workspace placeholder; rule-guide detour and refresh preserve draft');
  await main().getByRole('button',{name:'Command Center',exact:true}).click();
  assert.equal(await page.getByRole('navigation',{name:'Preparation',exact:true}).getByRole('button').count(),7);
  await page.getByRole('navigation',{name:'Review & Refine',exact:true}).getByRole('button',{name:'Personal variables',exact:true}).click();
  await button('← Command Center').click();
  await page.getByRole('navigation',{name:'Preparation',exact:true}).getByRole('button',{name:'Personal variables',exact:true}).click();
  await button('← Command Center').click();
  await page.getByRole('navigation',{name:'Preparation',exact:true}).getByRole('button',{name:'Pre-market non-negotiables',exact:true}).click();
  await button('Edit my non-negotiables').click();
  await page.getByRole('heading',{name:'Make your routine yours',exact:true}).waitFor();
  await page.reload();
  await page.getByRole('heading',{name:'Make your routine yours',exact:true}).waitFor();
  await button('Continue →').click();
  await button('Continue →').click();
  await button('Save my routine').click();
  checks.push('Existing non-negotiables opens direct routine editor; editor resumes after refresh and saves');
  // Another day exercises Begin rather than the run created during setup.
  await button('← Command Center').click();
  await page.getByLabel('Trading date',{exact:true}).fill('2026-11-04');
  await button("Start today's preparation").click();
  await page.getByRole('button',{name:'Guided routine',exact:false}).click();
  await button("Begin today's routine →").click();
  await page.locator('.prep-focus').waitFor();
  assert.equal((await page.getByRole('alert').allTextContents()).join('').trim(),'');
  checks.push('Begin existing routine on another day before creating a recording session');
  await button('← Command Center').click();
  await button('Session review').click();
  await button('Write a reflection').waitFor();
  await page.locator('details.pnl-export > summary').click();
  const noOverlap = async () => {
    const review = await page.locator('[data-module-id="process-review-this-session"]').boundingBox();
    const quality = await page.locator('[data-module-id="process-setup-quality-adherence"]').boundingBox();
    assert.ok(review && quality && quality.y >= review.y + review.height, 'P&L stays inside review before adherence');
  };
  await page.waitForTimeout(400); await noOverlap();
  // Reproduce a previously customized fixed-height review container after reload.
  await page.evaluate(()=>localStorage.setItem('still-signal-modules-v2:99999999-9999-4999-8999-999999999999:Trade%20Quality',JSON.stringify({
    sections:[{id:'main',title:'My workspace',width:12}],
    modules:{'process-review-this-session':{section:'main',order:0,width:12,hidden:false,heightMode:'fixed',height:360,box:{x:0,y:0,w:1200,h:360}}}
  })));
  await page.reload();
  await page.locator('details.pnl-export > summary').click();
  await page.waitForTimeout(400); await noOverlap();
  const contained=await page.locator('[data-module-id="process-review-this-session"] > .ss-module-content').evaluate(el=>getComputedStyle(el).overflowY);
  assert.equal(contained,'auto');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(400); await noOverlap();
  await page.locator('details.pnl-export > summary').click();
  await noOverlap();
  checks.push('P&L expansion and collapse reflows review above adherence on desktop and phone');
  await button('Today').click();
  await button('Write a reflection').click();
  const dialog = page.locator('dialog.modal[open]');
  await dialog.waitFor();
  const stage = dialog.getByRole('combobox',{name:'Journal section'});
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await stage.click();
    await page.waitForTimeout(250);
    const bounds = await page.locator('.ss-journal-select-menu').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x+bounds.width <= 391 && bounds.y+bounds.height <= 845);
    await page.screenshot({path:output+`/reflection-${theme}-phone.png`});
    await stage.press('Escape');
    assert.equal(await dialog.isVisible(),true);
    assert.equal(await stage.evaluate(el=>el===document.activeElement),true);
  }
  await stage.press('Home'); await stage.press('Enter');
  await dialog.getByRole('button',{name:'Start dictation',exact:true}).click();
  assert.match(await dialog.getByLabel('Reflection',{exact:true}).inputValue(),/Dictated QA reflection/);
  await dialog.getByRole('button',{name:'Stop dictation',exact:true}).click();
  await dialog.getByLabel('Reflection',{exact:true}).fill('Four-fix QA: planned no-trade day, calm and following my process.');
  await dialog.getByRole('button',{name:'Save reflection',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await page.getByText('Reflection saved. Your personal insights have been updated.',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.floating-journal-host:visible').count(),0);
  checks.push('Light/dark phone reflection menu, keyboard Escape/focus, no-trade save without floating journal');
  await page.setViewportSize({width:1440,height:1000});
  await main().getByRole('button',{name:'Command Center',exact:true}).click();
  await button('Edit dashboard').click();
  await page.getByRole('button',{name:/^Add cards/}).click();
  await button('Add Active missions').click();
  const tile = page.locator('[data-card="thesis"]');
  await tile.waitFor();
  const initial = await tile.getAttribute('data-grid');
  await tile.getByRole('button',{name:'Resize Trading thesis',exact:true}).press('ArrowDown');
  assert.notEqual(await tile.getAttribute('data-grid'),initial);
  assert.equal(await tile.locator('.cc-resize-handle').count(),2);
  await tile.getByRole('button',{name:'Fit Trading thesis to content',exact:true}).click();
  await page.waitForTimeout(200);
  for(const [id,title] of [['temperature','Temperature check'],['missions','Active missions']]) {
    const card=page.locator(`[data-card="${id}"]`);
    await card.getByRole('button',{name:`Resize ${title} from left corner`,exact:true}).press('ArrowDown');
    await card.getByRole('button',{name:`Fit ${title} to content`,exact:true}).click();
    await card.getByRole('button',{name:`Move ${title} up`,exact:true}).click();
  }
  const beforeSave=await page.locator('[data-card]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.card,n.dataset.grid]));
  await button('Save dashboard').click();
  await page.reload();
  await tile.waitFor(); await page.waitForTimeout(400);
  assert.deepEqual(await page.locator('[data-card]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.card,n.dataset.grid])),beforeSave);
  const savedThesis=await tile.getAttribute('data-grid');
  await button('Edit dashboard').click();
  await tile.getByRole('button',{name:'Move Trading thesis down',exact:true}).click();
  await button('Cancel').click();
  await page.waitForTimeout(400);
  assert.equal(await tile.getAttribute('data-grid'),savedThesis);
  checks.push('Dashboard keyboard resize, two handles, Fit content, Save/refresh, Cancel restores saved layout');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:output+'/dashboard.png',fullPage:true});
  console.log(JSON.stringify({checks,errors},null,2));
} finally {
  writeFileSync(output+'/results.json',JSON.stringify({checks,errors},null,2));
  await browser.close();
  unlinkSync(fixture); rmdirSync('src/app/four-fix-qa');
}
