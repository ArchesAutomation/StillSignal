"use client";
import { useEffect, useMemo, useState } from "react";
import type { Sample } from "@/lib/model";
import { getSamples } from "@/lib/storage";
import { pullSession } from "@/lib/cloud";
import { latest } from "@/lib/process/model";
import {
  buildEvidence,
  compare,
  describe,
  difference,
  metricValue,
  type EvidenceRow,
  type Metric,
} from "@/lib/pattern-engine/compare";
import {
  analyticalSamples,
  windowMetric,
} from "@/lib/pattern-engine/physiology";
import RegressionAnalysis from "./regression";
import AnalysisMission from "./analysis-mission";
import AnalysisViews from "./analysis-views";
import { Empty, Field, Panel, type Context } from "./shared";
const format = (v: number | null | undefined) =>
  v == null ? "Unavailable" : v.toFixed(1);
function Plot({
  points,
  label,
  line = false,
  xLabel,
  yLabel,
}: {
  points: { x: number; y: number; label?: string }[];
  label: string;
  line?: boolean;
  xLabel: string;
  yLabel: string;
}) {
  if (!points.length)
    return <Empty>No usable measurements for this plot.</Empty>;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys),
    x = (v: number) => 46 + ((v - xmin) / (xmax - xmin || 1)) * 460,
    y = (v: number) => 160 - ((v - ymin) / (ymax - ymin || 1)) * 130;
  return (
    <figure className="cc-plot">
      <svg viewBox="0 0 550 210" role="img" aria-label={label}>
        <path d="M46 20V165H520" stroke="#58646c" fill="none" />
        <text x="46" y="185">
          {format(xmin)}
        </text>
        <text x="480" y="185">
          {format(xmax)}
        </text>
        <text x="5" y="32">
          {format(ymax)}
        </text>
        <text x="5" y="163">
          {format(ymin)}
        </text>
        {line && (
          <polyline
            fill="none"
            stroke="#ed9a68"
            strokeWidth="2"
            points={points.map((p) => `${x(p.x)},${y(p.y)}`).join(" ")}
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.x)}
            cy={y(p.y)}
            r={line ? 3 : 4}
            fill="#ed9a68"
            opacity=".8"
          >
            <title>{p.label ?? `${p.x}: ${p.y}`}</title>
          </circle>
        ))}
        <text x="240" y="205">
          {xLabel}
        </text>
        <text x="48" y="15">
          {yLabel}
        </text>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
