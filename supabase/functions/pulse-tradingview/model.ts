export type WearableProvider = "whoop" | "apple" | "oura" | "garmin";
export type Sample = { t: number; bpm: number; provider?: WearableProvider };
export type Instrument = {
  id: string;
  symbol: string;
  assetClass: "equity" | "option" | "future" | "forex" | "crypto";
  exchange?: string;
  currency: string;
  multiplier: number;
  expiry?: string;
  providerSymbol?: string;
};
export type TradeEvent = {
  id: string;
  t: number;
  symbol: string;
  kind: "entry" | "exit" | "fill";
  side: "long" | "short" | "unknown";
  price: number;
  quantity: number;
  account?: string;
  pnl?: number;
  source: "manual" | "csv" | "tradingview" | "broker";
  provenance?: "alert" | "strategy" | "backtest" | "execution";
  broker?: {
    provider: string;
    connectionId: string;
    accountId: string;
    executionId: string;
  };
  instrument?: Instrument;
  currency?: string;
  fees?: number;
  multiplier?: number;
  receivedAt?: number;
  revision?: number;
  voided?: boolean;
  positionKnown?: boolean;
  action?: "buy" | "sell";
  timePrecision?: "millisecond" | "second" | "day";
};
export type JournalEntry = {
  id: string;
  t: number;
  label: string;
  text: string;
  updatedAt?: number;
  deletedAt?: number;
  source?: "typed" | "voice" | "hr-checkin";
  context?: {
    bpm?: number;
    baseline?: number;
    delta?: number;
    eventId?: string;
    hrEventId?: string;
  };
  screenshot?: { path: string; name: string };
};
export type Session = {
  id: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  source: "whoop" | "journal" | "csv" | "tradingview";
  wearable?: {
    provider: WearableProvider;
    connection: "bluetooth" | "cloud" | "import";
  };
  events: TradeEvent[];
  journal: JournalEntry[];
  owner: string;
  sampleCount: number;
};
export type Settings = {
  cadence: number;
  baselineSeconds: number;
  windowSeconds: number;
  threshold: number;
  alerts: boolean;
  sound: boolean;
  spokenPrompt: boolean;
  cooldownSeconds: number;
  shortcutKey: string;
  personalize: boolean;
};
export const defaults: Settings = {
  cadence: 30,
  baselineSeconds: 300,
  windowSeconds: 60,
  threshold: 20,
  alerts: true,
  sound: false,
  spokenPrompt: false,
  cooldownSeconds: 120,
  shortcutKey: "j",
  personalize: true,
};
export const cadenceOptions = [15, 30, 60, 300, 600, 1200, 3600];
export function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}
export function clock(t: number) {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
