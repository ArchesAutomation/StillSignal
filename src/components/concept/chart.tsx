"use client";
import { useMemo, useRef, useState } from "react";
import { downsample, nearest } from "@/lib/analytics";
import type { Candle } from "@/lib/market/model";
import { cx, time, type Moment, type Series } from "./shared";

type ChartProps = Series & {
  candles: Candle[];
  symbol: string;
  priceStatus: string;
  demo: boolean;
  moments: Moment[];
  selected?: string;
  onSelect: (moment: Moment) => void;
};

export default function ConceptChart({
  samples,
  baseline,
  start,
  end,
  candles,
  symbol,
  priceStatus,
  demo,
  moments,
  selected,
  onSelect,
}: ChartProps) {
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    t: number;
    bpm: number | null;
    price: number | null;
  } | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const displayTime = (t: number, seconds = true) =>
    demo
      ? new Date(t).toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          ...(seconds ? { second: "2-digit" as const } : {}),
        })
      : time(t, seconds);
  const lo = zoom?.[0] ?? start;
  const hi = Math.max(lo + 1000, zoom?.[1] ?? end);
  const priceBars = useMemo(
    () => candles.filter((bar) => bar.complete && bar.t >= lo && bar.end <= hi),
    [candles, lo, hi],
  );
  const hr = useMemo(
    () =>
      downsample(
        samples.filter((sample) => sample.t >= lo && sample.t <= hi),
        700,
      ),
    [samples, lo, hi],
  );
  const prices = priceBars.flatMap((bar) => [bar.low, bar.high]);
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 1;
  const pricePad = Math.max((priceMax - priceMin) * 0.13, 0.12);
  const priceLow = priceMin - pricePad;
  const priceHigh = priceMax + pricePad;
  const hrMin = Math.min(60, ...hr.map((sample) => sample.bpm));
  const hrMax = Math.max(120, ...hr.map((sample) => sample.bpm));
  const x = (t: number) => 42 + ((t - lo) / (hi - lo)) * 900;
  const priceY = (price: number) =>
    272 - ((price - priceLow) / (priceHigh - priceLow)) * 244;
  const hrY = (bpm: number) =>
    382 - ((bpm - hrMin) / (hrMax - hrMin)) * 82;
  const hrLine = hr
    .map((sample, i) => `${i ? "L" : "M"} ${x(sample.t)} ${hrY(sample.bpm)}`)
    .join(" ");
  const pointerX = (clientX: number) => {
    const rect = svg.current!.getBoundingClientRect();
    return Math.max(42, Math.min(942, ((clientX - rect.left) / rect.width) * 1000));
  };
  const timestamp = (value: number) =>
    Math.round(lo + ((value - 42) / 900) * (hi - lo));
  const nearestPrice = (t: number) => {
    const bar = priceBars.find((candidate) => t >= candidate.t && t < candidate.end);
    return bar?.close ?? null;
  };
  const readPoint = (value: number) => {
    const t = timestamp(value);
    return {
      x: value,
      t,
      bpm: nearest(samples, t, 60000)?.bpm ?? null,
      price: nearestPrice(t),
    };
  };
  return (
    <>
      <div className={cx("chartwrap", "price-chartwrap")}>
        <svg
          ref={svg}
          className={cx("chart", "price-chart")}
          viewBox="0 0 1000 410"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${symbol} price candles above synchronized heart rate. Select a marker or drag to zoom.`}
          onPointerDown={(event) => {
            if ((event.target as Element).closest("[data-marker]")) return;
            svg.current?.setPointerCapture(event.pointerId);
            const value = pointerX(event.clientX);
            setDrag([value, value]);
          }}
          onPointerMove={(event) => {
            const value = pointerX(event.clientX);
            if (drag) setDrag([drag[0], value]);
            setHover(readPoint(value));
          }}
          onPointerLeave={() => setHover(null)}
          onPointerCancel={() => setDrag(null)}
          onPointerUp={(event) => {
            if (!drag) return;
            if (Math.abs(drag[1] - drag[0]) > 12) {
              setZoom([
                timestamp(Math.min(...drag)),
                timestamp(Math.max(...drag)),
              ]);
            } else {
              const point = readPoint(pointerX(event.clientX));
              onSelect({
                id: `point-${point.t}`,
                t: point.t,
                phase: "MOMENT",
                label: "Unlabelled",
                text: "Add your own context to this moment.",
                bpm: point.bpm,
              });
            }
            setDrag(null);
          }}
        >
          <defs>
            <linearGradient id="ss-price-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#132a29" stopOpacity=".42" />
              <stop offset="1" stopColor="#0a1012" stopOpacity="0" />
            </linearGradient>
            <clipPath id="ss-price-clip">
              <rect x="42" y="17" width="900" height="268" />
            </clipPath>
            <clipPath id="ss-hr-clip">
              <rect x="42" y="295" width="900" height="95" />
            </clipPath>
          </defs>
          <rect x="42" y="18" width="900" height="260" fill="url(#ss-price-fade)" />
          {[0, 1, 2, 3, 4].map((index) => {
            const py = 30 + index * 61;
            const price = priceHigh - ((py - 28) / 244) * (priceHigh - priceLow);
            return (
              <g key={index}>
                <line x1="42" x2="942" y1={py} y2={py} stroke="#243235" strokeDasharray="3 7" />
                {priceBars.length > 0 && (
                  <text x="952" y={py + 4} fill="#8b9999" fontSize="11" fontFamily="DM Mono">
                    {price.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
          <g clipPath="url(#ss-price-clip)">
            {priceBars.map((bar) => {
              const center = x((bar.t + bar.end) / 2);
              const width = Math.max(1.6, Math.min(6, ((bar.end - bar.t) / (hi - lo)) * 900 * 0.72));
              const up = bar.close >= bar.open;
              const color = up ? "#61d7b0" : "#f17b78";
              const top = priceY(Math.max(bar.open, bar.close));
              const bodyHeight = Math.max(1.8, Math.abs(priceY(bar.open) - priceY(bar.close)));
              return (
                <g key={bar.t} data-candle={symbol}>
                  <line x1={center} x2={center} y1={priceY(bar.high)} y2={priceY(bar.low)} stroke={color} strokeWidth="1.5" />
                  <rect x={center - width / 2} y={top} width={width} height={bodyHeight} rx=".5" fill={color} />
                </g>
              );
            })}
          </g>
          {!priceBars.length && (
            <text x="492" y="146" textAnchor="middle" fill="#91a09f" fontSize="13">
              {priceStatus}
            </text>
          )}
          <line x1="42" x2="942" y1="291" y2="291" stroke="#314044" />
          {[60, 80, 100, 120].filter((value) => value >= hrMin && value <= hrMax).map((value) => (
            <g key={value}>
              <line x1="42" x2="942" y1={hrY(value)} y2={hrY(value)} stroke="#263236" strokeDasharray="3 7" />
              <text x="952" y={hrY(value) + 4} fill="#829291" fontSize="10" fontFamily="DM Mono">
                {value} BPM
              </text>
            </g>
          ))}
          {baseline !== null && baseline >= hrMin && baseline <= hrMax && (
            <line x1="42" x2="942" y1={hrY(baseline)} y2={hrY(baseline)} stroke="#798481" strokeDasharray="5 6" />
          )}
          <g clipPath="url(#ss-hr-clip)">
            <path d={hrLine} fill="none" stroke="#ff765433" strokeWidth="7" />
            <path d={hrLine} fill="none" stroke="#ff8179" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
          {!hr.length && (
            <text x="492" y="350" textAnchor="middle" fill="#8e9a99" fontSize="12">
              Heart-rate samples will appear when recorded.
            </text>
          )}
          {moments
            .filter((moment) => moment.t >= lo && moment.t <= hi)
            .map((moment) => {
              const color = moment.event
                ? moment.event.kind === "entry" ? "#58d6ac" : "#ff9b75"
                : "#a88bff";
              return (
                <g
                  key={moment.id}
                  data-marker="true"
                  role="button"
                  tabIndex={0}
                  aria-label={`${moment.phase} at ${displayTime(moment.t)}`}
                  onClick={() => onSelect(moment)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(moment);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <line x1={x(moment.t)} x2={x(moment.t)} y1="32" y2="382" stroke={color} strokeDasharray="3 7" opacity=".38" />
                  <circle cx={x(moment.t)} cy={moment.event && priceBars.length ? priceY(moment.event.price) : 289} r={selected === moment.id ? 8 : 5} fill={color} stroke={selected === moment.id ? "#fff" : "#0b1214"} strokeWidth="2" />
                  {moment.bpm !== null && (
                    <circle cx={x(moment.t)} cy={hrY(moment.bpm)} r={selected === moment.id ? 6 : 3} fill={color} />
                  )}
                </g>
              );
            })}
          {drag && (
            <rect x={Math.min(...drag)} y="17" width={Math.abs(drag[1] - drag[0])} height="373" fill="#a88bff15" stroke="#9e86f0" />
          )}
        </svg>
        {hover && !drag && (
          <div className={cx("charttip", "price-charttip")} style={{ opacity: 1, left: `${Math.min(76, hover.x / 10)}%`, top: 15 }}>
            <strong>{displayTime(hover.t, false)}{demo ? " NY" : ""}</strong>
            <span>{symbol} {hover.price === null ? "—" : hover.price.toFixed(2)}</span>
            <span>{hover.bpm ?? "—"} BPM</span>
          </div>
        )}
      </div>
      <div className={cx("hint")}>
        <span>
          {zoom ? (
            <button className={cx("textlink")} onClick={() => setZoom(null)}>Reset zoom</button>
          ) : "Drag to zoom into a moment"}
        </span>
        <span>{displayTime(lo, false)} — {displayTime(hi, false)}{demo ? " NY · Demo prices" : ""}</span>
      </div>
    </>
  );
}
