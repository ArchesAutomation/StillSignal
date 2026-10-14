import type { Session, Sample, Instrument } from "./model";
import type { Candle } from "./market/model";
export const reviewOwner = "88888888-8888-4888-8888-888888888888";
export const reviewSessionId = "99999999-9999-4999-8999-999999999999";
const start = Date.parse("2026-10-13T14:30:00Z");
export const reviewInstrument: Instrument = {
  id: "review:XNAS:AAPL",
  symbol: "AAPL",
  assetClass: "equity",
  exchange: "XNAS",
  currency: "USD",
  multiplier: 1,
  providerSymbol: "AAPL",
};
export function reviewCandles(interval: number): Candle[] {
  const raw = reviewFixtures().candles,
    bars: Candle[] = [];
  const size = interval / 60;
  for (let i = 0; i < raw.length; i += size) {
    const group = raw.slice(i, i + size),
      first = group[0],
      last = group.at(-1)!;
    bars.push({
      ...first,
      end: first.t + interval * 1000,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: last.close,
      volume: group.reduce((sum, c) => sum + (c.volume || 0), 0),
      complete: group.length === size,
    });
  }
  return bars;
}
export function reviewFixtures() {
  const candles: Candle[] = Array.from({ length: 75 }, (_, i) => {
    const open = 230.5 + i * 0.022 + Math.sin(i * 0.23) * 0.42,
      close = open + Math.sin(i * 0.71) * 0.21;
    return {
      t: start + i * 60000,
      end: start + (i + 1) * 60000,
      open: +open.toFixed(2),
      high: +(Math.max(open, close) + 0.12).toFixed(2),
      low: +(Math.min(open, close) - 0.1).toFixed(2),
      close: +close.toFixed(2),
      volume: 22000 + (i % 9) * 1842,
      complete: true,
      observedAt: start + 75 * 60000,
    };
  });
  const samples: Sample[] = Array.from({ length: 4500 }, (_, i) => ({
    t: start + i * 1000,
    bpm: Math.round(
      73 +
        Math.sin(i * 0.025) * 3 +
        (i > 1300 && i < 1480 ? 20 + Math.sin(i * 0.04) * 8 : 0) +
        (i > 3100 && i < 3190 ? 16 : 0),
    ),
  })).filter((_, i) => i < 2050 || i > 2080);
  const trades = [
    {
      id: "review-e1",
      t: start + 12 * 60000,
      symbol: "AAPL",
      kind: "entry" as const,
      side: "long" as const,
      price: 230.84,
      quantity: 100,
      source: "csv" as const,
      provenance: "execution" as const,
      account: "Review account",
    },
    {
      id: "review-e2",
      t: start + 23 * 60000,
      symbol: "AAPL",
      kind: "exit" as const,
      side: "long" as const,
      price: 231.76,
      quantity: 100,
      source: "csv" as const,
      provenance: "execution" as const,
      pnl: 92,
      account: "Review account",
    },
    {
      id: "review-e3",
      t: start + 39 * 60000,
      symbol: "AAPL",
      kind: "entry" as const,
      side: "short" as const,
      price: 231.3,
      quantity: 50,
      source: "manual" as const,
      account: "Review account",
    },
    {
      id: "review-e4",
      t: start + 53 * 60000,
      symbol: "AAPL",
      kind: "exit" as const,
      side: "short" as const,
      price: 231.48,
      quantity: 50,
      source: "manual" as const,
      pnl: -9,
      account: "Review account",
    },
  ].map((e) => ({ ...e, instrument: reviewInstrument, currency: "USD" }));
  const session: Session = {
    id: reviewSessionId,
    owner: reviewOwner,
    name: "Morning review · AAPL",
    startedAt: start,
    endedAt: start + 75 * 60000,
    source: "journal",
    sampleCount: samples.length,
    events: trades,
    journal: [
      {
        id: "review-n1",
        t: start + 24 * 60000,
        label: "Focused",
        text: "Waited for the level. The exit felt rushed even though the plan was clear.",
        updatedAt: start + 24 * 60000,
        context: { bpm: 96, baseline: 73, delta: 23 },
      },
      {
        id: "review-n2",
        t: start + 54 * 60000,
        label: "Impatient",
        text: "Took the second entry before the confirmation I had written down.",
        updatedAt: start + 54 * 60000,
      },
    ],
  };
  return { session, samples, candles };
}
