import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const [owner, output] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/.test(owner || "") || !output) throw Error("Usage: node scripts/seed-demo-month.mjs OWNER_UUID OUTPUT_SQL");
const uuid = value => { const h = createHash("sha256").update(`still-signal-demo-oct2026:${owner}:${value}`).digest("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
const sessions = [];
const labels = ["Focused", "Calm", "FOMO", "Frustrated", "Confident", "Impatient"];
const phaseWords = {
  before: ["Wrote the invalidation level and waited for the opening range.", "Noticed the urge to make back the previous loss before a setup formed."],
  entry: ["Waited for confirmation, then entered with the risk already defined.", "Entered early because I was worried the move would leave without me."],
  management: ["Let the position work and kept the stop at the planned level.", "Kept checking unrealised P&L and felt tempted to move the stop."],
  exit: ["Closed at the planned exit and recorded the decision before looking for another trade.", "Exited before the planned level when the pullback felt uncomfortable."],
  after: ["Took a short break. Following the process felt more useful than judging the result.", "Noticed a strong urge to re-enter. Paused and checked the original plan first."],
};
for (let day = 1; day <= 31; day++) {
  const start = Date.UTC(2026, 9, day, 13, 30), weekday = new Date(start).getUTCDay();
  if (weekday === 0 || weekday === 6) continue;
  const index = sessions.length, id = uuid(`day-${day}`), end = start + 390 * 60000;
  const baseline = 65 + index % 7, load = [8, 15, 25, 36][index % 4], count = 3 + index % 3;
  const events = [], journal = [], windows = [];
  for (let n = 0; n < count; n++) {
    const entry = start + (30 + n * 70 + index % 6) * 60000;
    const exit = entry + (18 + (index + n) % 15) * 60000;
    const symbol = ["AAPL", "NVDA", "MSFT"][(index + n) % 3], side = (index + n) % 2 ? "short" : "long";
    const entryPrice = +(180 + ((index * 11 + n * 7) % 80) + .37).toFixed(2);
    const win = (index + n * 2) % 7 < (load < 20 ? 5 : 3);
    const change = (win ? 1 : -1) * (.42 + ((index + n) % 5) * .23);
    const exitPrice = +(entryPrice + (side === "long" ? change : -change)).toFixed(2);
    const entryId = uuid(`day-${day}-trade-${n}-entry`), exitId = uuid(`day-${day}-trade-${n}-exit`);
    const common = { symbol, side, quantity: 100, source: "manual", provenance: "execution", account: "DEMO · Simulated account", currency: "USD", multiplier: 1, fees: 0 };
    events.push({ ...common, id: entryId, t: entry, kind: "entry", action: side === "long" ? "buy" : "sell", price: entryPrice });
    events.push({ ...common, id: exitId, t: exit, kind: "exit", action: side === "long" ? "sell" : "buy", price: exitPrice, pnl: +(change * 100).toFixed(2) });
    windows.push({ entry, exit, entryId, label: labels[(index + n) % labels.length], win });
  }
  function bpmAt(t) {
    const seconds = (t - start) / 1000;
    let value = baseline + Math.sin(seconds / 31) * 2.3 + Math.sin(seconds / 8.2) * 1.2;
    for (const w of windows) {
      value += load * Math.exp(-1 * (((t - w.entry) / 60000) / 3.2) ** 2);
      value += (w.win ? load * .35 : load * .85) * Math.exp(-1 * (((t - w.exit) / 60000) / 5) ** 2);
    }
    return Math.max(52, Math.min(145, Math.round(value)));
  }
  for (let n = 0; n < windows.length; n++) {
    const w = windows[n];
    for (const [phase, t] of [["before",w.entry-600000],["entry",w.entry],["management",(w.entry+w.exit)/2],["exit",w.exit],["after",w.exit+300000]]) {
      const bpm = bpmAt(t);
      journal.push({ id: uuid(`day-${day}-${n}-${phase}`), t, eventTime: t, section: phase, tradeId: w.entryId, order: t, label: w.label,
        text: phaseWords[phase][load >= 25 ? 1 : 0], source: "typed", context: { bpm, baseline, delta: bpm - baseline, eventId: w.entryId } });
    }
  }
  const note = (section, text, extra = {}) => ({ id: uuid(`day-${day}-${section}`), t: end, eventTime: null, section, label: "Unlabelled", text, source: "typed", ...extra });
  journal.push(note("day-review", "Session review\n\nBefore the trade\nI set my risk and opening-range conditions before the session.\n\nDuring the trade\nI noticed the difference between following the plan and reacting to P&L.\n\nExit and after\nMy next practice is to pause after each exit before choosing another setup."));
  journal.push(note("stillness", "A thought about the next opportunity can be present without becoming an instruction."));
  journal.push(note("post-session", "I can take responsibility for the decision without turning the outcome into a verdict about myself.", { support: { outcome: events.filter(e=>e.kind === "exit").reduce((a,e)=>a+e.pnl,0) >= 0 ? "profit" : "loss", adherence: load < 20 ? "followed" : "partly" } }));
  const samples = [];
  for (let t = start; t <= end; t += 5000) samples.push({ t, bpm: bpmAt(t) });
  sessions.push({ session: { id, name: `DEMO · October ${day} · New York`, owner, source: "journal", demo: true, timezone: "America/New_York", startedAt: start, endedAt: end, sampleCount: samples.length, events, journal }, samples, windows, baseline, load });
}
// Only this newly created demo account is seeded. Stable IDs make retries additive.
const sql = [];
for (const {session,samples,windows,baseline,load} of sessions) {
  const guard = `do $$ begin if not exists(select 1 from auth.users where id='${owner}'::uuid and raw_app_meta_data->>'demo'='true') then raise exception 'demo account required'; end if; end $$;`;
  const insert = `insert into public.pulse_sessions(id,user_id,started_at,data) values('${session.id}','${owner}',${session.startedAt},$payload$${JSON.stringify(session)}$payload$::jsonb) on conflict(id) do nothing;`;
  const values = windows.map(w=>`(${w.entry}::bigint,${w.exit}::bigint,${w.win ? '.35' : '.85'}::double precision)`).join(',');
  const chunks = Array.from({length:Math.ceil(samples.length/120)},(_,i)=>`(${i},'${uuid(`${session.id}-chunk-${i*120}`)}'::uuid)`).join(',');
  const points = `with windows(entry_t,exit_t,factor) as (values ${values}), points as (select i,${session.startedAt}::bigint+i*5000::bigint as t,greatest(52,least(145,round(${baseline}+sin(i*5.0/31)*2.3+sin(i*5.0/8.2)*1.2+(select sum(${load}*exp(-least(60,power(((${session.startedAt}+i*5000.0-entry_t)/60000)/3.2,2)))+${load}*factor*exp(-least(60,power(((${session.startedAt}+i*5000.0-exit_t)/60000)/5,2)))) from windows))))::integer as bpm from generate_series(0,4680) i), chunks(n,id) as (values ${chunks}) insert into public.pulse_sample_chunks(id,session_id,user_id,samples) select chunks.id,'${session.id}'::uuid,'${owner}'::uuid,jsonb_agg(jsonb_build_object('t',p.t,'bpm',p.bpm) order by p.i) from points p join chunks on chunks.n=p.i/120 group by chunks.id on conflict(id) do nothing;`;
  sql.push(`begin; ${guard} ${insert} ${points} commit;`);
}
await writeFile(output,sql.join("\n"));
console.log(JSON.stringify({sessions:sessions.length,trades:sessions.reduce((n,s)=>n+s.session.events.length/2,0),samples:sessions.reduce((n,s)=>n+s.samples.length,0),reflections:sessions.reduce((n,s)=>n+s.session.journal.length,0)}));
