"use client";
import type { Condition } from "@/lib/process/conditions";
import type { RecordOf } from "@/lib/process/model";
import { Field } from "../command-center/shared";
export default function ConditionEditor({
  value,
  onChange,
  variables,
}: {
  value?: Condition;
  onChange: (value: Condition | undefined) => void;
  variables: RecordOf<"variable">[];
}) {
  return (
    <div className="cc-grid">
      <Field label="Require this step when">
        <select
          value={value?.type ?? "manual"}
          onChange={(e) =>
            onChange(
              e.target.value === "instrument"
                ? { type: "instrument", value: "ES" }
                : e.target.value === "daily-thesis-missing"
                  ? { type: "daily-thesis-missing" }
                  : e.target.value === "variable-above" && variables[0]
                    ? {
                        type: "variable-above",
                        definitionId: variables[0].id,
                        threshold: 0,
                      }
                    : undefined,
            )
          }
        >
          <option value="manual">Manual applicability review</option>
          <option value="instrument">Instrument matches</option>
          <option value="daily-thesis-missing">Daily thesis is missing</option>
          <option value="variable-above" disabled={!variables.length}>
            Recorded variable exceeds threshold
          </option>
        </select>
      </Field>
      {value?.type === "instrument" && (
        <Field label="Instrument">
          <input
            required
            maxLength={40}
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
        </Field>
      )}
      {value?.type === "variable-above" && (
        <>
          <Field label="Variable definition version">
            <select
              value={value.definitionId}
              onChange={(e) =>
                onChange({ ...value, definitionId: e.target.value })
              }
            >
              {variables.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.body.name} · v{v.revision} {v.body.unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Above">
            <input
              type="number"
              step="any"
              required
              value={value.threshold}
              onChange={(e) =>
                onChange({ ...value, threshold: e.target.valueAsNumber })
              }
            />
          </Field>
        </>
      )}
      <small>
        Missing evidence leaves applicability unknown. Conditions never execute
        code.
      </small>
    </div>
  );
}
