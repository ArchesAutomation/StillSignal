"use client";
import { useMemo, useState } from "react";
import { downsample, nearest } from "@/lib/analytics";
import { liveNotes, type HrMoment } from "@/lib/smart-journal";
import { executionAction } from "@/lib/trade-context";
import {
  clock,
  type Sample,
  type TradeEvent,
  type JournalEntry,
} from "@/lib/model";
export function LegacyTimeline({
  samples,
  events,
  journal,
  baseline,
  start,
  end,
  onSelect,
  onMoment,
  moments = [],
}: {
  samples: Sample[];
  events: TradeEvent[];
  journal: JournalEntry[];
  baseline: number | null;
  start: number;
  end: number;
  onSelect: (e: TradeEvent) => void;
  onMoment?: (t: number) => void;
  moments?: HrMoment[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1100,
    H = 280,
    L = 48,
    R = 25,
    T = 22,
    B = 40;
  const visible = useMemo(
    () => samples.filter((p) => p.t >= start && p.t <= end),
    [samples, start, end],
  );
  const points = useMemo(() => downsample(visible, 600), [visible]);
  const min =
    Math.floor(Math.min(60, ...points.map((p) => p.bpm), baseline || 70) / 10) *
      10 -
    10;
  const max =
    Math.ceil(Math.max(100, ...points.map((p) => p.bpm), baseline || 70) / 10) *
      10 +
    10;
  const x = (t: number) =>
      L + ((t - start) / Math.max(1, end - start)) * (W - L - R),
    y = (b: number) => T + ((max - b) / (max - min)) * (H - T - B);
  const gaps = visible
    .filter((p, i) => i > 0 && p.t - visible[i - 1].t > 10000)
    .map((p) => p.t);
  let gi = 0;
  let line = "";
  points.forEach((p, i) => {
    let gap = false;
    while (gi < gaps.length && gaps[gi] <= p.t) {
      if (i && gaps[gi] > points[i - 1].t) gap = true;
      gi++;
    }
    line += `${i === 0 || gap ? "M" : "L"}${x(p.t).toFixed(2)},${y(p.bpm).toFixed(2)} `;
  });
  const h =
    hover === null
      ? null
      : nearest(visible, start + hover * (end - start), 10000);
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Heart rate and trading events on a synchronized timeline"
        onClick={(e) => {
          if (!onMoment) return;
          const r = e.currentTarget.getBoundingClientRect();
          const fraction = Math.max(
            0,
            Math.min(
              1,
              (((e.clientX - r.left) / r.width) * W - L) / (W - L - R),
            ),
          );
          onMoment(Math.round(start + fraction * (end - start)));
        }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                1,
                (((e.clientX - r.left) / r.width) * W - L) / (W - L - R),
              ),
            ),
          );
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pulse-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fb8354" stopOpacity=".14" />
            <stop offset="100%" stopColor="#fb8354" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length > 0 &&
          [0, 1, 2, 3, 4].map((i) => {
            const v = min + ((max - min) * i) / 4;
            return (
              <g key={i}>
                <line
                  x1={L}
                  x2={W - R}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#ffffff"
                  strokeOpacity=".055"
                  strokeDasharray="3 5"
                />
                <text x={L - 12} y={y(v) + 4} textAnchor="end" className="axis">
                  {Math.round(v)}
                </text>
              </g>
            );
          })}
        {baseline !== null && (
          <g>
            <line
              x1={L}
              x2={W - R}
              y1={y(baseline)}
              y2={y(baseline)}
              stroke="#818896"
              strokeDasharray="5 6"
            />
            <text
              x={W - R - 5}
              y={y(baseline) - 8}
              textAnchor="end"
              className="axis"
            >
              Baseline {Math.round(baseline)}
            </text>
          </g>
        )}
        {points.length > 0 && gaps.length === 0 && (
          <path
            d={`${line} L${x(points.at(-1)!.t)},${H - B} L${x(points[0].t)},${H - B} Z`}
            fill="url(#pulse-fill)"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="#fb895c"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {liveNotes(journal)
          .filter((j) => j.t >= start && j.t <= end)
          .slice(-100)
          .map((j) => (
            <g key={j.id}>
              <circle cx={x(j.t)} cy={H - B + 5} r="3" fill="#ac9cef" />
              <title>
                {j.label}: {j.text}
              </title>
            </g>
          ))}
        {moments
          .filter((m) => m.t >= start && m.t <= end)
          .slice(-100)
          .map((m) => (
            <g
              key={m.id}
              role="button"
              tabIndex={0}
              aria-label={`HR moment at ${clock(m.t)}`}
              onClick={(e) => {
                e.stopPropagation();
                onMoment?.(m.t);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onMoment?.(m.t);
                }
              }}
            >
              <line
                x1={x(m.t)}
                x2={x(m.t)}
                y1={T}
                y2={H - B}
                stroke="#fb895c"
                strokeOpacity=".25"
                strokeDasharray="3 4"
              />
              <circle cx={x(m.t)} cy={y(m.peak)} r="6" fill="#fb895c" />
              <title>HR moment · +{Math.round(m.delta)} BPM</title>
            </g>
          ))}
        {events
          .filter((e) => e.t >= start && e.t <= end)
          .slice(-200)
          .map((e) => {
            const sample =
              e.timePrecision === "day" ? null : nearest(visible, e.t);
            const py = sample ? y(sample.bpm) : H - B - 12;
            return (
              <g
                key={e.id}
                tabIndex={0}
                role="button"
                aria-label={`${e.symbol} ${e.kind} at ${clock(e.t)}`}
                onKeyDown={(k) => {
                  if (k.key === "Enter" || k.key === " ") {
                    k.preventDefault();
                    onSelect(e);
                  }
                }}
                onClick={(k) => {
                  k.stopPropagation();
                  onSelect(e);
                }}
                className="trade-marker"
              >
                <line
                  x1={x(e.t)}
                  x2={x(e.t)}
                  y1={py}
                  y2={H - B}
                  stroke={e.kind === "entry" ? "#69c9b4" : "#b3a5e8"}
                  strokeOpacity=".3"
                  strokeDasharray="3 4"
                />
                <circle
                  cx={x(e.t)}
                  cy={py}
                  r="8"
                  fill={e.kind === "entry" ? "#69c9b4" : "#b3a5e8"}
                  stroke="#17191d"
                  strokeWidth="3"
                />
                <text
                  x={x(e.t)}
                  y={T + 11}
                  textAnchor="middle"
                  className="marker-label"
                >
                  {e.symbol} {executionAction(e) === "buy" ? "↑ buy" : "↓ sell"}{" "}
                  · {e.kind} {e.side === "unknown" ? "" : e.side}
                  {e.timePrecision === "day" ? " · date only" : ""}
                </text>
                <title>
                  {e.symbol} {e.kind} · {clock(e.t)}
                </title>
              </g>
            );
          })}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <text
            key={i}
            x={L + (i * (W - L - R)) / 5}
            y={H - 9}
            textAnchor="middle"
            className="axis"
          >
            {new Date(start + ((end - start) * i) / 5).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </text>
        ))}
        {h && (
          <g>
            <line
              x1={x(h.t)}
              x2={x(h.t)}
              y1={T}
              y2={H - B}
              stroke="#ffffff"
              strokeOpacity=".25"
            />
            <circle
              cx={x(h.t)}
              cy={y(h.bpm)}
              r="5"
              fill="#fb895c"
              stroke="#fff"
              strokeWidth="2"
            />
            <rect
              x={Math.min(W - 150, Math.max(50, x(h.t) - 70))}
              y={Math.max(0, y(h.bpm) - 48)}
              width="140"
              height="30"
              rx="7"
              fill="#2d3037"
            />
            <text
              x={Math.min(W - 80, Math.max(120, x(h.t)))}
              y={Math.max(0, y(h.bpm) - 48) + 20}
              textAnchor="middle"
              fill="#fff"
              fontSize="11"
            >
              {h.bpm} BPM · {clock(h.t)}
            </text>
          </g>
        )}
      </svg>
      {events.filter((e) => e.t >= start && e.t <= end).length > 200 && (
        <p className="chart-limit">
          Showing the latest 200 event markers in this window. All events remain
          in your export.
        </p>
      )}
      {liveNotes(journal)
        .filter((j) => j.t >= start && j.t <= end)
        .slice(-100).length > 0 && (
        <div className="timeline-journal-list">
          {liveNotes(journal)
            .filter((j) => j.t >= start && j.t <= end)
            .slice(-5)
            .map((j) => (
              <span key={j.id} title={j.text}>
                {clock(j.t)} · {j.label}
              </span>
            ))}
        </div>
      )}
      {!points.length && !events.length && !liveNotes(journal).length && (
        <div className="chart-empty">
          Add a trade or reflection to start your timeline. A wearable is
          optional.
        </div>
      )}
      {onMoment && (
        <label className="timeline-moment-picker">
          Investigate any moment
          <input
            aria-label="Investigate moment time"
            type="datetime-local"
            step="1"
            onChange={(e) => {
              const t = new Date(e.target.value).getTime();
              if (Number.isFinite(t)) onMoment(t);
            }}
          />
          <small>Or click the timeline to inspect HR and add context.</small>
        </label>
      )}
    </div>
  );
}
