"use client";
import { useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { LegacyTimeline } from "./legacy-timeline";
import { useMarketData } from "./use-market-data";
import type { Instrument } from "@/lib/model";
import { clock } from "@/lib/model";
import { executionAction, eventOrigin } from "@/lib/trade-context";
const SynchronizedChart = dynamic(() => import("./synchronized-chart"), {
  ssr: false,
  loading: () => (
    <div className="chart-loading">Opening synchronized chart…</div>
  ),
});
type Props = ComponentProps<typeof LegacyTimeline> & {
  owner?: string;
  instrument?: Instrument;
  accountId?: string;
  replay?: boolean;
  cutoff?: number;
  selectedTime?: number;
  sessionStart?: number;
  sessionEnd?: number;
  viewportKey?: string;
  instrumentScope?: string;
};
export function Timeline(props: Props) {
  const [interval, setInterval] = useState<60 | 300 | 900 | 3600>(60);
  const [volume, setVolume] = useState(false);
  const [hrHeight, setHrHeight] = useState(120);
  const [liveVersion, setLiveVersion] = useState(0);
  const [resolved, setResolved] = useState<{
    instrument: Instrument;
    scope: string;
  }>();
  const [asset, setAsset] = useState<Instrument["assetClass"]>("equity");
  const scope =
    props.instrumentScope ||
    JSON.stringify([props.owner, props.sessionStart ?? props.start]);
  const instrument =
    props.instrument ||
    (resolved?.scope === scope ? resolved.instrument : undefined);
  const cutoff = props.cutoff ?? props.end;
  // Load the historical window once. Rendering/tooltip apply the replay cutoff;
  // scrubbing must not dispatch a request for every cursor movement.
  const { feed, loading, retry } = useMarketData(
    instrument
      ? {
          instrument,
          accountId: props.accountId,
          start: props.sessionStart ?? props.start,
          end: props.sessionEnd ?? cutoff,
          interval,
          replay: !!props.replay,
        }
      : null,
    props.owner || "",
  );
  const chartSupported =
    typeof window !== "undefined" && typeof ResizeObserver !== "undefined";
  const advanced = chartSupported && feed.state === "ready" && feed.candles.length > 0;
  const intervalLabel = interval === 3600 ? "1h" : interval / 60 + "m";
  return (
    <div className="chart-workspace">
      <div className="chart-controls">
        <label>
          Interval{" "}
          <select
            aria-label="Candle interval"
            aria-describedby={!advanced ? "market-controls-help" : undefined}
            value={interval}
            onChange={(e) => setInterval(+e.target.value as typeof interval)}
          >
            {[
              [60, "1m"],
              [300, "5m"],
              [900, "15m"],
              [3600, "1h"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            disabled={!advanced}
            checked={volume}
            onChange={(e) => setVolume(e.target.checked)}
          />{" "}
          Volume
        </label>
        <label>
          HR pane{" "}
          <select
            aria-label="Heart-rate pane size"
            disabled={!advanced}
            value={hrHeight}
            onChange={(e) => setHrHeight(+e.target.value)}
          >
            <option value={90}>Compact</option>
            <option value={120}>Balanced</option>
            <option value={180}>Expanded</option>
          </select>
        </label>
        <button
          className="text-button"
          disabled={!advanced}
          onClick={() => setLiveVersion((n) => n + 1)}
        >
          Return to {props.replay ? "replay" : "live"}
        </button>
      </div>
      {!advanced && (
        <p id="market-controls-help" className="muted">
          Showing the trade and heart-rate timeline. Volume, pane sizing, and return to live require an available market chart.
          {" "}The selected {intervalLabel} candle interval will be used when market data is available.
          {!instrument && " Choose an exact instrument below to load candles."}
          {feed.state === "ready" && !chartSupported && " This browser cannot render the market chart; use a browser with ResizeObserver support."}
        </p>
      )}
      {!props.instrument && (
        <details className="instrument-resolver">
          <summary>
            {instrument
              ? instrument.symbol +
                " · " +
                instrument.assetClass +
                " · " +
                (instrument.exchange || "provider venue")
              : "Select an exact market instrument"}
          </summary>
          <p>
            Legacy symbols need a market and contract. Execution prices do not
            create candles.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const symbol = String(f.get("symbol")).toUpperCase(),
                exchange = String(f.get("exchange")).toUpperCase(),
                expiry = String(f.get("expiry") || "");
              setResolved({
                scope,
                instrument: {
                  id: [asset, exchange, symbol, expiry].join(":"),
                  symbol,
                  assetClass: asset,
                  exchange,
                  currency: String(f.get("currency")),
                  multiplier: Number(f.get("multiplier")),
                  ...(expiry ? { expiry } : {}),
                  providerSymbol: symbol,
                },
              });
            }}
            className="resolver-fields"
          >
            <label>
              Market
              <select
                aria-label="Instrument market"
                value={asset}
                onChange={(e) => setAsset(e.target.value as typeof asset)}
              >
                <option value="equity">US equity</option>
                <option value="option">US option · OCC symbol</option>
                <option value="future">Futures · exact expiry</option>
                <option value="forex">Forex · OANDA pair</option>
                <option value="crypto">Crypto</option>
              </select>
            </label>
            <label>
              Symbol
              <input
                name="symbol"
                aria-label="Exact instrument symbol"
                required
                maxLength={32}
                placeholder={asset === "future" ? "ESZ6" : "AAPL"}
              />
            </label>
            <label>
              Exchange
              <input
                name="exchange"
                aria-label="Instrument exchange"
                required
                maxLength={40}
                placeholder="XNAS / CME"
              />
            </label>
            {(asset === "future" || asset === "option") && (
              <label>
                Expiry
                <input name="expiry" type="date" required />
              </label>
            )}
            <label>
              Currency
              <select name="currency">
                <option>USD</option>
                <option>CAD</option>
                <option>EUR</option>
                <option>GBP</option>
                <option>JPY</option>
                <option>AUD</option>
                <option>CHF</option>
              </select>
            </label>
            <label>
              Multiplier
              <input
                name="multiplier"
                type="number"
                min="0.000001"
                max="1000000000"
                step="any"
                defaultValue={asset === "option" ? 100 : 1}
                required
              />
            </label>
            <button className="button small-button">Use instrument</button>
          </form>
        </details>
      )}
      <div className={"feed-status " + feed.state} role="status">
        <span className="status-dot small" />
        <span>
          {intervalLabel + " selected · "}
          {loading
            ? "Loading market data…"
            : feed.state === "ready"
              ? feed.provider +
                " · " +
                feed.freshness +
                " · " +
                feed.granularity + (feed.candles.length ? "" : " · No candles returned for this instrument and window; showing the trade and HR timeline") + " · " + feed.candles.length + " candles"
              : feed.message}
        </span>
        {instrument && !loading && feed.state !== "ready" && (
          <button className="text-button" onClick={retry}>
            Retry feed
          </button>
        )}
      </div>
      {props.replay && (
        <p className="replay-granularity">
          Replay shows only candles completed by the cursor. Intra-candle OHLC
          is unavailable.
        </p>
      )}
      {advanced ? (
        <SynchronizedChart
          {...props}
          cutoff={cutoff}
          replay={!!props.replay}
          candles={feed.candles}
          volume={volume}
          hrHeight={hrHeight}
          liveVersion={liveVersion}
          viewportKey={(props.viewportKey || "") + ":" + interval}
          moments={props.moments || []}
        />
      ) : (
        <LegacyTimeline {...props} end={cutoff} />
      )}
      <div className="chart-event-access" aria-label="Chart markers">
        {props.events
          .filter((e) => !e.voided && e.t >= props.start && e.t <= cutoff)
          .slice(-12)
          .map((e) => (
            <button
              key={e.id}
              className="marker-chip"
              onClick={() => props.onSelect(e)}
            >
              {executionAction(e) === "buy" ? "↑ Buy" : "↓ Sell"} · {e.kind}{" "}
              {e.side} · {e.symbol}
              <small>
                {eventOrigin(e)} · {clock(e.t)}
              </small>
            </button>
          ))}
        {(props.moments || [])
          .filter((m) => m.t >= props.start && m.t <= cutoff)
          .slice(-5)
          .map((m) => (
            <button
              key={m.id}
              className="marker-chip"
              onClick={() => props.onMoment?.(m.t)}
            >
              HR +{Math.round(m.delta)} · {clock(m.t)}
            </button>
          ))}
        {props.journal
          .filter((n) => !n.deletedAt && n.t >= props.start && n.t <= cutoff)
          .slice(-5)
          .map((n) => (
            <button
              key={n.id}
              className="marker-chip"
              onClick={() => props.onMoment?.(n.t)}
            >
              {n.label} · {clock(n.t)}
            </button>
          ))}
      </div>
      {props.onMoment && advanced && (
        <label className="timeline-moment-picker">
          Investigate any moment
          <input
            aria-label="Investigate moment time"
            type="datetime-local"
            step="1"
            onChange={(e) => {
              const t = new Date(e.target.value).getTime();
              if (Number.isFinite(t) && t >= props.start && t <= cutoff)
                props.onMoment?.(t);
            }}
          />
        </label>
      )}
      <p className="chart-attribution">
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Charts by TradingView
        </a>{" "}
        · TradingView Lightweight Charts™. Copyright (с) 2025 TradingView, Inc.
      </p>
    </div>
  );
}
