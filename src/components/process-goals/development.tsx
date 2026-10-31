"use client";
import { useState } from "react";
import { auditSnapshot } from "@/lib/process/reviews";
import { latest } from "@/lib/process/model";
import { Empty, Field, Panel, type Context } from "../command-center/shared";
export default function ProcessDevelopment({ store, day, props }: Context) {
  const [start, setStart] = useState(day.body.date.slice(0, 8) + "01"),
    [end, setEnd] = useState(day.body.date);
  const days = latest(store.records, "day")
    .filter((d) => d.body.date >= start && d.body.date <= end)
    .sort((a, b) => a.body.date.localeCompare(b.body.date));
  const dates = [...new Set(days.map((d) => d.body.date))];
  return (
    <Panel
      title="Process development"
      detail="Daily evidence counts, including no-trade days. Missing reviews stay unknown; process consistency does not imply profitability."
    >
      <div className="cc-grid">
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
      </div>
      {!dates.length ? (
        <Empty>No trading days recorded in this period.</Empty>
      ) : (
        <div className="cc-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Preparation complete / days</th>
                <th>Known / unknown rules</th>
                <th>Violations</th>
                <th>Executions / unreviewed</th>
                <th>Variables</th>
                <th>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const s = auditSnapshot(
                  store.records,
                  props.history,
                  date,
                  date,
                  day.body.timezone,
                );
                return (
                  <tr key={date}>
                    <th>{date}</th>
                    <td>
                      {s.preparationComplete} / {s.days}
                    </td>
                    <td>
                      {s.knownRules} / {s.unknownRules}
                    </td>
                    <td>{s.brokenRules}</td>
                    <td>
                      {s.executions} / {s.unreviewedTrades}
                    </td>
                    <td>{s.observationCount}</td>
                    <td>
                      {
                        latest(store.records, "audit").filter(
                          (a) =>
                            a.body.period === "daily" && a.body.start === date,
                        ).length
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <small>
        Trading days are the independent date units. No confidence intervals or
        causal effects are inferred from these descriptive counts.
      </small>
    </Panel>
  );
}
