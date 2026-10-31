"use client";
import { useState } from "react";
import { createRecord, latest } from "@/lib/process/model";
import type { EvidenceRow } from "@/lib/pattern-engine/compare";
import { Area, Field, Input, Save, string, type Context } from "./shared";
export default function AnalysisMission({
  context,
  rows,
  variable,
  filters,
}: {
  context: Context;
  rows: EvidenceRow[];
  variable: string;
  filters: string;
}) {
  const { store, day } = context,
    [open, setOpen] = useState(false),
    [message, setMessage] = useState("");
  const definition = latest(store.records, "variable").find(
      (v) => v.rootId === variable,
    ),
    days = new Set(rows.map((r) => r.day)).size,
    sessions = new Set(rows.map((r) => r.session.id)).size;
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Create an optional mission from this analysis</summary>
      <p>
        {rows.length} executions · {days} independent trading days · {sessions}{" "}
        recordings. This is exploratory evidence, not a causal finding.
      </p>
      <form
        className="cc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const source = string(f, "source") as
            | "preparation"
            | "observation"
            | "audit";
          if (source === "observation" && !definition) {
            store.setError(
              "Select a variable before creating a collection mission.",
            );
            return;
          }
          const evidence = rows.flatMap((r) =>
            r.variables.map((v) => ({
              kind: "observation" as const,
              id: v.observation.id,
            })),
          );
          const refs = [
            ...new Map(evidence.map((r) => [r.id, r])).values(),
          ].slice(0, 100);
          if (
            await store.save([
              createRecord(
                "goal",
                {
                  name: string(f, "name"),
                  description: `${string(f, "description")}\nExploratory analysis at ${new Date().toISOString()}: ${rows.length} executions, ${days} days, ${sessions} recordings. Filters: ${filters}. Missing evidence remains excluded; no causal claim.`,
                  source,
                  target: Number(f.get("target")),
                  start: string(f, "start"),
                  end: string(f, "end"),
                  milestones: [],
                  variableId:
                    source === "observation" ? definition?.rootId : undefined,
                },
                undefined,
                refs,
              ),
            ])
          ) {
            setMessage(
              "Mission created. Edit it and inspect progress in Missions.",
            );
            setOpen(false);
          }
        }}
      >
        <Input
          name="name"
          label="Mission name"
          value="Collect more process evidence"
          required
        />
        <Area
          name="description"
          label="Your interpretation and improvement goal"
        />
        <Field label="Evidence to count">
          <select name="source">
            <option value="preparation">Days with preparation complete</option>
            <option value="observation" disabled={!definition}>
              New observations of{" "}
              {definition?.body.name ?? "a selected variable"}
            </option>
            <option value="audit">Completed reviews</option>
          </select>
        </Field>
        <div className="cc-grid">
          <Input
            name="target"
            label="Target count"
            type="number"
            value={5}
            min={1}
            max={100000}
            required
          />
          <Input
            name="start"
            label="Mission begins"
            type="date"
            value={day.body.date}
            required
          />
          <Input
            name="end"
            label="Mission ends"
            type="date"
            value={day.body.date}
            required
          />
        </div>
        <Save store={store}>Create editable mission</Save>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
