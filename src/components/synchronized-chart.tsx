"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { Sample, TradeEvent, JournalEntry } from "@/lib/model";
import { clock } from "@/lib/model";
import { executionAction, eventOrigin } from "@/lib/trade-context";
import {
  chartTime,
  hrSegments,
  measurementAt,
  replayCandles,
  visibleChartEvents,
} from "@/lib/market/chart-data";
import type { Candle } from "@/lib/market/model";
import type { HrMoment } from "@/lib/smart-journal";
import { MarketCandleBodies } from "./market-candle-bodies";
export type ChartProps = {
  samples: Sample[];
  events: TradeEvent[];
  journal: JournalEntry[];
  baseline: number | null;
  start: number;
  end: number;
  cutoff: number;
  replay: boolean;
  candles: Candle[];
  volume: boolean;
  selectedTime?: number;
  hrHeight: number;
  liveVersion: number;
  viewportKey?: string;
  onSelect: (event: TradeEvent) => void;
  onMoment?: (t: number) => void;
  moments: HrMoment[];
  annotations?: {name:string;price:number;endPrice?:number;color:string}[];
};
const utc = (t: number) => chartTime(t) as UTCTimestamp;
export default function SynchronizedChart(props: ChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<{
    chart: IChartApi;
    candle: ISeriesApi<"Candlestick">;
    bodies: MarketCandleBodies;
    volume: ISeriesApi<"Histogram">;
    carrier: ISeriesApi<"Line">;
    hr: ISeriesApi<"Line">[];
    markers: ReturnType<typeof createSeriesMarkers<Time>>;
  } | null>(null);
  const current = useRef(props);
  current.current = props;
  const previous = useRef<Candle[]>([]);
  const [tooltip, setTooltip] = useState<{
    t: number;
    hr: Sample | null;
    candle?: Candle;
    event?: TradeEvent;
  } | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      height: 440,
      layout: {
        background: { type: ColorType.Solid, color: "#0d1416" },
        textColor: "#8e9a99",
        fontFamily: "Manrope, sans-serif",
        fontSize: 11,
        attributionLogo: true,
        panes: {
          separatorColor: "#223034",
          separatorHoverColor: "#ff7654",
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: "#ffffff05" },
        horzLines: { color: "#ffffff09" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#f1eee880", labelBackgroundColor: "#373732" },
        horzLine: { color: "#f1eee840", labelBackgroundColor: "#373732" },
      },
      timeScale: {
        tickMarkFormatter: (time: Time) =>
          typeof time === "number"
            ? new Date(Number(time) * 1000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : null,
        timeVisible: true,
        secondsVisible: true,
        borderColor: "#223034",
        rightOffset: 3,
      },
      rightPriceScale: { borderColor: "#223034", minimumWidth: 68 },
      localization: {
        timeFormatter: (time: Time) =>
          typeof time === "number"
            ? new Date(Number(time) * 1000).toLocaleString()
            : String(time),
      },
    });
    const candle = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "transparent",
        downColor: "transparent",
        borderVisible: false,
        wickUpColor: "#58d6ac",
        wickDownColor: "#ff796f",
      },
      0,
    );
    const bodies = new MarketCandleBodies(chart, candle);
    candle.attachPrimitive(bodies);
    const volume = chart.addSeries(
      HistogramSeries,
      { priceScaleId: "volume", priceFormat: { type: "volume" } },
      0,
    );
    volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    // Invisible carrier adds exact event/note times; it never supplies OHLC.
    const carrier = chart.addSeries(
      LineSeries,
      {
        color: "transparent",
        lineVisible: false,
        pointMarkersVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        priceScaleId: "events",
      },
      0,
    );
    carrier.priceScale().applyOptions({
      visible: false,
      scaleMargins: { top: 0.1, bottom: 0.15 },
    });
    const markers = createSeriesMarkers(carrier, [], { autoScale: false });
    chart.addPane(true);
    api.current = { chart, candle, bodies, volume, carrier, markers, hr: [] };
    chart.subscribeCrosshairMove((param) => {
      if (typeof param.time !== "number") {
        setTooltip(null);
        return;
      }
      const p = current.current,
        t = Number(param.time) * 1000;
      const bar = replayCandles(p.candles, p.cutoff, p.replay).find(
        (c) => t >= c.t && t < c.end,
      );
      const event = visibleChartEvents(p.events, p.start, p.cutoff).find(
        (e) => Math.abs(e.t - t) <= 1000,
      );
      setTooltip({
        t,
        hr: measurementAt(
          p.samples.filter((s) => s.t <= p.cutoff),
          t,
        ),
        candle: bar,
        event,
      });
    });
    chart.subscribeClick((param) => {
      const p = current.current;
      if (typeof param.time !== "number") return;
      const t = Number(param.time) * 1000;
      const event = p.events.find(
        (e) => e.id === param.hoveredObjectId && e.t <= p.cutoff && !e.voided,
      );
      if (event) p.onSelect(event);
      else if (t >= p.start && t <= p.cutoff) p.onMoment?.(t);
    });
    return () => {
      api.current = null;
      previous.current = [];
      chart.remove();
    };
  }, []);
  useEffect(() => {
    const a=api.current;
    if(!a)return;
    const lines=(props.annotations ?? []).flatMap(annotation => [annotation.price,...(annotation.endPrice === undefined ? []:[annotation.endPrice])].map(price => a.candle.createPriceLine({price,title:annotation.name,color:annotation.color,lineWidth:1,axisLabelVisible:true})));
    return () => {if(api.current === a)for(const line of lines)a.candle.removePriceLine(line);};
  }, [props.annotations]);
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const candles = replayCandles(props.candles, props.cutoff, props.replay),
      old = previous.current;
    const prefix =
      old.length &&
      candles.length >= old.length &&
      old
        .slice(0, -1)
        .every((c, i) => JSON.stringify(c) === JSON.stringify(candles[i]));
    if (prefix)
      for (const c of candles.slice(old.length - 1))
        a.candle.update({
          time: utc(c.t),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });
    else
      a.candle.setData(
        candles.map((c) => ({
          time: utc(c.t),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
    previous.current = candles;
    a.volume.applyOptions({ visible: props.volume });
    a.volume.setData(
      candles
        .filter((c) => c.volume !== undefined)
        .map((c) => ({
          time: utc(c.t),
          value: c.volume!,
          color: c.close >= c.open ? "#58d6ac30" : "#ff796f30",
        })),
    );
    const events = visibleChartEvents(props.events, props.start, props.cutoff);
    const notes = props.journal.filter(
      (n) => !n.deletedAt && n.t >= props.start && n.t <= props.cutoff,
    );
    const moments = props.moments.filter(
      (m) => m.t >= props.start && m.t <= props.cutoff,
    );
    const times = [
      ...new Set([
        props.start,
        Math.max(props.start + 1000, props.end),
        ...candles.flatMap((c) => [c.t, c.end]),
        ...events.map((e) => e.t),
        ...notes.map((n) => n.t),
        ...moments.map((m) => m.t),
      ]),
    ].sort((x, y) => x - y);
    a.carrier.setData(times.map((t) => ({ time: utc(t), value: 1 })));
    a.bodies.setData(candles);
    const markers: SeriesMarker<Time>[] = [
      ...events.map((e) => {
        const buy = executionAction(e) === "buy",
          execution = !["alert", "strategy", "backtest"].includes(
            e.provenance || "",
          );
        return {
          time: utc(e.t),
          id: e.id,
          position: buy ? ("belowBar" as const) : ("aboveBar" as const),
          shape: execution
            ? buy
              ? ("arrowUp" as const)
              : ("arrowDown" as const)
            : ("square" as const),
          color: execution ? (buy ? "#58d6ac" : "#ff796f") : "#8e9a99",
          text:
            (buy ? "BUY" : "SELL") +
            " · " +
            e.kind +
            " " +
            e.side +
            " · " +
            e.symbol,
          size: 1,
        };
      }),
      ...notes.map((n) => ({
        time: utc(n.t),
        id: n.id,
        position: "belowBar" as const,
        shape: "circle" as const,
        color: "#a88bff",
        text: n.label,
        size: 0.6,
      })),
      ...moments.map((m) => ({
        time: utc(m.t),
        id: m.id,
        position: "aboveBar" as const,
        shape: "circle" as const,
        color: "#ff7654",
        text: "HR +" + Math.round(m.delta),
        size: 0.6,
      })),
    ].sort((x, y) => Number(x.time) - Number(y.time));
    a.markers.setMarkers(markers);
    const segments = hrSegments(props.samples, props.start, props.cutoff);
    while (a.hr.length > segments.length) a.chart.removeSeries(a.hr.pop()!);
    segments.forEach((segment, i) => {
      if (!a.hr[i])
        a.hr.push(
          a.chart.addSeries(
            LineSeries,
            {
              color: "#ff7654",
              lineWidth: 2,
              pointMarkersVisible: segment.length === 1,
              lastValueVisible: false,
              priceLineVisible: false,
              priceFormat: {
                type: "custom",
                minMove: 1,
                formatter: (n: number) => Math.round(n) + " BPM",
              },
            },
            1,
          ),
        );
      a.hr[i].setData(segment.map((s) => ({ time: utc(s.t), value: s.bpm })));
    });
  }, [
    props.samples,
    props.events,
    props.journal,
    props.moments,
    props.candles,
    props.start,
    props.end,
    props.cutoff,
    props.replay,
    props.volume,
  ]);
  useEffect(() => {
    const series = api.current?.hr[0];
    if (!series || props.baseline === null) return;
    const line = series.createPriceLine({
      price: props.baseline,
      color: "#9c9f8a",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
      title: "Opening baseline",
    });
    return () => {
      if (api.current?.hr.includes(series)) series.removePriceLine(line);
    };
  }, [props.baseline, props.samples]);
  useEffect(() => {
    api.current?.chart.panes()[1]?.setHeight(props.hrHeight);
  }, [props.hrHeight]);
  useEffect(() => {
    const a = api.current;
    const host = container.current;
    const selected = props.selectedTime;
    if (!a || !host || selected === undefined || selected > props.cutoff)
      return;
    let frame = 0;
    const focus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A dialog can mount or update the chart before its first visible layout.
        // The chart's synthetic crosshair requires initialized time and price scales.
        if (
          api.current !== a ||
          !host.getBoundingClientRect().width ||
          a.chart.timeScale().timeToCoordinate(utc(selected)) === null ||
          a.carrier.priceToCoordinate(1) === null
        )
          return;
        a.chart.setCrosshairPosition(1, utc(selected), a.carrier);
      });
    };
    const observer = new ResizeObserver(focus);
    observer.observe(host);
    a.chart.timeScale().subscribeVisibleLogicalRangeChange(focus);
    focus();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      a.chart.timeScale().unsubscribeVisibleLogicalRangeChange(focus);
    };
  }, [props.selectedTime, props.cutoff, props.candles]);
  useEffect(() => {
    if (props.end > props.start)
      api.current?.chart
        .timeScale()
        .setVisibleRange({ from: utc(props.start), to: utc(props.end) });
    // Only deliberate range/live changes reset viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.viewportKey, props.liveVersion]);
  return (
    <div className="synced-chart">
      <div
        ref={container}
        role="img"
        aria-label="Synchronized market candles and heart rate with shared time, zoom, pan, and crosshair"
      />
      <div className="shared-tooltip" aria-live="off">
        {tooltip ? (
          <>
            <span>{clock(tooltip.t)}</span>
            <span>
              {tooltip.candle
                ? "O " +
                  tooltip.candle.open +
                  " H " +
                  tooltip.candle.high +
                  " L " +
                  tooltip.candle.low +
                  " C " +
                  tooltip.candle.close
                : "No candle at cursor"}
            </span>
            <span className="orange">
              {tooltip.hr
                ? tooltip.hr.bpm + " BPM · measured " + clock(tooltip.hr.t)
                : "HR missing · 10s tolerance"}
            </span>
            {tooltip.event && (
              <span>
                {eventOrigin(tooltip.event)} · {executionAction(tooltip.event)}{" "}
                · {tooltip.event.kind} {tooltip.event.side}
              </span>
            )}
          </>
        ) : (
          <span>
            Move across the chart to inspect market and heart-rate context.
          </span>
        )}
      </div>
    </div>
  );
}
