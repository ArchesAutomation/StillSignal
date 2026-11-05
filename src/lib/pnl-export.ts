import type { Session } from "./model";
import { completedIdeas } from "./process/session-review";
import { dateInZone } from "./process/model";
import { mergeEvents } from "./trade-context";
export function snapshotTrades(sessions: Session[], owner: string, start: string, end: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
  const owned=sessions.filter(s=>s.owner===owner&&!s.demo&&s.id!=="workspace"), events=mergeEvents(owned.flatMap(s=>s.events));
  return completedIdeas(owned).filter(idea=>{const date=dateInZone(idea.exit!,zone);return date>=start&&date<=end;}).map(idea=>{
    const fills=idea.fillIds.map(id=>events.find(e=>e.id===id));
    const currencies=fills.map(e=>(e?.currency||e?.instrument?.currency||"").trim().toUpperCase());
    const currency=currencies.length&&currencies.every(c=>/^[A-Z]{3}$/.test(c)&&c===currencies[0])?currencies[0]:"";
    const complete=Number.isFinite(idea.pnl)&&idea.exitIds.every(id=>Number.isFinite(events.find(e=>e.id===id)?.pnl));
    return {...idea,currency,complete};
  });
}
export type SnapshotOptions={currency:string;total:number;complete:boolean;count:number;start:string;end:string;timezone:string;showDate:boolean;showTimezone:boolean;showCount:boolean;showSymbols:boolean;symbols:string[];caption:string;style:"ocean"|"midnight"};
export function paintSnapshot(ctx:CanvasRenderingContext2D,o:SnapshotOptions,image?:CanvasImageSource & {width:number;height:number}) {
  const gradient=ctx.createLinearGradient(0,0,1000,600);gradient.addColorStop(0,o.style==="ocean"?"#132d28":"#17243c");gradient.addColorStop(1,"#10141e");ctx.fillStyle=gradient;ctx.fillRect(0,0,1000,600);
  if(image){const scale=Math.max(1000/image.width,600/image.height);ctx.drawImage(image,(1000-image.width*scale)/2,(600-image.height*scale)/2,image.width*scale,image.height*scale);ctx.fillStyle="#07100bdb";ctx.fillRect(0,0,1000,600);}
  ctx.fillStyle="#ffffff0d";ctx.beginPath();ctx.roundRect(55,55,890,490,28);ctx.fill();ctx.strokeStyle="#bed7c240";ctx.stroke();
  function text(value:string,x:number,y:number,size:number,color:string){ctx.fillStyle=color;ctx.font=`${size}px system-ui`;while(ctx.measureText(value).width>820&&size>12){size--;ctx.font=`${size}px system-ui`;}ctx.fillText(value,x,y);}
  text("STILL SIGNAL  /  RECORDED REALISED P&L",90,115,20,"#b5cabc");let amount="P&L unavailable";
  if(o.complete){try{amount=new Intl.NumberFormat("en-US",{style:"currency",currency:o.currency}).format(o.total);}catch{amount=`${o.currency} ${o.total.toFixed(2)}`;}}
  text(amount,90,270,68,"#f3f7ef");text([o.showCount?`${o.count} closed ${o.count===1?"trade":"trades"}`:"",o.currency].filter(Boolean).join(" · "),90,330,24,"#f3f7ef");
  if(o.showSymbols)text([...new Set(o.symbols)].join(" · ").slice(0,100),90,375,20,"#c3d3c9");
  if(o.showDate)text(`${o.start===o.end?o.start:o.start+" → "+o.end}${o.showTimezone?" · "+o.timezone:""}`,90,425,20,"#c3d3c9");
  if(o.caption)text(o.caption.slice(0,70),90,470,20,"#c3d3c9");
  text("Saved closed-trade records · excludes open positions · no performance claim",90,515,16,"#c3d3c9");
}
