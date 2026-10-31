"use client";
import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market/model";
import type { BodyOf } from "@/lib/process/model";
type Annotation = NonNullable<BodyOf<"thesis">["chart"]>["annotations"][number];
export default function AnnotationChart({
  candles,
  annotations,
  onChange,
}: {
  candles: Candle[];
  annotations: Annotation[];
  onChange: (rows: Annotation[]) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    api = useRef<
      { chart: IChartApi; series: ISeriesApi<"Candlestick"> } | undefined
    >(undefined),
    [version, redraw] = useState(0),
    current = useRef({ annotations, onChange });
  current.current = { annotations, onChange };
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("lightweight-charts").then(
      ({ createChart, CandlestickSeries, ColorType }) => {
        if (disposed || !container.current) return;
        const chart = createChart(container.current, {
            autoSize: true,
            height: 320,
            layout: {
              background: { type: ColorType.Solid, color: "#11171a" },
              textColor: "#aeb9bd",
            },
            grid: {
              vertLines: { color: "#20282c" },
              horzLines: { color: "#20282c" },
            },
          }),
          series = chart.addSeries(CandlestickSeries, {
            upColor: "#74b49d",
            downColor: "#d48c7b",
            wickUpColor: "#74b49d",
            wickDownColor: "#d48c7b",
            borderVisible: false,
          });
        api.current = { chart, series };
        const update = () => redraw((n) => n + 1);
        chart.timeScale().subscribeVisibleLogicalRangeChange(update);
        const observer = new ResizeObserver(update);
        observer.observe(container.current);
        redraw((n) => n + 1);
        cleanup = () => {
          observer.disconnect();
          chart.remove();
          api.current = undefined;
        };
      },
    );
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (!api.current) return;
    api.current.series.setData(
      candles
        .filter((c) => c.complete)
        .map((c) => ({
          time: (c.t / 1000) as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
    );
    api.current.chart.timeScale().fitContent();
  }, [candles, !!api.current]);
  useEffect(() => {
    if (!api.current) return;
    const series = api.current.series;
    const lines = annotations.flatMap((a) =>
      [a.price, ...(a.endPrice === undefined ? [] : [a.endPrice])].map(
        (price) =>
          series.createPriceLine({
            price,
            color: a.color,
            lineWidth: 1,
            title: a.name,
            axisLabelVisible: true,
          }),
      ),
    );
    return () => {
      if (api.current?.series === series)
        for (const line of lines) series.removePriceLine(line);
    };
  }, [annotations, !!api.current]);
  return (
    <div className="cc-annotation-chart" data-version={version}>
      <div ref={container} style={{ height: 320 }} />
      {annotations.map((a) => {
        const y = api.current?.series.priceToCoordinate(a.price);
        return y == null ? null : (
          <button
            key={a.id}
            type="button"
            className="cc-level-handle"
            style={{ top: y, borderColor: a.color }}
            title="Drag vertically or use arrow keys to adjust this level"
            aria-label={`Move ${a.name} level`}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const price = api.current?.series.coordinateToPrice(
                  y + (e.key === "ArrowUp" ? -1 : 1),
                );
                if (price != null)
                  onChange(
                    annotations.map((r) =>
                      r.id === a.id
                        ? { ...r, price, recordedAt: Date.now() }
                        : r,
                    ),
                  );
              }
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (
                !e.currentTarget.hasPointerCapture(e.pointerId) ||
                !container.current
              )
                return;
              const price = api.current?.series.coordinateToPrice(
                e.clientY - container.current.getBoundingClientRect().top,
              );
              if (price != null)
                current.current.onChange(
                  current.current.annotations.map((r) =>
                    r.id === a.id ? { ...r, price, recordedAt: Date.now() } : r,
                  ),
                );
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
          >
            {a.name}
          </button>
        );
      })}
    </div>
  );
}
