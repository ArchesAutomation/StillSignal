"use client";
import { useState } from "react";
import type { ProcessRecord, RecordOf } from "@/lib/process/model";
import {
  metricValue,
  type EvidenceRow,
  type Metric,
} from "@/lib/pattern-engine/compare";
import { regression } from "@/lib/pattern-engine/regression";
import { Empty, Field, Panel } from "./shared";
export default function RegressionAnalysis({
  rows,
  definitions,
  records,
  metric,
  window,
}: {
  rows: EvidenceRow[];
  definitions: RecordOf<"variable">[];
  records: ProcessRecord[];
  metric: Metric;
  window: string;
}) {
  const numeric = definitions.filter((d) =>
      ["number", "scale", "duration", "counter"].includes(d.body.type),
    ),
    [first, setFirst] = useState(""),
    [second, setSecond] = useState("");
  const a = records.find(
      (r): r is RecordOf<"variable"> => r.kind === "variable" && r.id === first,
    ),
    b = records.find(
      (r): r is RecordOf<"variable"> =>
        r.kind === "variable" && r.id === second,
    );
  const complete =
    a && b
      ? rows.flatMap((row) => {
          const av = row.variables.find((v) => v.definition.id === a.id)
              ?.observation.body.value,
            bv = row.variables.find((v) => v.definition.id === b.id)
              ?.observation.body.value,
            y = metricValue(row, metric, window);
          return typeof av === "number" && typeof bv === "number" && y !== null
            ? [{ day: row.day, y, x: [av, bv] }]
            : [];
        })
      : [];
  const model =
    a && b
      ? regression(complete, [
          `${a.body.name} (${a.body.unit || a.body.type}, v${a.revision})`,
          `${b.body.name} (${b.body.unit || b.body.type}, v${b.revision})`,
        ])
      : undefined;
  return (
    <Panel
      title="Conditional multivariable analysis"
      detail="Exploratory linear regression · uncertainty accounts for trades clustered within the same day"
    >
      <div className="cc-grid">
        {(
          [
            [first, setFirst, "First predictor"],
            [second, setSecond, "Second predictor"],
          ] as const
        ).map(([value, set, label]) => (
          <Field key={label} label={label}>
            <select value={value} onChange={(e) => set(e.target.value)}>
              <option value="">Choose a definition version</option>
              {records
                .filter(
                  (r): r is RecordOf<"variable"> =>
                    r.kind === "variable" &&
                    numeric.some((n) => n.rootId === r.rootId),
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.body.name} v{d.revision} · {d.body.unit || d.body.type}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>
      {!model ? (
        <Empty>
          Choose two numeric definition versions. Use the strategy, instrument,
          account and time filters above to compare similar circumstances.
        </Empty>
      ) : !model.available ? (
        <p className="cc-muted">
          {model.reason} Currently {model.n} complete observations across{" "}
          {model.days} days; {rows.length - complete.length} missing or
          incompatible observations excluded.
        </p>
      ) : (
        <>
          <p>
            {model.n} complete executions · {model.days} days ·{" "}
            {rows.length - complete.length} excluded · R²{" "}
            {model.rSquared?.toFixed(3) ?? "unavailable"}
          </p>
          <div className="cc-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Predictor</th>
                  <th>Estimated association per unit</th>
                  <th>Day-cluster robust standard error</th>
                </tr>
              </thead>
              <tbody>
                {model.coefficients.map((c) => (
                  <tr key={c.name}>
                    <th>{c.name}</th>
                    <td>{c.estimate.toFixed(4)}</td>
                    <td>{c.standardError.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cc-muted">
            A coefficient describes an association conditional on the other
            selected variable. This model does not establish causation, infer
            emotions, adjust for unrecorded confounders, or prescribe trading
            decisions.
          </p>
        </>
      )}
    </Panel>
  );
}
