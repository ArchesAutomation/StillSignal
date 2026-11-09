// Local synthetic /review only; no real accounts or credentials.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createWriteStream,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const output=process.env.SUPPORTIVE_QA_OUTPUT || resolve(tmpdir(),'still-signal-supportive-qa');
mkdirSync(output,{recursive:true});
const originalConfig=readFileSync('tsconfig.json'),originalNextEnv=readFileSync('next-env.d.ts');
import assert from 'node:assert/strict';
const require=createRequire(resolve('package.json'));
const {chromium}=require('playwright');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3103'],{cwd:resolve('.'),env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',APP_ENV:'staging',TRADERPULSE_UI_REVIEW:'true',STILL_SIGNAL_QA_DIST:'.next-supportive-browser',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
const log=createWriteStream(resolve(output,'server.log'));
server.stdout.pipe(log);server.stderr.pipe(log);
const browser=await chromium.launch({executablePath:process.env.COMMAND_CENTER_CHROME || chromium.executablePath(),headless:true,args:['--disable-gpu']});
try {
 for(let n=0;n<40;n++){try{await fetch('http://127.0.0.1:3103/api/health');break;}catch{await new Promise(r=>setTimeout(r,500));}}
 for(const focus of ['impulsiveness','impatience','fear','greed']) {
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Europe/London'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3103/review',{timeout:60000});
 await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Command Center',exact:true}).click();
 await page.getByRole('button',{name:'Day settings',exact:true}).waitFor();
 await page.getByText('Preparation tools',{exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Trading thesis',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Active missions',exact:true}).count(),0);
 await page.getByText('Review & Refine',{exact:true}).click();
 await page.getByRole('button',{name:'Archived tools',exact:true}).click();
 await page.getByRole('heading',{name:'Archived tools',exact:true}).waitFor();
 assert.equal(await page.locator('.cc-workspace form').count(),0);
 await page.getByRole('button',{name:'← Command Center',exact:true}).click();
 await page.getByRole('button',{name:"Start today's preparation",exact:true}).click();
 await page.getByRole('heading',{name:'A clear path through your trading day',exact:true}).waitFor();
 const next=()=>page.getByRole('button',{name:'Continue →',exact:true}).click();
 await next();await next();
 await page.getByLabel('What would you like support with?',{exact:true}).selectOption(focus);
 if(focus==='impulsiveness') await page.screenshot({path:resolve(output,'supportive-setup.png'),fullPage:true});
 await next();await next();
 const question=await page.getByLabel('Your question 1',{exact:true}).inputValue();
 assert.ok(question.length>20);
 await page.getByLabel('Use the questions above in my routine').check();
 await next();await next();
 assert.equal(await page.getByText('Pinned market plan',{exact:true}).count(),0);
 assert.equal(await page.getByText('Process mission',{exact:true}).count(),0);
 await next();await page.getByRole('button',{name:'Save & open my preparation →',exact:true}).click();
 await page.getByText('Section 1 of 4',{exact:false}).waitFor();
 assert.equal(await page.getByText('Build today\'s trading plan',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Skip this section for today',exact:true}).click();
 await page.getByText('Section 2 of 4',{exact:false}).waitFor();
 await page.reload();
 await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Command Center',exact:true}).click();
 await page.getByRole('button',{name:'Start / resume preparation',exact:true}).waitFor();
 await page.getByRole('button',{name:'Start / resume preparation',exact:true}).click();
 await page.getByText('Section 2 of 4',{exact:false}).waitFor();
 if(focus==='impulsiveness'){
   await page.screenshot({path:resolve(output,'supportive-preparation.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.screenshot({path:resolve(output,'supportive-mobile.png'),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   console.log(JSON.stringify({mobileOverflow:await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))}))}));
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({focus,question,archive:'read-only',sections:4,reload:'resumed',errors}));
 await context.close();
 }
}finally{await browser.close();server.kill();writeFileSync('tsconfig.json',originalConfig);writeFileSync('next-env.d.ts',originalNextEnv);}
