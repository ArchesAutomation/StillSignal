"use client";
import { useEffect, useRef, useState } from "react";
import type { Sample, Session } from "@/lib/model";
import { money } from "@/lib/model";
import { downsample, nearest } from "@/lib/analytics";
import { noteTime } from "@/lib/journal-routing";
import { pnlExposure } from "@/lib/session-timeline";
import { cx, time, type Moment } from "./shared";
export default function ReferenceRhythm({
  session,
  samples,
  phases,
  selected,
  onSelect,
}: {
  session: Session;
  samples: Sample[];
  baselineSeconds: number;
  phases: Moment[];
  selected?: string;
  onSelect: (m: Moment) => void;
}) {
  const [layers, setLayers] = useState({
    hr: true,
    realised: true,
    unrealised: true,
    fills: true,
    moments: true,
  });
  const [zoom, setZoom] = useState<[number, number]>(),
    [drag, setDrag] = useState<[number, number]>(),
    [wide, setWide] = useState(false),
    [cursor, setCursor] = useState(50);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWide(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const accounts = [
    ...new Set([
      ...(session.blueprint?.pnl || []).map((p) => p.account),
      ...session.events.map(
        (e) => e.broker?.accountId || e.account || "manual",
      ),
    ]),
  ];
  const account = session.blueprint?.leaderAccount || accounts[0] || "";
  const currency =
    session.blueprint?.pnl?.find((p) => p.account === account)?.currency ||
    session.events.find(
      (e) => (e.broker?.accountId || e.account || "manual") === account,
    )?.currency ||
    "USD";
  const exposure = pnlExposure(session, account, currency),
    pnl = exposure.curve;
  const fills = session.events.filter(
    (e) =>
      !e.voided &&
      e.timePrecision !== "day" &&
      (e.broker?.accountId || e.account || "manual") === account,
  );
  const notes = session.journal.filter(
    (n) => !n.deletedAt && noteTime(n) !== null,
  );
  const timestamps = [
    ...samples.map((p) => p.t),
    ...fills.map((e) => e.t),
    ...pnl.map((p) => p.t),
    ...notes.map((n) => noteTime(n)!),
  ];
  const fullStart = timestamps.length
      ? Math.min(...timestamps)
      : session.startedAt,
    fullEnd = Math.max(
      fullStart + 60000,
      timestamps.length
        ? Math.max(...timestamps)
        : session.endedAt || session.startedAt + 3600000,
    );
  const start = zoom?.[0] ?? fullStart,
    end = zoom?.[1] ?? fullEnd,
    span = end - start;
  const inside = (t: number) => t >= start && t <= end;
  const paused = (t: number) =>
    session.blueprint?.measurementPauses?.some(
      (p) => t >= p.start && t <= (p.end || Infinity),
    );
  const hr = samples.filter(
    (p) => inside(p.t) && !paused(p.t) && p.quality !== "artifact",
  );
  const points = pnl.filter((p) => inside(p.t) && !paused(p.t));
  const low = Math.min(50, ...hr.map((p) => p.bpm)) - 5,
    high = Math.max(110, ...hr.map((p) => p.bpm)) + 5;
  const values = points.flatMap((p) => [
    p.realised,
    ...(p.unrealised === undefined ? [] : [p.unrealised]),
  ]);
  const pmin = Math.min(0, ...values),
    pmax = Math.max(1, ...values);
  const x = (t: number) => 62 + ((t - start) / span) * 850,
    y = (v: number) => 270 - ((v - low) / (high - low)) * 225,
    py = (v: number) => 270 - ((v - pmin) / (pmax - pmin)) * 225;
  function path(
    data: { t: number; v?: number }[],
    scale: (v: number) => number,
    maxGap: number,
  ) {
    let previous: number | undefined;
    return data
      .map((p) => {
        if (p.v === undefined) {
          previous = undefined;
          return "";
        }
        const move =
          previous === undefined ||
          p.t - previous > maxGap ||
          session.blueprint?.measurementPauses?.some(
            (g) => g.start > previous! && g.start < p.t,
          );
        previous = p.t;
        return `${move ? "M" : "L"}${x(p.t).toFixed(2)} ${scale(p.v).toFixed(2)}`;
      })
      .join(" ");
  }
  const segments: Sample[][] = [];
  for (const p of hr) {
    if (!segments.length || p.t - segments.at(-1)!.at(-1)!.t > 15000)
      segments.push([]);
    segments.at(-1)!.push(p);
  }
  const hrPath = segments
    .map((g) =>
      path(
        downsample(g, 500).map((p) => ({ t: p.t, v: p.bpm })),
        y,
        15000,
      ),
    )
    .join(" ");
  const coordinate = (clientX: number) => {
    const box = svg.current!.getBoundingClientRect();
    return Math.max(
      62,
      Math.min(912, ((clientX - box.left) / box.width) * 1000),
    );
  };
  const timestamp = (n: number) => start + ((n - 62) / 850) * span;
  const at = start + (span * cursor) / 100,
    point = nearest(hr, at, 10000),
    mark = points.filter((p) => p.t <= at && at - p.t <= 10000).at(-1);
  return (
    <section
      className={cx("reference-rhythm", "reference-card", wide && "chart-wide")}
      aria-label="Session rhythm"
    >
      <div className={cx("timeline-head")}>
        <div>
          <h2>The rhythm of your session</h2>
          <p>
            Heart rate, P&L, executions and your moments. Drag across the plot
            to zoom.
          </p>
        </div>
        <div className={cx("ranges")}>
          <button
            onClick={() => {
              setZoom(undefined);
              setDrag(undefined);
            }}
          >
            Reset zoom
          </button>
          <button aria-pressed={wide} onClick={() => setWide((v) => !v)}>
            {wide ? "Close wide chart" : "Wide chart"}
          </button>
        </div>
      </div>
      <div className={cx("chart-layers")} aria-label="Chart layers">
        {(
          [
            ["hr", "Heart rate"],
            ["realised", "Realised P&L"],
            ["unrealised", "Unrealised P&L"],
            ["fills", "Executions"],
            ["moments", "Moments"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={layers[key]}
            onClick={() => setLayers((v) => ({ ...v, [key]: !v[key] }))}
          >
            {label}
          </button>
        ))}
      </div>
      <svg
        ref={svg}
        viewBox="0 0 1000 325"
        className={cx("rhythm-svg")}
        role="img"
        aria-label="Combined session timeline with BPM and currency axes"
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-marker]")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const v = coordinate(e.clientX);
          setDrag([v, v]);
        }}
        onPointerMove={(e) => {
          const v = coordinate(e.clientX);
          setCursor(((v - 62) / 850) * 100);
          if (drag) setDrag([drag[0], v]);
        }}
        onPointerUp={(e) => {
          if (drag && Math.abs(coordinate(e.clientX) - drag[0]) > 8)
            setZoom([
              timestamp(Math.min(drag[0], coordinate(e.clientX))),
              timestamp(Math.max(drag[0], coordinate(e.clientX))),
            ]);
          setDrag(undefined);
        }}
        onPointerCancel={() => setDrag(undefined)}
      >
        <text x="8" y="18" fill="var(--coral)" fontSize="12">
          BPM
        </text>
        <text x="930" y="18" fill="var(--green)" fontSize="12">
          {currency}
        </text>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="62"
              x2="912"
              y1={45 + i * 75}
              y2={45 + i * 75}
              stroke="var(--line)"
              strokeDasharray="3 5"
            />
            <text x="10" y={49 + i * 75} fill="var(--muted)" fontSize="11">
              {Math.round(high - ((high - low) * i) / 3)}
            </text>
            <text x="926" y={49 + i * 75} fill="var(--muted)" fontSize="11">
              {points.length ? Math.round(pmax - ((pmax - pmin) * i) / 3) : "—"}
            </text>
          </g>
        ))}
        {layers.hr && (
          <path
            data-layer="hr"
            d={hrPath}
            fill="none"
            stroke="var(--coral)"
            strokeWidth="2"
          />
        )}
        {layers.realised && (
          <path
            data-layer="realised"
            d={path(
              points.map((p) => ({ t: p.t, v: p.realised })),
              py,
              60000,
            )}
            fill="none"
            stroke="var(--blue)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}
        {layers.unrealised && (
          <path
            data-layer="unrealised"
            d={path(
              points.map((p) => ({ t: p.t, v: p.unrealised })),
              py,
              60000,
            )}
            fill="none"
            stroke="var(--green)"
            strokeWidth="2"
          />
        )}
        {layers.fills &&
          fills
            .filter((e) => inside(e.t))
            .map((e) => (
              <g
                key={e.id}
                data-marker="fill"
                data-layer="fills"
                role="button"
                tabIndex={0}
                aria-label={`${e.kind} ${time(e.t)}`}
                onClick={() =>
                  onSelect({
                    id: e.id,
                    t: e.t,
                    phase: e.kind.toUpperCase(),
                    label: e.kind,
                    text: `${e.quantity} @ ${e.price}`,
                    event: e,
                    bpm: nearest(hr, e.t)?.bpm ?? null,
                  })
                }
                onKeyDown={(k) => {
                  if (k.key === "Enter" || k.key === " ") {
                    k.preventDefault();
                    onSelect({
                      id: e.id,
                      t: e.t,
                      phase: e.kind.toUpperCase(),
                      label: e.kind,
                      text: `${e.quantity} @ ${e.price}`,
                      event: e,
                      bpm: nearest(hr, e.t)?.bpm ?? null,
                    });
                  }
                }}
              >
                <line
                  x1={x(e.t)}
                  x2={x(e.t)}
                  y1="38"
                  y2="275"
                  stroke={e.kind === "exit" ? "var(--blue)" : "var(--green)"}
                  strokeDasharray="2 6"
                />
                <path
                  d={`M${x(e.t) - 5} 282 L${x(e.t) + 5} 282 L${x(e.t)} 273 Z`}
                  fill={e.kind === "exit" ? "var(--blue)" : "var(--green)"}
                />
                <title>
                  {e.kind} · {e.quantity} @ {e.price} · {time(e.t)}
                </title>
              </g>
            ))}
        {layers.moments &&
          notes
            .filter((n) => inside(noteTime(n)!))
            .map((n) => (
              <g
                key={n.id}
                data-marker="moment"
                data-layer="moments"
                role="button"
                tabIndex={0}
                aria-label={`Open moment ${time(noteTime(n)!)} ${n.label}`}
                onClick={() =>
                  onSelect({
                    id: n.id,
                    t: noteTime(n)!,
                    phase: n.section || "REFLECTION",
                    label: n.label,
                    text: n.text,
                    note: n,
                    bpm: n.context?.bpm ?? null,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    document
                      .getElementById("moment-" + n.id)
                      ?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }
                }}
              >
                <circle cx={x(noteTime(n)!)} cy="31" r="5" fill="var(--gold)" />
                <title>
                  {n.label}: {n.text}
                </title>
              </g>
            ))}
        {Array.from({ length: 7 }, (_, i) => (
          <text
            key={i}
            x={x(start + (span * i) / 6)}
            y="309"
            fill="var(--muted)"
            fontSize="11"
            textAnchor="middle"
          >
            {time(start + (span * i) / 6, false)}
          </text>
        ))}
        {drag && (
          <rect
            x={Math.min(...drag)}
            y="40"
            width={Math.abs(drag[1] - drag[0])}
            height="235"
            fill="var(--blue)"
            opacity="0.15"
          />
        )}
        {!hr.length && layers.hr && (
          <text
            x="487"
            y="150"
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="12"
          >
            No measured heart rate in this range
          </text>
        )}
      </svg>
      <small>
        {time(at)} · {point ? `${point.bpm} BPM` : "HR unavailable"} · Open P&L{" "}
        {mark?.unrealised === undefined
          ? "unavailable"
          : money(mark.unrealised, currency)}{" "}
        · {account || "No account"}
      </small>
      <p className={cx("quiet-copy")}>
        {samples.length} raw HR samples retained. Away intervals and gaps remain
        visible.{" "}
        {pnl.length
          ? `${exposure.source} · ${currency}.`
          : "Executions alone do not supply an open-profit path."}
      </p>
      <div className={cx("phases")}>
        {phases.map((m) => (
          <button
            key={m.id}
            className={cx(
              "phase",
              selected === m.phase.toLowerCase() && "active",
            )}
            data-phase={m.phase.toLowerCase()}
            onClick={() => onSelect(m)}
          >
            <span>{m.phase}</span>
            <strong>{time(m.t)}</strong>
            <small>
              {m.bpm === null ? "No measured HR" : `${Math.round(m.bpm)} BPM`}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
