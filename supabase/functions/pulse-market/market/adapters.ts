import type { Candle, MarketAdapter, MarketFeed, MarketRequest } from "./model.ts";
import { Buffer } from "node:buffer";
import { providerJson, ProviderError } from "../brokers/http.ts";
import { oandaRequest } from "../brokers/oanda.ts";
import { projectxRequest } from "../brokers/projectx.ts";
import { tradeStationRequest } from "../brokers/tradestation.ts";
import type { BrokerCredentials } from "../brokers/model.ts";
function feed(
  provider: string,
  candles: Candle[],
  granularity: string,
): MarketFeed {
  return {
    state: "ready",
    provider,
    candles,
    message: candles.length
      ? "Market data available"
      : "No candles in this interval.",
    asOf: Date.now(),
    freshness: "periodic",
    granularity,
  };
}
function candle(
  t: number,
  interval: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume?: number,
  complete?: boolean,
): Candle {
  if (
    ![t, open, high, low, close].every(Number.isFinite) ||
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  )
    throw new ProviderError("INVALID_MARKET_BAR");
  return {
    t,
    end: t + interval * 1000,
    open,
    high,
    low,
    close,
    ...(volume === undefined ? {} : { volume }),
    complete: complete ?? t + interval * 1000 <= Date.now(),
    observedAt: Date.now(),
  };
}
export const massive: MarketAdapter = {
  provider: "Massive",
  async candles(r) {
    const symbol = r.instrument.providerSymbol || r.instrument.symbol;
    const path =
      "/v2/aggs/ticker/" +
      encodeURIComponent(symbol) +
      "/range/" +
      r.interval / 60 +
      "/minute/" +
      Math.floor(r.start) +
      "/" +
      Math.floor(r.end);
    const result = await providerJson(
      "https://api.massive.com" + path + "?adjusted=true&sort=asc&limit=50000",
      { headers: { Authorization: "Bearer " + Deno.env.get("MASSIVE_API_KEY") } },
    );
    if (result.next_url) throw new ProviderError("MARKET_WINDOW_TOO_LARGE");
    return feed(
      "Massive",
      (result.results || []).map(
        (b: {
          t: number;
          o: number;
          h: number;
          l: number;
          c: number;
          v: number;
        }) => candle(b.t, r.interval, b.o, b.h, b.l, b.c, b.v),
      ),
      r.interval / 60 + "m OHLC · periodic",
    );
  },
};
export const databento: MarketAdapter = {
  provider: "Databento",
  async candles(r) {
    const params = new URLSearchParams({
      dataset: "GLBX.MDP3",
      schema: "ohlcv-1m",
      symbols: r.instrument.providerSymbol || r.instrument.symbol,
      stype_in: "raw_symbol",
      start: new Date(r.start).toISOString(),
      end: new Date(r.end).toISOString(),
      encoding: "json",
      pretty_px: "true",
      pretty_ts: "true",
      map_symbols: "true",
    });
    const response = await fetch(
      "https://hist.databento.com/v0/timeseries.get_range",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(Deno.env.get("DATABENTO_API_KEY") + ":").toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      throw new ProviderError(
        response.status === 403
          ? "MARKET_ENTITLEMENT_REQUIRED"
          : "PROVIDER_UNAVAILABLE",
      );
    const text = await response.text();
    if (text.length > 4000000)
      throw new ProviderError("MARKET_WINDOW_TOO_LARGE");
    const rows = text.trim()
      ? text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    const minutes = rows.map((row) =>
      candle(
        Date.parse(row.hd.ts_event),
        60,
        Number(row.open),
        Number(row.high),
        Number(row.low),
        Number(row.close),
        Number(row.volume),
      ),
    );
    return feed(
      "Databento",
      aggregateCandles(minutes, r.interval),
      r.interval / 60 + "m OHLC · historical API",
    );
  },
};
export function aggregateCandles(input: Candle[], interval: number) {
  const buckets = new Map<number, Candle>();
  for (const b of [...input].sort((a, b) => a.t - b.t)) {
    const t = Math.floor(b.t / (interval * 1000)) * interval * 1000,
      old = buckets.get(t);
    if (!old)
      buckets.set(t, { ...b, t, end: t + interval * 1000, complete: false });
    else {
      old.high = Math.max(old.high, b.high);
      old.low = Math.min(old.low, b.low);
      old.close = b.close;
      old.volume = (old.volume || 0) + (b.volume || 0);
      old.observedAt = Math.max(old.observedAt, b.observedAt);
    }
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    complete: b.end <= Date.now(),
  }));
}
export async function brokerCandles(
  provider: string,
  credentials: BrokerCredentials,
  r: MarketRequest,
): Promise<MarketFeed> {
  if (provider === "oanda") {
    const g: Record<number, string> = {
      60: "M1",
      300: "M5",
      900: "M15",
      3600: "H1",
    };
    const result = await oandaRequest(
      credentials,
      "/v3/instruments/" +
        encodeURIComponent(r.instrument.providerSymbol || r.instrument.symbol) +
        "/candles?" +
        new URLSearchParams({
          from: new Date(r.start).toISOString(),
          to: new Date(r.end).toISOString(),
          granularity: g[r.interval],
          price: "M",
        }),
    );
    return feed(
      "OANDA",
      result.candles.map(
        (b: {
          time: string;
          mid: { o: string; h: string; l: string; c: string };
          volume: number;
          complete: boolean;
        }) =>
          candle(
            Date.parse(b.time),
            r.interval,
            +b.mid.o,
            +b.mid.h,
            +b.mid.l,
            +b.mid.c,
            b.volume,
            b.complete,
          ),
      ),
      r.interval / 60 + "m midpoint OHLC",
    );
  }
  if (provider === "projectx") {
    const result = await projectxRequest(credentials, "History/retrieveBars", {
      contractId: r.instrument.providerSymbol || r.instrument.id,
      live: credentials.environment === "live",
      startTimestamp: new Date(r.start).toISOString(),
      endTimestamp: new Date(r.end).toISOString(),
      unit: 2,
      unitNumber: r.interval / 60,
      limit: 20000,
      includePartialBar: !r.replay,
    });
    return feed(
      "ProjectX",
      result.bars.map(
        (b: {
          t: string;
          o: number;
          h: number;
          l: number;
          c: number;
          v: number;
        }) => candle(Date.parse(b.t), r.interval, b.o, b.h, b.l, b.c, b.v),
      ),
      "Firm-entitled " + r.interval / 60 + "m OHLC",
    );
  }
  if (provider === "tradestation") {
    const result = await tradeStationRequest(
      credentials,
      "marketdata/barcharts/" +
        encodeURIComponent(r.instrument.providerSymbol || r.instrument.symbol) +
        "?" +
        new URLSearchParams({
          interval: String(r.interval / 60),
          unit: "Minute",
          startdate: new Date(r.start).toISOString(),
          lastdate: new Date(r.end).toISOString(),
        }),
    );
    return feed(
      "TradeStation",
      (result.Bars || []).map(
        (b: {
          TimeStamp: string;
          Open: string;
          High: string;
          Low: string;
          Close: string;
          TotalVolume: string;
        }) =>
          candle(
            Date.parse(b.TimeStamp),
            r.interval,
            +b.Open,
            +b.High,
            +b.Low,
            +b.Close,
            +b.TotalVolume,
          ),
      ),
      "Broker-entitled " + r.interval / 60 + "m OHLC",
    );
  }
  throw new ProviderError("BROKER_MARKET_RELAY_REQUIRED");
}
