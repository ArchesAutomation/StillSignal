import type { Session, TradeEvent } from "./model";
import type { Candle } from "./market/model";

// The October 20 recording is explicitly labeled as simulated in Caleb's account.
// Its chart uses deterministic fictional candles so it never implies that a
// historical market provider supplied these prices.
export const oct20DemoSessionId = "c7ae1020-2026-4de0-9b80-4cbec02de001";
const oct20DemoOwner = "4d5ef3f4-c09e-499a-958e-975b1b1d9861";

export const isOct20Demo = (session: Session) =>
  session.id === oct20DemoSessionId &&
  session.owner === oct20DemoOwner;

export function oct20DemoCandles(session: Session, symbol: string): Candle[] {
  if (!isOct20Demo(session)) return [];
  return simulatedCandles(session, symbol);
}

export const isDemoSession = (session: Session) => session.demo === true || isOct20Demo(session);

export function demoCandles(session: Session, symbol: string): Candle[] {
  return isDemoSession(session) ? simulatedCandles(session, symbol) : [];
}

function simulatedCandles(session: Session, symbol: string): Candle[] {
  const events = session.events
    .filter((event) => !event.voided && event.symbol === symbol)
    .sort((a, b) => a.t - b.t);
  if (!events.length) return [];
  const first = events[0].price;
  const anchors: Pick<TradeEvent, "t" | "price">[] = [
    { t: session.startedAt, price: +(first - 0.34).toFixed(2) },
    ...events.map(({ t, price }) => ({ t, price })),
    { t: session.endedAt || events.at(-1)!.t, price: +(events.at(-1)!.price + 0.27).toFixed(2) },
  ];
  const count = Math.floor(((session.endedAt || events.at(-1)!.t) - session.startedAt) / 60000);
  const bars: Candle[] = [];
  let previous = anchors[0].price;
  for (let i = 0; i < count; i++) {
    const t = session.startedAt + i * 60000;
    let segment = 0;
    while (segment < anchors.length - 2 && anchors[segment + 1].t < t + 60000)
      segment++;
    const a = anchors[segment],
      b = anchors[segment + 1];
    const progress = Math.max(0, Math.min(1, (t + 60000 - a.t) / (b.t - a.t)));
    const swing =
      Math.sin(Math.PI * progress) *
      (Math.sin(i * 0.32 + symbol.length) * 0.31 + Math.sin(i * 0.087) * 0.18);
    const close = +(a.price + (b.price - a.price) * progress + swing).toFixed(2);
    const open = previous;
    const wick = 0.055 + Math.abs(Math.sin(i * 0.41 + symbol.length)) * 0.095;
    bars.push({
      t,
      end: t + 60000,
      open,
      high: +(Math.max(open, close) + wick).toFixed(2),
      low: +(Math.min(open, close) - wick * 0.8).toFixed(2),
      close,
      complete: true,
      observedAt: session.endedAt || t + 60000,
    });
    previous = close;
  }
  return bars;
}