export default function PatternExplorer({ store, props, day }: Context) {
  const definitions = latest(store.records, "variable", Infinity, true).filter(
      (v) => v.body.analytics,
    ),
    [variable, setVariable] = useState(definitions[0]?.rootId ?? ""),
    [second, setSecond] = useState(""),
    [definitionVersion, setDefinitionVersion] = useState(""),
    [metric, setMetric] = useState<Metric>("hr-mean"),
    [window, setWindow] = useState("1m before"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(day.body.date),
    [strategy, setStrategy] = useState(""),
    [instrument, setInstrument] = useState(""),
    [account, setAccount] = useState(""),
    [bias, setBias] = useState(""),
    [hour, setHour] = useState(""),
    [ordinal, setOrdinal] = useState(""),
    [afterLoss, setAfterLoss] = useState(""),
    [coverage, setCoverage] = useState(0.8),
    [split, setSplit] = useState(""),
    [samples, setSamples] = useState<Map<string, Sample[]>>(
      () => new Map([[props.session.id, props.pulse.samples]]),
    ),
    [loading, setLoading] = useState(false),
    [loadState, setLoadState] = useState("Local recordings only");
  useEffect(() => {
    let alive = true;
    void Promise.all(
      props.history
        .filter((s) => !s.demo && s.blueprint?.combine?.hr !== false)
        .map(
          async (s) =>
            [
              s.id,
              s.id === props.session.id
                ? props.pulse.samples
                : await getSamples(s.id, props.pulse.owner),
            ] as const,
        ),
    )
      .then((rows) => {
        if (alive) setSamples(new Map(rows));
      })
      .catch((e) => store.setError(String(e)));
    return () => {
      alive = false;
    };
  }, [props.history, props.session.id, props.pulse.samples, props.pulse.owner]);
  const all = useMemo(
    () =>
      buildEvidence(
        store.records,
        props.history,
        samples,
        props.pulse.settings.baselineSeconds,
        props.threshold,
      ),
    [
      store.records,
      props.history,
      samples,
      props.pulse.settings.baselineSeconds,
      props.threshold,
    ],
  );
  const getHour = (row: EvidenceRow) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: day.body.timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(row.event.t));
  const rows = all.filter(
    (r) =>
      (!definitionVersion ||
        r.variables.some((v) => v.definition.id === definitionVersion)) &&
      (!start || r.day >= start) &&
      (!end || r.day <= end) &&
      (!strategy || r.strategy === strategy) &&
      (!instrument || r.event.symbol === instrument) &&
      (!account ||
        (r.event.broker?.accountId || r.event.account || "") === account) &&
      (!bias || r.bias === bias) &&
      (!hour || getHour(r) === hour) &&
      (!ordinal || r.indexInDay === Number(ordinal)) &&
      (!afterLoss ||
        (afterLoss === "unknown"
          ? r.sinceLoss === null
          : r.sinceLoss === (afterLoss === "yes"))) &&
      (!metric.startsWith("hr-") ||
        (r.physiology.windows[window]?.coverage ?? 0) >= coverage),
  );
  const comparison = compare(
      rows,
      metric,
      window,
      variable,
      split.trim() ? Number(split) : undefined,
      second || undefined,
    ),
    effect =
      comparison.groups.length === 2
        ? difference(comparison.groups[0], comparison.groups[1])
        : null;
  const plottedVersions = new Set(
    rows.flatMap((r) =>
      r.variables
        .filter((v) => v.definition.rootId === variable)
        .map((v) => v.definition.id),
    ),
  );
  const points =
    plottedVersions.size > 1
      ? []
      : rows.flatMap((row) => {
          const v = row.variables.find((v) => v.definition.rootId === variable),
            y = metricValue(row, metric, window);
          return typeof v?.observation.body.value === "number" && y !== null
            ? [
                {
                  x: v.observation.body.value,
                  y,
                  label: `${row.day} · ${row.event.symbol} · ${v.definition.body.unit} v${v.definition.revision}`,
                },
              ]
            : [];
        });
  const curve = Array.from({ length: 21 }, (_, i) => {
    const offset = i * 30 - 300,
      values = rows.flatMap((row) => {
        const baseline = row.physiology.baseline;
        if (baseline === null || row.event.timePrecision === "day") return [];
        const m = windowMetric(
          analyticalSamples(row.session, samples.get(row.session.id) ?? []),
          row.event.t + offset * 1000 - 15000,
          row.event.t + offset * 1000 + 15000,
          baseline,
        );
        return m.coverage >= coverage && m.meanDeviation !== null
          ? [m.meanDeviation]
          : [];
      });
    return {
      x: offset,
      y: describe(values).mean,
      label: `${offset}s · ${values.length} entry windows`,
    };
  }).filter((p): p is { x: number; y: number; label: string } => p.y !== null);
  const dayTrend = [...new Set(rows.map((r) => r.day))]
    .sort()
    .flatMap((date, i) => {
      const value = describe(
        rows
          .filter((r) => r.day === date)
          .flatMap((r) => {
            const v = metricValue(r, metric, window);
            return v === null ? [] : [v];
          }),
      ).mean;
      return value === null
        ? []
        : [{ x: i + 1, y: value, label: `${date} · ${format(value)}` }];
    });
  async function loadCloud() {
    setLoading(true);
    const next = new Map(samples);
    let failures = 0;
    for (const s of props.history.filter(
      (s) =>
        !s.demo &&
        s.blueprint?.combine?.hr !== false &&
        s.sampleCount > (next.get(s.id)?.length ?? 0),
    )) {
      try {
        const result = await pullSession(s.id);
        if (result.session.owner !== props.pulse.owner)
          throw new Error("Workspace identity mismatch.");
        next.set(s.id, result.samples);
      } catch {
        failures++;
      }
    }
    setSamples(next);
    setLoadState(
      failures
        ? `${failures} recording(s) unavailable; omitted HR stays missing`
        : "Available cloud recordings loaded",
    );
    setLoading(false);
  }
  return (
    <div className="cc-stack">
      <Panel
        title="Connected Pattern Explorer"
        detail="Descriptive associations across your recorded process, conditions, and physiology. Journal HR exclusions and source choices remain in effect."
        action={
          <button disabled={loading} onClick={() => void loadCloud()}>
            {loading ? "Loading recordings…" : "Load recorded HR from cloud"}
          </button>
        }
      >
        <p className="cc-muted">
          {loadState}. Event-dose variables use the latest prior event and its
          timestamp, not a daily total. Comparisons never combine different
          definition versions. Date-only imports are excluded from timed HR and
          pre-trade context.
        </p>
        <div className="cc-grid">
          <AnalysisViews
            store={store}
            filters={{
              variable,
              second,
              definitionVersion,
              metric,
              window,
              start,
              end,
              strategy,
              instrument,
              account,
              bias,
              hour,
              ordinal,
              afterLoss,
              coverage,
              split,
            }}
            onApply={(f) => {
              const text = (k: string) =>
                typeof f[k] === "string" ? String(f[k]) : "";
              setVariable(text("variable"));
              setSecond(text("second"));
              setDefinitionVersion(text("definitionVersion"));
              if (
                [
                  "hr-mean",
                  "hr-peak",
                  "hr-rate",
                  "hr-duration",
                  "hr-recovery",
                  "process",
                  "preparation",
                ].includes(text("metric"))
              )
                setMetric(text("metric") as Metric);
              setWindow(text("window"));
              setStart(text("start"));
              setEnd(text("end"));
              setStrategy(text("strategy"));
              setInstrument(text("instrument"));
              setAccount(text("account"));
              setBias(text("bias"));
              setHour(text("hour"));
              setOrdinal(text("ordinal"));
              setAfterLoss(text("afterLoss"));
              if (typeof f.coverage === "number")
                setCoverage(Math.max(0, Math.min(1, f.coverage)));
              setSplit(text("split"));
            }}
          />
          <AnalysisMission
            context={{ store, props, day }}
            rows={rows}
            variable={variable}
            filters={JSON.stringify({
              metric,
              window,
              start,
              end,
              strategy,
              instrument,
              account,
              bias,
              hour,
              ordinal,
              afterLoss,
              coverage,
              definitionVersion,
              split,
            })}
          />
          <Field label="Metric">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
            >
              {(
                [
                  ["hr-mean", "Mean HR deviation (BPM)"],
                  ["hr-peak", "Maximum HR deviation (BPM)"],
                  ["hr-rate", "Observed HR change (BPM/min)"],
                  ["hr-duration", `Seconds above +${props.threshold} BPM`],
                  ["hr-recovery", "Recovery to baseline ±5 BPM for 30s"],
                  ["process", "Process score (%)"],
                  ["preparation", "Preparation before execution (%)"],
                ] as const
              ).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Event window">
            <select value={window} onChange={(e) => setWindow(e.target.value)}>
              {[
                "5m before",
                "1m before",
                "Entry",
                "Holding",
                "Exit",
                "1m after exit",
                "5m after exit",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Variable">
            <select
              value={variable}
              onChange={(e) => {
                setVariable(e.target.value);
                setDefinitionVersion("");
              }}
            >
              <option value="">Choose a variable</option>
              {definitions.map((v) => (
                <option key={v.id} value={v.rootId}>
                  {v.body.name}
                  {v.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Definition version">
            <select
              value={definitionVersion}
              onChange={(e) => setDefinitionVersion(e.target.value)}
            >
              <option value="">All versions (kept in separate groups)</option>
              {store.records
                .filter(
                  (
                    r,
                  ): r is import("@/lib/process/model").RecordOf<"variable"> =>
                    r.kind === "variable" && r.rootId === variable,
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.revision} · {v.body.unit || v.body.type}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Second variable (optional)">
            <select value={second} onChange={(e) => setSecond(e.target.value)}>
              <option value="">None</option>
              {definitions
                .filter((v) => v.rootId !== variable)
                .map((v) => (
                  <option key={v.id} value={v.rootId}>
                    {v.body.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Numeric split (optional)">
            <input
              type="number"
              step="any"
              value={split}
              onChange={(e) => setSplit(e.target.value)}
            />
          </Field>
          <Field label="Minimum HR time coverage">
            <select
              value={coverage}
              onChange={(e) => setCoverage(Number(e.target.value))}
            >
              {[0, 0.5, 0.8, 0.9, 1].map((v) => (
                <option key={v} value={v}>
                  {v * 100}%
                </option>
              ))}
            </select>
          </Field>
          <Field label="Execution number in day">
            <input
              type="number"
              min="1"
              step="1"
              value={ordinal}
              onChange={(e) => setOrdinal(e.target.value)}
            />
          </Field>
          <Field label="After a prior recorded loss">
            <select
              value={afterLoss}
              onChange={(e) => setAfterLoss(e.target.value)}
            >
              <option value="">All</option>
              <option value="yes">Yes (same account, same day)</option>
              <option value="no">No (prior recorded non-loss)</option>
              <option value="unknown">No prior usable result</option>
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Through">
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          {(
            [
              [
                "Strategy",
                strategy,
                setStrategy,
                [
                  ...new Set(
                    all.map((r) => r.strategy).filter((s): s is string => !!s),
                  ),
                ],
              ],
              [
                "Instrument",
                instrument,
                setInstrument,
                [...new Set(all.map((r) => r.event.symbol))],
              ],
              [
                "Trading account",
                account,
                setAccount,
                [
                  ...new Set(
                    all
                      .map(
                        (r) =>
                          r.event.broker?.accountId || r.event.account || "",
                      )
                      .filter(Boolean),
                  ),
                ],
              ],
              [
                "Recorded bias",
                bias,
                setBias,
                ["bullish", "bearish", "neutral", "no-trade"],
              ],
              [
                "Hour (" + day.body.timezone + ")",
                hour,
                setHour,
                Array.from({ length: 24 }, (_, i) =>
                  i.toString().padStart(2, "0"),
                ),
              ],
            ] as const
          ).map(([label, value, set, choices]) => (
            <Field key={label} label={label}>
              <select value={value} onChange={(e) => set(e.target.value)}>
                <option value="">All</option>
                {choices.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <p>
          {rows.length} entry/execution observations ·{" "}
          {new Set(rows.map((r) => r.day)).size} trading days ·{" "}
          {new Set(rows.map((r) => r.session.id)).size} recording sessions ·{" "}
          {all.length - rows.length} filtered out · {comparison.excluded}{" "}
          missing comparison values
        </p>
        <p className="cc-muted">
          These are within-user observations. Correlation does not establish
          causation. Repeated trades on one day are not independent evidence.
        </p>
        {!!comparison.groups.length ? (
          <div className="cc-table-scroll">
            <table>
              <caption>Compared conditions and observed {metric}</caption>
              <thead>
                <tr>
                  <th>Condition (pinned version)</th>
                  <th>N</th>
                  <th>Days</th>
                  <th>Sessions</th>
                  <th>Mean</th>
                  <th>Median</th>
                  <th>SD</th>
                  <th>HR coverage</th>
                </tr>
              </thead>
              <tbody>
                {comparison.groups.map((g) => (
                  <tr key={g.key}>
                    <th>{g.key}</th>
                    <td>{g.stats.n}</td>
                    <td>{g.days}</td>
                    <td>{g.sessions}</td>
                    <td>{format(g.stats.mean)}</td>
                    <td>{format(g.stats.median)}</td>
                    <td>{format(g.stats.sd)}</td>
                    <td>
                      {g.coverage === null
                        ? "N/A"
                        : Math.round(g.coverage * 100) + "%"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            Select a variable and collect comparable observations. Missing
            measurements remain missing.
          </Empty>
        )}
        {effect && (
          <p>
            Observed mean difference (second group − first):{" "}
            {format(effect.effect)}.{" "}
            {effect.interval
              ? `Exploratory 95% day-cluster bootstrap interval: ${format(effect.interval[0])} to ${format(effect.interval[1])}.`
              : "Preliminary: uncertainty interval withheld until each group has at least five recorded days."}
          </p>
        )}
      </Panel>
      <div className="cc-grid">
        <Panel title="Variable scatterplot">
          {plottedVersions.size > 1 && (
            <p className="cc-muted">
              Choose one definition version to plot numeric values on a common
              axis.
            </p>
          )}
          <Plot
            points={points}
            label="Values shown in their recorded units; inspect version labels before comparing."
            xLabel="Recorded variable value"
            yLabel={metric}
          />
        </Panel>
        <Panel title="Event-aligned HR">
          <Plot
            points={curve}
            line
            label="30-second entry-aligned bins; each point uses sufficiently covered windows only."
            xLabel="Seconds from entry"
            yLabel="Mean baseline deviation (BPM)"
          />
        </Panel>
        <Panel title="Grouped distributions">
          <Plot
            points={comparison.groups.flatMap((g, i) =>
              g.values.map((y, j) => ({
                x: i + 1 + ((j % 5) - 2) * 0.035,
                y,
                label: `${g.key}: ${format(y)}`,
              })),
            )}
            label="One dot per usable execution; groups follow comparison table order."
            xLabel="Condition group"
            yLabel={metric}
          />
        </Panel>
        <Panel title="Process / metric trend">
          <Plot
            points={dayTrend}
            line
            label="Per-day descriptive means; days with no usable measurements are omitted."
            xLabel="Recorded trading-day index"
            yLabel={metric}
          />
        </Panel>
      </div>
      <Panel title="Time-of-day heatmap">
        <div className="cc-heatmap">
          {Array.from({ length: 24 }, (_, h) => {
            const values = rows
                .filter((r) => Number(getHour(r)) === h)
                .flatMap((r) => {
                  const v = metricValue(r, metric, window);
                  return v === null ? [] : [v];
                }),
              stats = describe(values);
            return (
              <div
                key={h}
                title={`${h}:00 · ${stats.n} observations`}
                style={
                  stats.n
                    ? {
                        background: `rgba(237,154,104,${Math.min(0.55, 0.1 + stats.n / 40)})`,
                      }
                    : {}
                }
              >
                <small>{h}:00</small>
                <strong>{stats.n ? format(stats.mean) : "—"}</strong>
                <small>n={stats.n}</small>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Session-to-session comparison">
        <div className="cc-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Observations</th>
                <th>Mean</th>
                <th>Median</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set(rows.map((r) => r.session.id))].map((id) => {
                const group = rows.filter((r) => r.session.id === id),
                  stats = describe(
                    group.flatMap((r) => {
                      const value = metricValue(r, metric, window);
                      return value === null ? [] : [value];
                    }),
                  );
                return (
                  <tr key={id}>
                    <th>{group[0].session.name}</th>
                    <td>{stats.n}</td>
                    <td>{format(stats.mean)}</td>
                    <td>{format(stats.median)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <RegressionAnalysis
        rows={rows}
        definitions={definitions}
        records={store.records}
        metric={metric}
        window={window}
      />
      <Panel
        title="Underlying recorded moments"
        detail="Open the original execution and timeline; inspect coverage and exclusions."
      >
        {!rows.length && (
          <Empty>
            No executions with linked process context match these filters.
            Existing HR analytics remain available below.
          </Empty>
        )}
        {rows.slice(0, 100).map((row) => (
          <details className="cc-evidence" key={row.id}>
            <summary>
              {row.day} · {row.event.symbol} ·{" "}
              {new Date(row.event.t).toLocaleTimeString()} ·{" "}
              {format(metricValue(row, metric, window))}
            </summary>
            <p>
              {row.physiology.exclusion || "Valid pre-event baseline recorded"}{" "}
              · baseline {format(row.physiology.baseline)} BPM · process
              evidence{" "}
              {row.ruleCoverage === null
                ? "unreviewed"
                : Math.round(row.ruleCoverage * 100) + "%"}
            </p>
            <p>
              Thesis version: {row.thesisId || "unavailable"} · check-in:{" "}
              {row.checkinId || "unavailable"}
            </p>
            <p>
              Conditions:{" "}
              {row.variables
                .map(
                  (v) =>
                    `${v.definition.body.name} v${v.definition.revision}: ${String(v.observation.body.value)} ${v.definition.body.unit} @ ${new Date(v.observation.body.observedAt).toLocaleString()}`,
                )
                .join("; ") || "No prior observations"}
            </p>
            <div className="cc-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Window</th>
                    <th>Coverage</th>
                    <th>Mean Δ</th>
                    <th>Max Δ</th>
                    <th>Rate / min</th>
                    <th>Above threshold (s)</th>
                    <th>Missing intervals</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(row.physiology.windows).map(([name, w]) => (
                    <tr key={name}>
                      <th>{name}</th>
                      <td>{Math.round(w.coverage * 100)}%</td>
                      <td>{format(w.meanDeviation)}</td>
                      <td>{format(w.maximumDeviation)}</td>
                      <td>{format(w.ratePerMinute)}</td>
                      <td>{format(w.aboveSeconds)}</td>
                      <td>{w.missingIntervals.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() =>
                void props.pulse
                  .openSession(row.session)
                  .then(() => props.onAdvanced(row.event))
                  .catch((e) => store.setError(String(e)))
              }
            >
              Open execution timeline
            </button>
          </details>
        ))}
        {rows.length > 100 && (
          <p>
            Showing the first 100 source moments; narrow filters to inspect
            more.
          </p>
        )}
      </Panel>
    </div>
  );
}
