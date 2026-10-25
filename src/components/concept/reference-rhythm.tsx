"use client";
import { useState } from "react";
import type { Sample, Session } from "@/lib/model";
import { money } from "@/lib/model";
import { summary, downsample } from "@/lib/analytics";
import { noteTime } from "@/lib/journal-routing";
import { pnlExposure } from "@/lib/session-timeline";
import { cx, type Moment } from "./shared";
export default function ReferenceRhythm({
  session,
  samples,
  baselineSeconds,
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
  const [cursor, setCursor] = useState(50),
    [wholeDay, setWholeDay] = useState(false);
  const accounts = [
      ...new Set([
        ...(session.blueprint?.pnl || []).map((p) => p.account),
        ...session.events.map(
          (e) => e.broker?.accountId || e.account || "manual",
        ),
      ]),
    ],
    account = session.blueprint?.leaderAccount || accounts[0] || "";
  const currency =
    session.blueprint?.pnl?.find((p) => p.account === account)?.currency ||
    session.events.find(
      (e) => (e.broker?.accountId || e.account || "manual") === account,
    )?.currency ||
    "USD";
  const exposure = pnlExposure(session, account, currency),
    pnl = exposure.curve;
  const times = [
    ...samples.map((p) => p.t),
    ...session.events
      .filter((e) => !e.voided && e.timePrecision !== "day")
      .map((e) => e.t),
    ...pnl.map((p) => p.t),
  ];
  let start = times.length
      ? times.reduce((a, b) => Math.min(a, b), Infinity)
      : session.startedAt,
    end = times.length
      ? times.reduce((a, b) => Math.max(a, b), -Infinity)
      : session.endedAt || session.startedAt + 3600000;
  if (wholeDay) {
    const d = new Date(session.startedAt);
    d.setHours(0, 0, 0, 0);
    start = d.getTime();
    d.setDate(d.getDate() + 1);
    end = d.getTime();
  }
  end = Math.max(start + 60000, end);
  const span = end - start,
    x = (t: number) => 52 + ((t - start) / span) * 864;
  const low = samples.reduce((a, p) => Math.min(a, p.bpm), 50) - 5,
    high = samples.reduce((a, p) => Math.max(a, p.bpm), 110) + 5,
    y = (v: number) => 192 - ((v - low) / (high - low)) * 155;
  const values = pnl.flatMap((p) =>
      p.unrealised === undefined ? [p.realised] : [p.realised, p.unrealised],
    ),
    pmin = values.reduce((a, v) => Math.min(a, v), 0),
    pmax = values.reduce((a, v) => Math.max(a, v), 1),
    py = (v: number) => 192 - ((v - pmin) / (pmax - pmin)) * 155;
  function paths(
    points: { t: number; v?: number }[],
    scale: (v: number) => number,
    gap: number,
  ) {
    let previous: number | undefined;
    return points
      .map((p) => {
        if (p.v === undefined) {
          previous = undefined;
          return "";
        }
        const move = previous === undefined || p.t - previous > gap;
        previous = p.t;
        return `${move ? "M" : "L"}${x(p.t).toFixed(2)} ${scale(p.v).toFixed(2)}`;
      })
      .join(" ");
  }
  // Split at source gaps before reducing the number of rendered points.
  const groups: Sample[][] = [];
  for (const p of samples) {
    if (!groups.length || p.t - groups.at(-1)!.at(-1)!.t > 15000)
      groups.push([]);
    groups.at(-1)!.push(p);
  }
  const hrPath = groups
    .map((g) =>
      paths(
        downsample(g, 400).map((p) => ({ t: p.t, v: p.bpm })),
        y,
        Infinity,
      ),
    )
    .join(" ");
  const stats = summary(
      samples,
      samples[0]?.t || session.startedAt,
      baselineSeconds,
    ),
    at = start + (span * cursor) / 100;
  const window = samples.filter((p) => Math.abs(p.t - at) <= 30000),
    mean = window.length
      ? window.reduce((n, p) => n + p.bpm, 0) / window.length
      : null;
  const quote = pnl.filter((p) => p.t <= at && at - p.t <= 10000).at(-1);
  const moments = session.journal.filter(
    (n) =>
      !n.deletedAt &&
      noteTime(n) !== null &&
      noteTime(n)! >= start &&
      noteTime(n)! <= end,
  );
  const time = (t: number) =>
    new Date(t).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  return (
    <section
      className={cx("reference-rhythm", "reference-card")}
      aria-label="Session rhythm"
    >
      <div className={cx("timeline-head")}>
        <div>
          <h2>The rhythm of your session</h2>
          <p>Executions and reflections on one timeline.</p>
        </div>
        <div className={cx("ranges")}>
          <button aria-pressed={!wholeDay} onClick={() => setWholeDay(false)}>
            Fit session
          </button>
          <button aria-pressed={wholeDay} onClick={() => setWholeDay(true)}>
            Whole day
          </button>
        </div>
      </div>
      <div className={cx("rhythm-legend")}>
        <span style={{ color: "var(--coral)" }}>● HR · left axis</span>
        <span style={{ color: "var(--green)" }}>
          ● Unrealised P&L · right axis
        </span>
        <span style={{ color: "var(--blue)" }}>
          ● Realised P&L · right axis
        </span>
        <span>◇ Journal moment</span>
      </div>
      <svg
        viewBox="0 0 1000 235"
        className={cx("rhythm-svg")}
        role="img"
        aria-label="Heart rate and recorded P&L with separate BPM and currency axes"
      >
        <text x="8" y="16" fill="var(--coral)" fontSize="10">
          BPM
        </text>
        {pnl.length > 0 && (
          <text x="953" y="16" fill="var(--green)" fontSize="10">
            {currency}
          </text>
        )}
        {[0, 1, 2, 3].map((i) => {
          const value = low + ((high - low) * i) / 3;
          return (
            <g key={i}>
              <line
                x1="52"
                x2="916"
                y1={y(value)}
                y2={y(value)}
                stroke="var(--line)"
                strokeDasharray="3 5"
              />
              <text x="8" y={y(value) + 4} fill="var(--muted)" fontSize="10">
                {Math.round(value)}
              </text>
              {pnl.length > 0 && (
                <text
                  x="930"
                  y={y(value) + 4}
                  fill="var(--green)"
                  fontSize="10"
                >
                  {Math.round(pmin + ((pmax - pmin) * i) / 3)}
                </text>
              )}
            </g>
          );
        })}
        {stats.baseline !== null && (
          <line
            x1="52"
            x2="916"
            y1={y(stats.baseline)}
            y2={y(stats.baseline)}
            stroke="var(--muted)"
            strokeDasharray="3 6"
          />
        )}
        {hrPath && (
          <path
            d={hrPath}
            stroke="var(--coral)"
            strokeWidth="1.7"
            fill="none"
          />
        )}
        <path
          d={paths(
            pnl.map((p) => ({ t: p.t, v: p.unrealised })),
            py,
            60000,
          )}
          stroke="var(--green)"
          strokeWidth="1.7"
          fill="none"
        />
        <path
          d={paths(
            pnl.map((p) => ({ t: p.t, v: p.realised })),
            py,
            60000,
          )}
          stroke="var(--blue)"
          strokeWidth="1.6"
          strokeDasharray="4 3"
          fill="none"
        />
        {moments.map((n) => (
          <g
            key={n.id}
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
                bpm: n.context?.bpm ?? null,
                note: n,
              })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect({
                  id: n.id,
                  t: noteTime(n)!,
                  phase: n.section || "REFLECTION",
                  label: n.label,
                  text: n.text,
                  bpm: n.context?.bpm ?? null,
                  note: n,
                });
              }
            }}
          >
            <line
              x1={x(noteTime(n)!)}
              x2={x(noteTime(n)!)}
              y1="32"
              y2="192"
              stroke="var(--line)"
            />
            <circle cx={x(noteTime(n)!)} cy="28" r="5" fill="var(--gold)" />
            <title>
              {n.label}: {n.text}
            </title>
          </g>
        ))}
        {Array.from({ length: 7 }, (_, i) => {
          const t = start + (span * i) / 6;
          return (
            <text
              key={i}
              x={x(t)}
              y="219"
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="10"
            >
              {time(t).slice(0, 5)}
            </text>
          );
        })}
        {!samples.length && (
          <text
            x="484"
            y="115"
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="12"
          >
            No measured heart rate for this session
          </text>
        )}
      </svg>
      <details className={cx("rhythm-inspector")}>
        <summary>Inspect an exact time</summary>
        <input
          aria-label="Inspect session time"
          type="range"
          min="0"
          max="100"
          step="0.01"
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
        />
        <p>
          {time(at)} · HR ±30s:{" "}
          {mean === null
            ? "unavailable"
            : `${mean.toFixed(1)} BPM · ${window.length} samples`}
          {stats.baseline !== null && mean !== null
            ? ` · ${(mean - stats.baseline).toFixed(1)} from opening baseline`
            : ""}{" "}
          · Open P&L:{" "}
          {quote?.unrealised === undefined
            ? "unavailable"
            : money(quote.unrealised, currency)}
          {quote ? ` · source ${exposure.source} at ${time(quote.t)}` : ""}
        </p>
      </details>
      <p className={cx("quiet-copy")}>
        {samples.length} measured HR samples.{" "}
        {pnl.length
          ? `${exposure.source} · ${account} · ${currency}.`
          : "No timestamped P&L supplied. Executions alone do not provide an open-profit path."}{" "}
        Gaps remain visible; missing values stay unavailable.
      </p>
      <div className={cx("phases")}>
        {phases.map((m) => (
          <button
            className={cx(
              "phase",
              selected === m.phase.toLowerCase() && "active",
            )}
            data-phase={m.phase.toLowerCase()}
            key={m.id}
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
