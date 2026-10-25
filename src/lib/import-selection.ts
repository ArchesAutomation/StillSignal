import { Temporal } from "@js-temporal/polyfill";
import type { Session, TradeEvent } from "./model";
import { positionIdeas } from "./position-ideas";
export function missingOpeningFills(all: TradeEvent[], selected: TradeEvent[]) {
  const ids=new Set(selected.map(e=>e.id));
  return positionIdeas(all).filter(idea=>idea.fillIds.some(id=>ids.has(id))&&!ids.has(idea.entryEventId!));
}
export type ImportSource = NonNullable<NonNullable<Session["blueprint"]>["imports"]>[number];
export function availableCsvSessions(events: TradeEvent[], timezone: string) {
  const groups: { id: string; day: string; account: string; start: number; end: number; events: TradeEvent[] }[] = [];
  const latest = new Map<string, typeof groups[number]>();
  for (const e of [...events].sort((a,b)=>a.t-b.t)) {
    const day = Temporal.Instant.fromEpochMilliseconds(e.t).toZonedDateTimeISO(timezone).toPlainDate().toString();
    const account=e.broker?.accountId||e.account||"manual", key=`${day}:${account}`;
    let group=latest.get(key);
    if(!group || e.t-group.end>90*60000) { group={id:`${key}:${e.id}`,day,account,start:e.t,end:e.t,events:[]}; groups.push(group); latest.set(key,group); }
    group.events.push(e); group.end=e.t;
  }
  return groups;
}
export function cropCsv(events: TradeEvent[], {day,account,start,end,timezone}: {day?: string;account?: string;start?: string;end?: string;timezone:string}) {
  const instant=(s?:string)=>s?Temporal.PlainDateTime.from(s).toZonedDateTime(timezone,{disambiguation:"reject"}).epochMilliseconds:undefined;
  const from=instant(start),to=instant(end);
  if(from!==undefined&&to!==undefined&&from>to) throw new Error("The session end must follow its start.");
  return events.filter(e=>(!account||(e.broker?.accountId||e.account||"manual")===account)&&
    (!day||Temporal.Instant.fromEpochMilliseconds(e.t).toZonedDateTimeISO(timezone).toPlainDate().toString()===day)&&
    (from===undefined||e.t>=from)&&(to===undefined||e.t<=to));
}
