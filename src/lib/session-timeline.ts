import Papa from "papaparse";
import { Temporal } from "@js-temporal/polyfill";
import type { Session, Sample, JournalEntry, TradeEvent } from "./model";
import { noCombination, pnlPointSchema, type PnlPoint } from "./blueprint-schema";
import { noteTime, sessionTrades } from "./journal-routing";
import { isActualExecution } from "./trade-context";

export type TimelineEvent = { id: string; t: number; kind: "fill" | "hr" | "pnl" | "reflection" | "context"; source: string; data: TradeEvent | Sample | PnlPoint | JournalEntry | NonNullable<Session["blueprint"]>["context"] };
export function normalizedTimeline(session: Session, samples: Sample[]): TimelineEvent[] {
  return [
    ...session.events.filter(e => !e.voided).map(e => ({ id: e.id, t: e.t, kind: "fill" as const, source: e.broker?.provider || e.source, data: e })),
    ...samples.map(p => ({ id: `hr-${p.t}`, t: p.t, kind: "hr" as const, source: p.provider || session.wearable?.provider || "recorded HR", data: p })),
    ...(session.blueprint?.pnl || []).map((p,i) => ({ id: `pnl-${i}`, t: p.t, kind: "pnl" as const, source: p.source, data: p })),
    ...session.journal.filter(n => !n.deletedAt).map(n => ({ id: n.id, t: noteTime(n) ?? n.capturedAt ?? n.t, kind: "reflection" as const, source: n.inputMethod || n.source || "text", data: n })),
    ...(session.blueprint?.context ? [{ id: "context", t: session.startedAt, kind: "context" as const, source: "user-entered", data: session.blueprint.context }] : []),
  ].sort((a,b) => a.t-b.t || a.id.localeCompare(b.id));
}
export const captureMode = (note: JournalEntry) => note.captureMode === "live" ? "LIVE" : note.captureMode === "post-session" ? "POST-SESSION" : "LEGACY · origin unknown";
export function parsePnlCsv(csv: string, timezone: string): PnlPoint[] {
  if (new TextEncoder().encode(csv).length > 2_000_000) throw new Error("Choose a P&L CSV smaller than 2 MB.");
  const parsed = Papa.parse<Record<string,string>>(csv, { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim().toLowerCase() });
  if (parsed.errors.length || !parsed.data.length || parsed.data.length > 5000) throw new Error("Choose a valid P&L CSV with 1–5,000 rows.");
  const headers = parsed.meta.fields || [];
  if (!["timestamp", "account", "currency", "realised"].every(h => headers.includes(h))) throw new Error("Required columns: timestamp, account, currency, realised. Optional: symbol, position, unrealised, equity. Realised is cumulative for the session.");
  return parsed.data.map((r,i) => {
    let t: number;
    try { t = /(?:Z|[+-]\d\d:\d\d)$/i.test(r.timestamp) ? Temporal.Instant.from(r.timestamp).epochMilliseconds
      : Temporal.PlainDateTime.from(r.timestamp.replace(" ", "T")).toZonedDateTime(timezone, { disambiguation: "reject" }).epochMilliseconds; }
    catch { throw new Error(`P&L row ${i+2}: invalid or ambiguous timestamp; include a UTC offset.`); }
    const number = (key: string) => r[key]?.trim() ? Number(r[key]) : undefined;
    const point = pnlPointSchema.safeParse({ t, account: r.account?.trim(), symbol: r.symbol?.trim() || "Account", currency: r.currency?.trim().toUpperCase(),
      realised: number("realised"), unrealised: number("unrealised"), equity: number("equity"), position: number("position"), source: "csv" });
    if (!point.success || !r.account?.trim()) throw new Error(`P&L row ${i+2}: check account, currency and numeric values.`);
    return point.data;
  }).sort((a,b) => a.t-b.t);
}
/** Single account and currency only: follower accounts never inflate exposure. */
export function pnlExposure(session: Session, account: string, currency: string, threshold = 0, symbol?: string) {
  const candidates = (session.blueprint?.pnl || []).filter(p => p.account === account && p.currency === currency);
  const selectedSymbol = symbol || (candidates.some(p => p.symbol === "Account") ? "Account" : candidates[0]?.symbol);
  const snapshots = candidates.filter(p => p.symbol === selectedSymbol).sort((a,b) => a.t-b.t);
  let realised = 0;
  const points: PnlPoint[] = snapshots.length ? snapshots : session.events.filter(e => isActualExecution(e) &&
    (e.broker?.accountId || e.account || "manual") === account && (e.currency || "USD") === currency && e.pnl !== undefined)
    .sort((a,b) => a.t-b.t).map(e => ({ t: e.t, account, currency, symbol: e.symbol, realised: realised += e.pnl!, source: e.source === "broker" ? "broker" as const : "csv" as const }));
  let peak = -Infinity, maxDrawdown = 0, peakOpen: number | null = null, giveback = 0, aboveMs = 0, belowMs = 0;
  const curve = points.map((p,i) => {
    const total = p.realised + (p.unrealised || 0);
    peak = Math.max(peak, total); maxDrawdown = Math.max(maxDrawdown, peak-total);
    if (p.unrealised !== undefined) { peakOpen = Math.max(peakOpen ?? p.unrealised, p.unrealised); giveback = Math.max(giveback, peakOpen-p.unrealised); }
    // No interpolation through gaps longer than 60 seconds.
    const dt = i ? p.t-points[i-1].t : 0;
    if (dt > 0 && dt <= 60000) {
      const previous = points[i-1].realised + (points[i-1].unrealised || 0);
      if (previous > threshold) aboveMs += dt; else if (previous < threshold) belowMs += dt;
    }
    return { ...p, total, peak, drawdown: peak-total };
  });
  return { curve, peakOpen, maxDrawdown: curve.length ? maxDrawdown : null, giveback: peakOpen === null ? null : giveback, aboveMs, belowMs, symbol: selectedSymbol,
    hasOpenPnl: peakOpen !== null, source: snapshots.length ? "Cumulative CSV snapshots" : "Realised fills only · open P&L unavailable" };
}
export function adherence(session: Session) {
  const rules = session.blueprint?.commitments || [];
  return { total: rules.length, followed: rules.filter(r => r.result === "followed").length,
    deviated: rules.filter(r => r.result === "deviated"), pending: rules.filter(r => r.result === "pending").length };
}
export function sessionObservations(session: Session, samples: Sample[], baselineSeconds = 300) {
  const combine = session.blueprint?.combine || noCombination;
  const timeline = normalizedTimeline(session,samples);
  const hr = combine.hr ? timeline.filter(e => e.kind === "hr").map(e => e.data as Sample) : [];
  const opening = hr.filter(p => p.t < (hr[0]?.t || 0)+baselineSeconds*1000);
  const baseline = opening.length >= 30 && opening.at(-1)!.t-opening[0].t >= baselineSeconds*800
    ? opening.reduce((n,p)=>n+p.bpm,0)/opening.length : null;
  const recoveries: { id: string; seconds: number }[] = [];
  if (baseline !== null) for (const idea of sessionTrades(session)) {
    if (idea.exit === undefined) continue;
    const atExit = hr.find(p=>p.t>=idea.exit!&&p.t-idea.exit!<=10000);
    if (!atExit || atExit.bpm<=baseline+5) continue;
    let low: number | undefined, previous = idea.exit;
    for (const p of hr.filter(p=>p.t>idea.exit!&&p.t<=idea.exit!+600000)) {
      if (p.t-previous>10000) low=undefined;
      previous=p.t;
      if(p.bpm<=baseline+5) low??=p.t; else low=undefined;
      if(low!==undefined && p.t-low>=30000){recoveries.push({id:idea.id,seconds:(low-idea.exit)/1000});break;}
    }
  }
  const notes = combine.transcript ? session.journal.filter(n=>!n.deletedAt) : [];
  const voice = combine.audio && combine.transcript ? notes.filter(n=>n.audio&&n.audio.durationSeconds>0&&n.originalTranscript)
    .map(n=>({id:n.id,t:noteTime(n)??n.capturedAt??n.t,wpm:Math.round(n.originalTranscript!.trim().split(/\s+/).length/(n.audio!.durationSeconds/60))})) : [];
  const comparisons = notes.filter(n=>n.captureMode==="live").flatMap(live=>notes.filter(n=>n.captureMode==="post-session"&&n.tradeId===live.tradeId&&n.section===live.section)
    .map(later=>({live,later})));
  return { timeline, baseline, recoverySeconds:recoveries.length?recoveries.reduce((n,r)=>n+r.seconds,0)/recoveries.length:null,
    recoveryCount:recoveries.length, voice, comparisons };
}
export function environmentPatterns(sessions: Session[], owner: string, now = Date.now()) {
  const eligible = sessions.filter(s => s.owner === owner && !s.demo && s.startedAt >= now-30*86400000 && s.startedAt <= now
    && s.blueprint?.combine?.environment && s.blueprint.context?.location);
  const groups = new Map<string, Session[]>();
  for (const s of eligible) {
    const c = s.blueprint!.context!;
    // Compare similar setups, strategies, news conditions and local session hours.
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: s.timezone || "UTC", hour: "2-digit", hourCycle: "h23" }).format(s.startedAt));
    const key = JSON.stringify([c.location,c.social,c.setup,c.strategy,c.newsDay,Math.floor(hour/4),c.accountSize ?? null]);
    groups.set(key,[...(groups.get(key)||[]),s]);
  }
  return [...groups.values()].map(rows => {
    const days = new Set(rows.map(s => Temporal.Instant.fromEpochMilliseconds(s.startedAt).toZonedDateTimeISO(s.timezone || "UTC").toPlainDate().toString()));
    const assessed = rows.filter(s => adherence(s).total > 0 && adherence(s).pending === 0);
    const followed = assessed.reduce((n,s) => n+adherence(s).followed,0), total = assessed.reduce((n,s) => n+adherence(s).total,0);
    const hrRows = rows.filter(s=>s.blueprint?.combine?.hr).map(s=>s.journal.filter(n=>!n.deletedAt&&n.context?.delta!==undefined));
    const deltas = hrRows.flat().map(n=>n.context!.delta!);
    const perDay = [...days].map(day => {
      const dayRows=rows.filter(s=>Temporal.Instant.fromEpochMilliseconds(s.startedAt).toZonedDateTimeISO(s.timezone||"UTC").toPlainDate().toString()===day);
      const rules=[...new Map(dayRows.flatMap(s=>s.blueprint?.commitments||[]).map(r=>[r.id,r])).values()];
      const scored=rules.filter(r=>r.result!=="pending");
      return scored.length?scored.filter(r=>r.result==="followed").length/scored.length:null;
    }).filter((x):x is number=>x!==null);
    return { context: rows[0].blueprint!.context!, sessions: rows, count: days.size,
      evidence: days.size >= 10 ? "More established" : days.size >= 5 ? "Early signal" : "Collecting evidence",
      adherence: days.size >= 5 && perDay.length >= 5 ? perDay.reduce((n,x)=>n+x,0)/perDay.length : null, assessed: perDay.length,
      meanHrDelta: days.size >= 5 && deltas.length >= 5 ? deltas.reduce((n,x)=>n+x,0)/deltas.length : null, hrCount: deltas.length,
      start: Math.min(...rows.map(s => s.startedAt)), end: Math.max(...rows.map(s => s.startedAt)) };
  }).sort((a,b) => b.count-a.count);
}
