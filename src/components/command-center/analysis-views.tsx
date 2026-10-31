"use client";
import { useState } from "react";
import { createRecord, latest } from "@/lib/process/model";
import { freshDashboard } from "@/lib/process/dashboard";
import type { ProcessStore } from "./use-process";
type Filters = Record<string, string | number>;
export default function AnalysisViews({
  store,
  filters,
  onApply,
}: {
  store: ProcessStore;
  filters: Filters;
  onApply: (filters: Filters) => void;
}) {
  const [name, setName] = useState("My analysis"),
    [message, setMessage] = useState("");
  const views = latest(store.records, "layout").filter(
    (r) => r.body.analysisView,
  );
  return (
    <details>
      <summary>Saved analysis views</summary>
      <div className="cc-actions">
        <label>
          View name
          <input
            aria-label="Analysis view name"
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          disabled={store.busy || !name.trim()}
          onClick={async () => {
            if (
              await store.save([
                createRecord("layout", {
                  ...freshDashboard(),
                  name: name.trim(),
                  isDefault: false,
                  analysisView: { filters },
                }),
              ])
            )
              setMessage(
                "Analysis filters saved. Results are recalculated from available evidence.",
              );
          }}
        >
          Save analysis view
        </button>
      </div>
      {views.map((view) => (
        <div key={view.id} className="cc-list-row">
          <button
            onClick={() => {
              onApply(view.body.analysisView!.filters);
              setName(view.body.name);
              setMessage(
                "Saved filters applied; this view does not freeze or invent results.",
              );
            }}
          >
            {view.body.name}
          </button>
          <button
            disabled={store.busy}
            onClick={() =>
              void store.save([
                { ...createRecord("layout", view.body, view), archived: true },
              ])
            }
          >
            Archive view
          </button>
        </div>
      ))}
      <p role="status">{message}</p>
    </details>
  );
}
