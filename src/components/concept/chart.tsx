"use client";
import { useMemo, useRef, useState } from "react";
import { downsample, nearest } from "@/lib/analytics";
import { cx, time, type Moment, type Series } from "./shared";
export default function ConceptChart({
  samples,
  baseline,
  start,
  end,
  moments,
  selected,
  onSelect,
}: {
  moments: Moment[];
  selected?: string;
  onSelect: (m: Moment) => void;
} & Series) {
  const [zoom, setZoom] = useState<[number, number] | null>(null),
    [hover, setHover] = useState<{ x: number; t: number; bpm: number } | null>(
      null,
    ),
    [drag, setDrag] = useState<[number, number] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const lo = zoom?.[0] ?? start,
    hi = Math.max(lo + 1000, zoom?.[1] ?? end);
  const pts = useMemo(
    () =>
      downsample(
        samples.filter((p) => p.t >= lo && p.t <= hi),
        800,
      ),
    [samples, lo, hi],
  );
  const min = Math.min(60, ...pts.map((p) => p.bpm)) - 0,
    max = Math.max(140, ...pts.map((p) => p.bpm)) + 0;
  const x = (t: number) => 40 + ((t - lo) / (hi - lo)) * 940,
    y = (v: number) => 300 - ((v - min) / (max - min)) * 260;
  const line = pts
    .map((p, i) => `${i ? "L" : "M"} ${x(p.t)} ${y(p.bpm)}`)
    .join(" ");
  const point = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return Math.max(40, Math.min(980, ((clientX - r.left) / r.width) * 1000));
  };
  const timestamp = (n: number) => Math.round(lo + ((n - 40) / 940) * (hi - lo));
  return (
    <>
      <div className={cx("chartwrap")}>
        <svg
          ref={svg}
          className={cx("chart")}
          viewBox="0 0 1000 330"
          preserveAspectRatio="none"
          role="img"
          aria-label="Heart rate timeline. Select a marker or drag to zoom."
          onPointerDown={(e) => {
            if ((e.target as Element).closest("[data-marker]")) return;
            svg.current?.setPointerCapture(e.pointerId);
            const a = point(e.clientX);
            setDrag([a, a]);
          }}
          onPointerMove={(e) => {
            const a = point(e.clientX);
            if (drag) setDrag([drag[0], a]);
            const t = timestamp(a),
              p = nearest(samples, t, 60000);
            setHover(p ? { x: a, t: p.t, bpm: p.bpm } : null);
          }}
          onPointerLeave={() => setHover(null)}
          onPointerCancel={() => setDrag(null)}
          onPointerUp={(e) => {
            if (!drag) return;
            if (Math.abs(drag[1] - drag[0]) > 12)
              setZoom([
                timestamp(Math.min(...drag)),
                timestamp(Math.max(...drag)),
              ]);
            else {
              const t = timestamp(point(e.clientX)),
                p = nearest(samples, t, 60000);
              onSelect({
                id: `point-${t}`,
                t,
                phase: "MOMENT",
                label: "Unlabelled",
                text: "Add your own context to this physiological change.",
                bpm: p?.bpm ?? null,
              });
            }
            setDrag(null);
          }}
        >
          {Array.from(
            { length: 4 },
            (_, i) => min + 10 + (i * (max - min - 20)) / 3,
          ).map((v) => (
            <g key={v}>
              <line
                x1="40"
                x2="980"
                y1={y(v)}
                y2={y(v)}
                stroke="#263236"
                strokeDasharray="3 8"
              />
              <text x="4" y={y(v) + 4} fill="#64716f" fontSize="10">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {baseline !== null && (
            <line
              x1="40"
              x2="980"
              y1={y(baseline)}
              y2={y(baseline)}
              stroke="#7e8987"
              strokeDasharray="6 7"
            />
          )}
          <path d={line} fill="none" stroke="#ff765433" strokeWidth="8" />
          <path
            d={line}
            fill="none"
            stroke="#ff7654"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
          {moments
            .filter((m) => m.t >= lo && m.t <= hi && m.bpm !== null)
            .map((m) => (
              <g
                key={m.id}
                data-marker="true"
                role="button"
                tabIndex={0}
                aria-label={`${m.phase} at ${time(m.t)}`}
                onClick={() => onSelect(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(m);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <line
                  x1={x(m.t)}
                  x2={x(m.t)}
                  y1={y(m.bpm!) + 9}
                  y2="305"
                  stroke={m.phase === "ENTRY" ? "#58d6ac" : "#a88bff"}
                  strokeDasharray="3 5"
                  opacity=".55"
                />
                <circle
                  cx={x(m.t)}
                  cy={y(m.bpm!)}
                  r={selected === m.id ? 11 : 6}
                  fill={m.phase === "ENTRY" ? "#58d6ac" : "#a88bff"}
                  stroke={selected === m.id ? "#fff" : "transparent"}
                  strokeWidth="3"
                />
              </g>
            ))}
          {!pts.length && (
            <text
              x="500"
              y="165"
              fill="#8e9a99"
              textAnchor="middle"
              fontSize="14"
            >
              Heart-rate samples will appear here when recorded.
            </text>
          )}
          {drag && (
            <rect
              x={Math.min(...drag)}
              y="0"
              width={Math.abs(drag[1] - drag[0])}
              height="330"
              fill="#a88bff12"
              stroke="#9e86f0"
            />
          )}
        </svg>
        {hover && !drag && (
          <div
            className={cx("charttip")}
            style={{
              opacity: 1,
              left: `${Math.min(78, hover.x / 10)}%`,
              top: 16,
            }}
          >
            {time(hover.t)} · {hover.bpm} BPM
          </div>
        )}
      </div>
      <div className={cx("hint")}>
        <span>
          {zoom ? (
            <button className={cx("textlink")} onClick={() => setZoom(null)}>
              Reset zoom
            </button>
          ) : (
            "Drag to zoom into a moment"
          )}
        </span>
        <span>
          {time(lo, false)} — {time(hi, false)}
        </span>
      </div>
    </>
  );
}
