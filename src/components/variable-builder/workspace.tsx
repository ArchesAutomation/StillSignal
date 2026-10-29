"use client";
import { useRef, useState } from "react";
import {
  createRecord,
  latest,
  variableSchema,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import { displayValue } from "@/lib/environment/values";
import Temperature from "./temperature";
import {
  Area,
  Badge,
  Empty,
  Field,
  History,
  Input,
  Panel,
  Save,
  lines,
  number,
  string,
  type Context,
} from "../command-center/shared";
const empty: BodyOf<"variable"> = {
  name: "",
  category: "Environment",
  type: "number",
  unit: "",
  choices: [],
  frequency: "daily",
  phases: ["pre-market"],
  required: false,
  source: "manual",
  archived: false,
  analytics: true,
};
const localDate = (t: number) => {
  const d = new Date(t);
  return new Date(t - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function ObservationForm({
  context,
  definition,
  previous,
  onSaved,
}: {
  context: Context;
  definition: RecordOf<"variable">;
  previous?: RecordOf<"observation">;
  onSaved: () => void;
}) {
  const { store, day, props } = context,
    d = definition.body;
  return (
    <form
      key={definition.id + (previous?.id ?? "")}
      className="cc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          missing = string(f, "missing") as BodyOf<"observation">["missing"];
        const value =
          missing !== "recorded"
            ? null
            : d.type === "multi-select"
              ? f.getAll("value").map(String)
              : d.type === "boolean"
                ? string(f, "value") === "true"
                : d.type === "timestamp"
                  ? +new Date(string(f, "value"))
                  : ["number", "scale", "duration", "counter"].includes(d.type)
                    ? (number(f, "value") ?? null)
                    : string(f, "value");
        if (
          missing === "recorded" &&
          d.type === "boolean" &&
          string(f, "value") === ""
        ) {
          store.setError("Choose yes or no, or record a missing-data state.");
          return;
        }
        const body: BodyOf<"observation"> = {
          definitionId: definition.id,
          dayId: day.rootId,
          observedAt: +new Date(string(f, "observedAt")),
          phase: string(f, "phase") as BodyOf<"observation">["phase"],
          value,
          missing,
          source: "manual",
          provenance: string(f, "provenance"),
          sessionId: string(f, "sessionId") || undefined,
          tradeId: string(f, "tradeId") || undefined,
        };
        if (await store.save([createRecord("observation", body, previous)]))
          onSaved();
      }}
    >
      <h3>
        {previous ? "Correct observation" : "Record"} · {d.name}{" "}
        <Badge>
          definition v{definition.revision}
          {d.unit ? " · " + d.unit : ""}
        </Badge>
      </h3>
      <div className="cc-grid">
        <Input
          label="Observation time (your device timezone)"
          type="datetime-local"
          name="observedAt"
          value={localDate(previous?.body.observedAt ?? Date.now())}
          required
        />
        <Field label="Collection phase">
          <select
            name="phase"
            defaultValue={previous?.body.phase ?? d.phases[0]}
          >
            {d.phases.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Measurement state">
          <select
            name="missing"
            defaultValue={previous?.body.missing ?? "recorded"}
          >
            {["recorded", "not-recorded", "not-applicable", "unavailable"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </Field>
      </div>
      <Field label={d.name + (d.unit ? " (" + d.unit + ")" : "")}>
        {d.type === "boolean" ? (
          <select
            name="value"
            defaultValue={
              previous?.body.value === null || previous === undefined
                ? ""
                : String(previous.body.value)
            }
          >
            <option value="">Choose…</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        ) : d.type === "single-select" || d.type === "multi-select" ? (
          <select
            name="value"
            multiple={d.type === "multi-select"}
            defaultValue={
              d.type === "multi-select"
                ? Array.isArray(previous?.body.value)
                  ? previous.body.value
                  : []
                : typeof previous?.body.value === "string"
                  ? previous.body.value
                  : ""
            }
          >
            {d.type === "single-select" && <option value="">Choose…</option>}
            {d.choices.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ) : d.type === "text" ? (
          <textarea
            name="value"
            maxLength={8000}
            defaultValue={
              typeof previous?.body.value === "string"
                ? previous.body.value
                : ""
            }
          />
        ) : (
          <input
            name="value"
            type={d.type === "timestamp" ? "datetime-local" : "number"}
            step={d.type === "counter" ? "1" : "any"}
            min={d.min}
            max={d.max}
            defaultValue={
              d.type === "timestamp" && typeof previous?.body.value === "number"
                ? localDate(previous.body.value)
                : typeof previous?.body.value === "number"
                  ? previous.body.value
                  : ""
            }
          />
        )}
      </Field>
      <div className="cc-grid">
        <Field label="Recording session (optional)">
          <select
            name="sessionId"
            defaultValue={previous?.body.sessionId ?? ""}
          >
            <option value="">Day-level observation</option>
            {props.history
              .filter((s) => !s.demo)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {new Date(s.startedAt).toLocaleDateString()}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Specific execution (optional)">
          <select name="tradeId" defaultValue={previous?.body.tradeId ?? ""}>
            <option value="">No specific trade</option>
            {props.history
              .filter((s) => !s.demo)
              .flatMap((s) =>
                s.events
                  .filter((e) => !e.voided && e.provenance !== "alert")
                  .map((e) => (
                    <option key={s.id + e.id} value={e.id}>
                      {e.symbol} · {new Date(e.t).toLocaleString()}
                    </option>
                  )),
              )}
          </select>
        </Field>
      </div>
      <Area
        label="Provenance / correction note"
        name="provenance"
        value={previous?.body.provenance}
      />
      <Save store={store}>
        {previous ? "Save correction" : "Record observation"}
      </Save>
    </form>
  );
}
export default function Variables(context: Context) {
  const { day, store } = context,
    definitions = latest(store.records, "variable", Infinity, true),
    observations = latest(store.records, "observation", Infinity, true)
      .filter((o) => o.body.dayId === day.rootId)
      .sort((a, b) => b.body.observedAt - a.body.observedAt);
  const [editor, setEditor] = useState<{
      value: BodyOf<"variable">;
      previous?: RecordOf<"variable">;
    }>(),
    [observing, setObserving] = useState<{
      definition: RecordOf<"variable">;
      previous?: RecordOf<"observation">;
    }>(),
    file = useRef<HTMLInputElement>(null);
  const active = definitions.filter((d) => !d.archived && !d.body.archived);
  function exportTemplates() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "still-signal-variables-v1",
              definitions: active.map((d) => d.body),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "still-signal-variable-template.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="cc-stack">
      <Temperature {...context} />
      <Panel
        title="Environmental variables"
        detail="Create categories and typed measurements. Every observation keeps its definition version."
        action={
          <div className="cc-actions">
            <button onClick={() => setEditor({ value: empty })}>
              Create variable
            </button>
            <button onClick={exportTemplates}>Export template</button>
            <button onClick={() => file.current?.click()}>
              Import template
            </button>
          </div>
        }
      >
        <input
          hidden
          ref={file}
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            e.target.value = "";
            if (!selected) return;
            try {
              if (selected.size > 256000)
                throw new Error("Template is too large.");
              const data = JSON.parse(await selected.text());
              if (
                data.format !== "still-signal-variables-v1" ||
                !Array.isArray(data.definitions) ||
                data.definitions.length > 30
              )
                throw new Error(
                  "Invalid variable template (maximum 30 definitions).",
                );
              await store.save(
                data.definitions.map((d: unknown) =>
                  createRecord("variable", variableSchema.parse(d)),
                ),
              );
            } catch (e) {
              store.setError(
                e instanceof Error ? e.message : "Template import failed.",
              );
            }
          }}
        />
        {!definitions.length && (
          <Empty>
            No personal variables yet. Add sleep, caffeine, noise, focus, or any
            condition you want to record.
          </Empty>
        )}
        {definitions.map((d) => (
          <div className="cc-list-row" key={d.id}>
            <div>
              <strong>{d.body.name}</strong>
              <small>
                {d.body.category} · {d.body.type} · {d.body.unit || "no unit"} ·{" "}
                {d.body.frequency} · v{d.revision}
                {d.archived || d.body.archived ? " · archived" : ""}
              </small>
              <History records={store.records} rootId={d.rootId} />
            </div>
            <div className="cc-actions">
              <button
                disabled={d.archived || d.body.archived}
                onClick={() => setObserving({ definition: d })}
              >
                Record value
              </button>
              <button onClick={() => setEditor({ value: d.body, previous: d })}>
                Edit definition
              </button>
              <button
                disabled={store.busy}
                onClick={() =>
                  void store.save([
                    {
                      ...createRecord(
                        "variable",
                        { ...d.body, archived: !d.archived },
                        d,
                      ),
                      archived: !d.archived,
                    },
                  ])
                }
              >
                {d.archived ? "Restore" : "Archive"}
              </button>
            </div>
          </div>
        ))}
        {editor && (
          <form
            key={editor.previous?.id ?? "new"}
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body: BodyOf<"variable"> = {
                name: string(f, "name"),
                category: string(f, "category"),
                type: string(f, "type") as BodyOf<"variable">["type"],
                unit: string(f, "unit"),
                min: number(f, "min"),
                max: number(f, "max"),
                choices: lines(f, "choices"),
                frequency: string(
                  f,
                  "frequency",
                ) as BodyOf<"variable">["frequency"],
                phases: f
                  .getAll("phase")
                  .map(String) as BodyOf<"variable">["phases"],
                required: f.has("required"),
                analytics: f.has("analytics"),
                source: string(f, "source") as BodyOf<"variable">["source"],
                archived: editor.value.archived,
              };
              if (
                await store.save([
                  createRecord("variable", body, editor.previous),
                ])
              )
                setEditor(undefined);
            }}
          >
            <div className="cc-grid">
              <Input
                label="Display name"
                name="name"
                value={editor.value.name}
                required
              />
              <Input
                label="Category (create any name)"
                name="category"
                value={editor.value.category}
                required
              />
              <Field label="Value type">
                <select name="type" defaultValue={editor.value.type}>
                  {variableSchema.shape.type.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Input label="Unit" name="unit" value={editor.value.unit} />
              <Input
                label="Minimum (optional)"
                name="min"
                type="number"
                step="any"
                value={editor.value.min}
              />
              <Input
                label="Maximum (optional)"
                name="max"
                type="number"
                step="any"
                value={editor.value.max}
              />
              <Field label="Collection frequency">
                <select name="frequency" defaultValue={editor.value.frequency}>
                  {variableSchema.shape.frequency.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Definition source">
                <select name="source" defaultValue={editor.value.source}>
                  {variableSchema.shape.source.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Area
              label="Available choices (one per line, for select variables)"
              name="choices"
              value={editor.value.choices.join("\n")}
            />
            <fieldset>
              <legend>Collection phases</legend>
              <div className="cc-actions">
                {[
                  "pre-market",
                  "pre-trade",
                  "during",
                  "post-execution",
                  "post-session",
                  "anytime",
                ].map((v) => (
                  <label key={v}>
                    <input
                      type="checkbox"
                      name="phase"
                      value={v}
                      defaultChecked={editor.value.phases.includes(
                        v as BodyOf<"variable">["phases"][number],
                      )}
                    />{" "}
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="cc-actions">
              <label>
                <input
                  type="checkbox"
                  name="required"
                  defaultChecked={editor.value.required}
                />{" "}
                Required
              </label>
              <label>
                <input
                  type="checkbox"
                  name="analytics"
                  defaultChecked={editor.value.analytics}
                />{" "}
                Enable comparisons
              </label>
            </div>
            {editor.previous && (
              <p className="cc-muted">
                Changes create a new version. Old numeric values keep their
                original type, unit, range, and choices.
              </p>
            )}
            <div className="cc-actions">
              <Save store={store}>Save definition</Save>
              <button type="button" onClick={() => setEditor(undefined)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Panel>
      {observing && (
        <Panel
          title="Collect a measurement"
          action={
            <button onClick={() => setObserving(undefined)}>Close</button>
          }
        >
          <ObservationForm
            context={context}
            {...observing}
            onSaved={() => setObserving(undefined)}
          />
        </Panel>
      )}
      <Panel
        title="Observation history"
        detail="Corrections create revisions; removed values are excluded from current comparisons."
      >
        {!observations.length && (
          <Empty>No observations recorded for this day.</Empty>
        )}
        {observations.map((o) => {
          const d = store.records.find(
            (r): r is RecordOf<"variable"> =>
              r.kind === "variable" && r.id === o.body.definitionId,
          );
          return (
            d && (
              <div key={o.id} className="cc-list-row">
                <div>
                  <strong>
                    {d.body.name}: {displayValue(o, d)}
                  </strong>
                  <small>
                    {new Date(o.body.observedAt).toLocaleString()} ·{" "}
                    {o.body.phase} · definition v{d.revision}
                    {o.archived ? " · removed" : ""}
                  </small>
                  <History records={store.records} rootId={o.rootId} />
                </div>
                <button
                  onClick={() => setObserving({ definition: d, previous: o })}
                >
                  Correct
                </button>
                <button
                  disabled={store.busy}
                  onClick={() =>
                    void store.save([
                      {
                        ...createRecord("observation", o.body, o),
                        archived: !o.archived,
                      },
                    ])
                  }
                >
                  {o.archived ? "Restore" : "Remove"}
                </button>
              </div>
            )
          );
        })}
      </Panel>
    </div>
  );
}
