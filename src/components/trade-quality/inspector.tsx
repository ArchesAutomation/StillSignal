"use client";
import { createRecord, latest } from "@/lib/process/model";
import { preparation, thesisAt } from "@/lib/process/engine";
import { QualityAssessment } from "./workspace";
import {
  Area,
  Empty,
  Field,
  Input,
  Panel,
  Save,
  string,
  type Context,
} from "../command-center/shared";
export default function DecisionInspector(context: Context) {
  const { store, day, props } = context,
    books = latest(store.records, "playbook"),
    prep = preparation(store.records, day.rootId);
  const assessments = latest(store.records, "assessment").filter(
    (a) => a.body.dayId === day.rootId && !a.body.tradeId,
  );
  return (
    <Panel
      title="Decision inspector"
      detail="Inspect your process before execution. Unknown evidence remains unresolved."
    >
      <p>
        Preparation: {prep.complete}/{prep.total} required · {prep.unknown}{" "}
        unknown.
      </p>
      {!books.length ? (
        <Empty>
          Create a strategy playbook to inspect a planned setup.
          <button onClick={() => props.onPage("Trade Quality")}>
            Open playbooks
          </button>
        </Empty>
      ) : (
        <details>
          <summary>Record a planned setup</summary>
          <form
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form),
                at = Date.now(),
                symbol = string(f, "symbol"),
                thesis = thesisAt(store.records, day.rootId, symbol, at);
              if (
                await store.save([
                  createRecord("assessment", {
                    dayId: day.rootId,
                    playbookId: string(f, "playbook"),
                    thesisId: thesis?.id,
                    planned: {
                      symbol,
                      side: string(f, "side") as "long" | "short",
                      quantity: Number(f.get("quantity")),
                      t: at,
                    },
                    retrospective: false,
                    assessedAt: at,
                    quality: null,
                    notes: string(f, "notes"),
                    override: string(f, "override"),
                    screenshots: [],
                  }),
                ])
              )
                form.reset();
            }}
          >
            <Field label="Strategy version">
              <select name="playbook" required>
                <option value="">Choose a playbook</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.body.name} · v{b.revision}
                  </option>
                ))}
              </select>
            </Field>
            <div className="cc-grid">
              <Input
                name="symbol"
                label="Planned symbol"
                value={day.body.instrument}
                required
              />
              <Field label="Planned direction">
                <select name="side">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </Field>
              <Input
                name="quantity"
                label="Planned quantity"
                type="number"
                step="any"
                min={0.00000001}
                required
              />
            </div>
            <Area name="notes" label="Decision notes" />
            <Area
              name="override"
              label="Manual override explanation (optional)"
            />
            <Save store={store}>Save planned inspection</Save>
          </form>
        </details>
      )}
      {assessments.slice(-5).map((assessment) => (
        <QualityAssessment
          key={assessment.id}
          context={context}
          assessment={assessment}
        />
      ))}
      <button onClick={() => props.onPage("Trade Quality")}>
        Open all assessments
      </button>
    </Panel>
  );
}
