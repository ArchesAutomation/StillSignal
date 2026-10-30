"use client";
import { useEffect, useRef, useState } from "react";
import type { Sample, Session } from "@/lib/model";
import { money } from "@/lib/model";
import { downsample, nearest } from "@/lib/analytics";
import { noteTime } from "@/lib/journal-routing";
import { pnlExposure } from "@/lib/session-timeline";
import {
  clampChartRange,
  fitJournalRange,
  type ChartRange,
} from "@/lib/journal-space";
import { phaseColors } from "@/lib/phase-colors";
import { cx, time, type Moment } from "./shared";
export default function ReferenceRhythm({
  session,
  samples,
  phases,
  selected,
  phaseWindow,
  selectedTime,
  onSelect,
  onSeeLog,
  showPrice,
  onTogglePrice,
  priceView,
  timezone,
}: {
  timezone?: string;
  session: Session;
  samples: Sample[];
  baselineSeconds: number;
  phases: Moment[];
  selected?: string;
  phaseWindow?: [number, number];
  selectedTime?: number;
  onSelect: (m: Moment) => void;
  onSeeLog: (m: Moment) => void;
  showPrice?: boolean;
  onTogglePrice?: () => void;
  priceView?: import("react").ReactNode;
}) {
  const clock = (t: number, seconds = true) =>
    time(t, seconds, timezone || session.timezone);
  const [layers, setLayers] = useState({
    hr: true,
    realised: true,
    unrealised: true,
    fills: true,
    moments: true,
  });
  const [zoom, setZoom] = useState<[number, number]>(),
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
  const fit = fitJournalRange(session, [fullStart, fullEnd]);
  const start = zoom?.[0] ?? fit[0],
    end = zoom?.[1] ?? fit[1],
    span = end - start;
  const [viewHistory, setViewHistory] = useState<ChartRange[]>([]);
  const rangeRef = useRef<ChartRange>([start, end]);
  rangeRef.current = [start, end];
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pointers = useRef(new Map<number, number>());
  const gesture = useRef<
    | {
        range: ChartRange;
        mid: number;
        distance: number;
        width: number;
        left: number;
      }
    | undefined
  >(undefined);
  function remember() {
    const previous = [...rangeRef.current] as ChartRange;
    setViewHistory((h) => [...h.slice(-99), previous]);
  }
  function move(range: ChartRange, push = true) {
    if (push) remember();
    const next = clampChartRange(range, [fullStart, fullEnd]);
    rangeRef.current = next;
    setZoom(next);
  }
  function magnify(factor: number, fraction = 0.5, push = true) {
    const [a, b] = rangeRef.current,
      anchor = a + (b - a) * fraction;
    move(
      [anchor + (a - anchor) * factor, anchor + (b - anchor) * factor],
      push,
    );
  }
  useEffect(() => {
    setZoom(undefined);
    setViewHistory([]);
  }, [session.id]);
  useEffect(
    () => () => {
      clearTimeout(wheelTimer.current);
    },
    [],
  );
  useEffect(() => {
    const el = svg.current;
    if (!el || showPrice) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      if (!wheelTimer.current) remember();
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelTimer.current = undefined;
      }, 250);
      const box = el!.getBoundingClientRect();
      const fraction = Math.max(
        0,
        Math.min(1, (((e.clientX - box.left) / box.width) * 1000 - 62) / 850),
      );
      magnify(
        Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.004),
        fraction,
        false,
      );
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [fullStart, fullEnd, showPrice]);
  useEffect(() => {
    if (selectedTime === undefined) return;
    const [a, b] = rangeRef.current;
    if (selectedTime < a || selectedTime > b)
      move([selectedTime - (b - a) / 2, selectedTime + (b - a) / 2]);
  }, [selectedTime, selected]);
  function startGesture() {
    const values = [...pointers.current.values()],
      box = svg.current!.getBoundingClientRect();
    gesture.current = {
      range: [...rangeRef.current],
      mid: values.reduce((a, b) => a + b, 0) / values.length,
      distance: values.length > 1 ? Math.abs(values[1] - values[0]) : 0,
      width: (box.width * 850) / 1000,
      left: box.left + (box.width * 62) / 1000,
    };
  }
  function endPointer(id: number) {
    pointers.current.delete(id);
    if (pointers.current.size) startGesture();
    else gesture.current = undefined;
  }
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
            {clock(start)}–{clock(end)} ·{" "}
            {timezone || session.timezone || "Local time"}
          </p>
        </div>
        <div className={cx("ranges")}>
          <button
            hidden={showPrice}
            disabled={!viewHistory.length}
            onClick={() => {
              const previous = viewHistory.at(-1);
              if (previous) {
                setViewHistory((h) => h.slice(0, -1));
                move(previous, false);
              }
            }}
          >
            ↶ Previous view
          </button>
          <button hidden={showPrice} onClick={() => move(fit)}>
            Fit session
          </button>
          <button hidden={showPrice} onClick={() => move([fullStart, fullEnd])}>
            All measurements
          </button>
          <button aria-pressed={wide} onClick={() => setWide((v) => !v)}>
            {wide ? "Normal height" : "Expand chart"}
          </button>
        </div>
      </div>
      <div className={cx("chart-layers")} aria-label="Chart layers">
        {onTogglePrice && (
          <button aria-pressed={!!showPrice} onClick={onTogglePrice}>
            Price
          </button>
        )}
        {!showPrice &&
          (
            [
              ["hr", "Heart rate"],
              ["realised", "Realised P&L"],
              ["unrealised", "Unrealised P&L"],
              ["fills", "Entries & exits"],
              ["moments", "Journal moments"],
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
        {!showPrice && (
          <span className={cx("chart-zoom-buttons")}>
            <button aria-label="Zoom out" onClick={() => magnify(1.4)}>
              −
            </button>
            <button aria-label="Zoom in" onClick={() => magnify(1 / 1.4)}>
              ＋
            </button>
          </span>
        )}
      </div>
      {showPrice ? (
        priceView
      ) : (
        <svg
          ref={svg}
          viewBox="0 0 1000 325"
          className={cx("rhythm-svg")}
          role="img"
          aria-label="Combined session timeline with BPM and currency axes"
          preserveAspectRatio="none"
          tabIndex={0}
          onDoubleClick={() => move(fit)}
          onKeyDown={(e) => {
            if (e.key === "+" || e.key === "=") {
              e.preventDefault();
              magnify(1 / 1.4);
            }
            if (e.key === "-") {
              e.preventDefault();
              magnify(1.4);
            }
          }}
          onPointerDown={(e) => {
            if ((e.target as Element).closest("[data-marker]")) return;
            if (!pointers.current.size) remember();
            pointers.current.set(e.pointerId, e.clientX);
            e.currentTarget.setPointerCapture(e.pointerId);
            startGesture();
          }}
          onPointerMove={(e) => {
            setCursor(((coordinate(e.clientX) - 62) / 850) * 100);
            if (!pointers.current.has(e.pointerId) || !gesture.current) return;
            pointers.current.set(e.pointerId, e.clientX);
            const g = gesture.current,
              values = [...pointers.current.values()],
              mid = values.reduce((a, b) => a + b, 0) / values.length;
            const span = g.range[1] - g.range[0],
              shift = ((mid - g.mid) / g.width) * span;
            let a = g.range[0] - shift,
              b = g.range[1] - shift;
            if (values.length > 1 && g.distance > 5) {
              const factor =
                  g.distance / Math.max(5, Math.abs(values[1] - values[0])),
                fraction = Math.max(0, Math.min(1, (g.mid - g.left) / g.width)),
                anchor = a + span * fraction;
              a = anchor - span * factor * fraction;
              b = a + span * factor;
            }
            move([a, b], false);
          }}
          onPointerUp={(e) => endPointer(e.pointerId)}
          onPointerCancel={(e) => endPointer(e.pointerId)}
        >
          <text x="8" y="18" fill="var(--green)" fontSize="12">
            BPM
          </text>
          <text x="930" y="18" fill="var(--blue)" fontSize="12">
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
                {points.length
                  ? Math.round(pmax - ((pmax - pmin) * i) / 3)
                  : "—"}
              </text>
            </g>
          ))}
          {phaseWindow &&
            selected &&
            phaseWindow[1] >= start &&
            phaseWindow[0] <= end && (
              <g
                data-phase-highlight={selected}
                pointerEvents="none"
                aria-label={`${selected} highlighted on chart`}
              >
                <rect
                  x={Math.max(62, x(phaseWindow[0]))}
                  y="40"
                  width={Math.max(
                    2,
                    Math.min(912, x(phaseWindow[1])) -
                      Math.max(62, x(phaseWindow[0])),
                  )}
                  height="235"
                  fill={phaseColors[selected] || phaseColors.reflection}
                  fillOpacity="0.18"
                  stroke={phaseColors[selected] || phaseColors.reflection}
                  strokeOpacity="0.65"
                />
                {selectedTime !== undefined && inside(selectedTime) && (
                  <line
                    x1={x(selectedTime)}
                    x2={x(selectedTime)}
                    y1="40"
                    y2="275"
                    stroke={phaseColors[selected] || phaseColors.reflection}
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                )}
                <text
                  x={Math.min(820, Math.max(68, x(phaseWindow[0]) + 6))}
                  y="56"
                  fill={phaseColors[selected] || phaseColors.reflection}
                  fontSize="11"
                >
                  {selected[0].toUpperCase() + selected.slice(1)}
                </text>
              </g>
            )}
          {layers.hr && (
            <path
              data-layer="hr"
              d={hrPath}
              fill="none"
              stroke="var(--green)"
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
              stroke="var(--gold)"
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
              stroke="var(--blue)"
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
                  aria-label={`${e.kind} ${clock(e.t)}`}
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
                  <text
                    x={Math.max(96, Math.min(860, x(e.t)))}
                    y={e.kind === "exit" ? "72" : "55"}
                    fill={e.kind === "exit" ? "var(--blue)" : "var(--coral)"}
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {e.kind.toUpperCase()} · {e.quantity}
                  </text>
                  <title>
                    {e.kind} · {e.quantity} @ {e.price} · {clock(e.t)}
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
                  aria-label={`Open moment ${clock(noteTime(n)!)} ${n.label}`}
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
                        ?.scrollIntoView({
                          block: "center",
                          behavior: "smooth",
                        });
                    }
                  }}
                >
                  <circle
                    cx={x(noteTime(n)!)}
                    cy="31"
                    r="5"
                    fill="var(--gold)"
                  />
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
              {clock(start + (span * i) / 6, false)}
            </text>
          ))}
          {selectedTime !== undefined &&
            inside(selectedTime) &&
            !phaseWindow && (
              <line
                x1={x(selectedTime)}
                x2={x(selectedTime)}
                y1="40"
                y2="275"
                stroke="var(--purple)"
                strokeWidth="2"
                strokeDasharray="4 4"
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
      )}
      <div className={cx("chart-tip")}>
        Scroll to zoom at your cursor · drag to move through time · double-click
        to fit session · touch: pinch to zoom
      </div>
      <small>
        {clock(at)} · {point ? `${point.bpm} BPM` : "HR unavailable"} · Open P&L{" "}
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
          <div className={cx("phase-link")} key={m.id}>
            <button
              className={cx(
                "phase",
                selected === m.phase.toLowerCase() && "active",
              )}
              data-phase={m.phase.toLowerCase()}
              aria-pressed={selected === m.phase.toLowerCase()}
              onClick={() => onSelect(m)}
            >
              <span>{m.phase}</span>
              <strong>{clock(m.t)}</strong>
              <small>
                {m.bpm === null ? "No measured HR" : `${Math.round(m.bpm)} BPM`}
              </small>
            </button>
            <button
              className={cx("see-log")}
              aria-label={`See ${m.phase.toLowerCase()} log`}
              onClick={() => onSeeLog(m)}
            >
              See log <span aria-hidden="true">↗</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
