import type { Instrument } from "../model";
export type Candle = {
  t: number;
  end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  complete: boolean;
  observedAt: number;
};
export type MarketRequest = {
  instrument: Instrument;
  accountId?: string;
  start: number;
  end: number;
  interval: 60 | 300 | 900 | 3600;
  replay: boolean;
};
export type MarketFeed = {
  state: "ready" | "unavailable" | "error";
  provider: string;
  message: string;
  candles: Candle[];
  asOf: number;
  freshness: "historical" | "periodic" | "live";
  granularity: string;
};
export interface MarketAdapter {
  provider: string;
  candles(request: MarketRequest): Promise<MarketFeed>;
}
