"use client";
import {
  activities,
  activityOf,
  cadences,
  type PreparationStep,
} from "@/lib/process/preparation-workflow";
import { latest } from "@/lib/process/model";
import { Field, type Context } from "../command-center/shared";
export default function StepSettings({
  step: s,
  onChange,
  context,
}: {
  step: PreparationStep;
  onChange: (patch: Partial<PreparationStep>) => void;
  context: Context;
}) {
  const activity = activityOf(s),
    cadence = s.cadence ?? "session";
  const definitions = latest(context.store.records, "variable").filter(
    (v) => !v.body.archived,
  );
  return (
    <div className="prep-section-settings">
      <div className="cc-grid">
        <Field label="Section type">
          <select
            value={activity}
            onChange={(e) => {
              const activity = e.target.value as NonNullable<
                PreparationStep["activity"]
              >;
              onChange({
                activity,
                thesisFields:
                  activity === "thesis"
                    ? s.thesisFields?.length
                      ? s.thesisFields
                      : undefined
                    : undefined,
                prompts:
                  activity === "intentions" && !s.prompts?.length
                    ? [
                        {
                          id: crypto.randomUUID(),
                          label: "What does following my process look like?",
                          type: "text",
                          required: true,
                          choices: [],
                        },
                      ]
                    : s.prompts,
                verification:
                  activity === "thesis"
                    ? ["weekly", "monthly"].includes(cadence)
                      ? "weekly-thesis"
                      : "daily-thesis"
                    : activity === "checkin"
                      ? "checkin"
                      : "manual",
                cadence:
                  activity === "thesis" && cadence === "monthly"
                    ? "weekly"
                    : cadence,
              });
            }}
          >
            {Object.entries(activities).filter(([id]) => id !== "thesis" && id !== "missions").map(([id, [title]]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repeat this section">
          <select
            value={cadence}
            onChange={(e) => {
              const cadence = e.target.value as NonNullable<
                PreparationStep["cadence"]
              >;
              onChange({
                cadence,
                verification:
                  activity === "thesis"
                    ? cadence === "weekly"
                      ? "weekly-thesis"
                      : "daily-thesis"
                    : s.verification,
              });
            }}
          >
            {Object.entries(cadences)
              .filter(([id]) => activity !== "thesis" || id !== "monthly")
              .map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Category">
          <input
            required
            maxLength={160}
            value={s.category}
            onChange={(e) => onChange({ category: e.target.value })}
          />
        </Field>
      </div>
      {cadence === "weekdays" && (
        <fieldset>
          <legend>Trading weekdays</legend>
          {s.weekdays?.length === 0 && (
            <p role="alert">Choose at least one weekday.</p>
          )}
          <div className="cc-actions">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, index) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={(s.weekdays ?? [1, 2, 3, 4, 5]).includes(index)}
                    onChange={(e) => {
                      const days = s.weekdays ?? [1, 2, 3, 4, 5];
                      onChange({
                        weekdays: e.target.checked
                          ? [...days, index]
                          : days.filter((d) => d !== index),
                      });
                    }}
                  />
                  {day}
                </label>
              ),
            )}
          </div>
        </fieldset>
      )}
      <p className="cc-muted">
        {cadence === "session"
          ? "A fresh completion for every recording session."
          : cadence === "weekdays"
            ? "Only included on these days. Uses your trading day's timezone."
            : `Completed work stays visible for the current ${cadence === "weekly" ? "Monday–Sunday week" : cadence === "monthly" ? "calendar month" : "trading day"}. It becomes due again next period.`}
      </p>
      {activity === "variables" && (
        <fieldset>
          <legend>Variables in this section</legend>
          <p className="cc-muted">
            Selected variables must be recorded. With all active variables, your
            required definitions are enforced and optional ones can stay blank.
          </p>
          <label>
            <input
              type="checkbox"
              checked={s.variableIds === undefined}
              onChange={(e) =>
                onChange({ variableIds: e.target.checked ? undefined : [] })
              }
            />
            All my active variables
          </label>
          {s.variableIds !== undefined &&
            definitions.map((v) => (
              <label className="prep-variable-option" key={v.rootId}>
                <input
                  type="checkbox"
                  checked={s.variableIds!.includes(v.rootId)}
                  onChange={(e) =>
                    onChange({
                      variableIds: e.target.checked
                        ? [...s.variableIds!, v.rootId]
                        : s.variableIds!.filter((id) => id !== v.rootId),
                    })
                  }
                />
                {v.body.name}
              </label>
            ))}
          {!definitions.length && (
            <p>
              Create variables while working through this section. You can
              choose their types, units, limits and options there.
            </p>
          )}
        </fieldset>
      )}
      {activity === "thesis" && (
        <fieldset>
          <legend>Fields in my thesis</legend>
          {s.thesisFields?.length === 0 && (
            <p role="alert">Choose at least one thesis field.</p>
          )}
          <p className="cc-muted">
            Choose the analysis fields you use. Instrument, direction,
            timeframes and revision notes stay available.
          </p>
          {(
            [
              ["structure", "Market structure"],
              ["events", "Economic events"],
              ["levels", "Key levels"],
              ["liquidity", "Liquidity zones"],
              ["primary", "Primary scenario"],
              ["alternate", "Alternative scenario"],
              ["entries", "Entry conditions"],
              ["invalidation", "Invalidation"],
              ["noTrade", "No-trade conditions"],
              ["targets", "Targets"],
              ["notes", "Notes"],
              ["screenshots", "Chart screenshot URLs"],
            ] as const
          ).map(([key, label]) => (
            <label className="prep-variable-option" key={key}>
              <input
                type="checkbox"
                checked={!s.thesisFields || s.thesisFields.includes(key)}
                onChange={(e) => {
                  const all = [
                    "structure",
                    "events",
                    "levels",
                    "liquidity",
                    "primary",
                    "alternate",
                    "entries",
                    "invalidation",
                    "noTrade",
                    "targets",
                    "notes",
                    "screenshots",
                  ] as const;
                  const fields = s.thesisFields ?? [...all];
                  onChange({
                    thesisFields: e.target.checked
                      ? [...fields, key]
                      : fields.filter((f) => f !== key),
                  });
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <Field label="Your non-negotiables / checklist (one item per line)">
        <textarea
          maxLength={8000}
          rows={4}
          value={(s.checklist ?? []).join("\n")}
          placeholder="The checks you personally need before trading"
          onChange={(e) => onChange({ checklist: e.target.value.split("\n") })}
        />
      </Field>
      <fieldset>
        <legend>Your questions</legend>
        <p className="cc-muted">
          Add questions to any section. Answers are saved with each preparation.
        </p>
        {(s.prompts ?? []).map((p, index) => (
          <div key={p.id} className="prep-question-editor">
            <Field label={`Question ${index + 1}`}>
              <input
                required
                maxLength={160}
                value={p.label}
                onChange={(e) =>
                  onChange({
                    prompts: s.prompts!.map((q) =>
                      q.id === p.id ? { ...q, label: e.target.value } : q,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Answer type">
              <select
                value={p.type === "choice" && JSON.stringify(p.choices) === JSON.stringify(["Yes", "No", "Custom"]) ? "yes-no-custom" : p.type}
                onChange={(e) =>
                  onChange({
                    prompts: s.prompts!.map((q) =>
                      q.id === p.id
                        ? e.target.value === "yes-no-custom"
                          ? { ...q, type: "choice", choices: ["Yes", "No", "Custom"] }
                          : { ...q, type: e.target.value as typeof p.type }
                        : q,
                    ),
                  })
                }
              >
                <option value="text">Written answer</option>
                <option value="number">Number</option>
                <option value="boolean">Yes / no</option>
                <option value="yes-no-custom">Yes / no / custom</option>
                <option value="choice">Choose an option</option>
              </select>
            </Field>
            {p.type === "choice" && (
              <Field label="Answer choices (one per line)">
                <textarea
                  required
                  value={p.choices.join("\n")}
                  maxLength={4000}
                  onChange={(e) =>
                    onChange({
                      prompts: s.prompts!.map((q) =>
                        q.id === p.id
                          ? { ...q, choices: e.target.value.split("\n") }
                          : q,
                      ),
                    })
                  }
                />
              </Field>
            )}
            <label>
              <input
                type="checkbox"
                checked={p.required}
                onChange={(e) =>
                  onChange({
                    prompts: s.prompts!.map((q) =>
                      q.id === p.id ? { ...q, required: e.target.checked } : q,
                    ),
                  })
                }
              />
              Answer required
            </label>
            <button
              type="button"
              disabled={(s.prompts?.length ?? 0) >= 30}
              onClick={() => onChange({
                prompts: [
                  ...s.prompts!.slice(0, index + 1),
                  { id: crypto.randomUUID(), label: `More about “${p.label.slice(0, 110)}” (optional)`, type: "text", required: false, choices: [] },
                  ...s.prompts!.slice(index + 1),
                ],
              })}
            >
              Add optional elaboration
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({ prompts: s.prompts!.filter((q) => q.id !== p.id) })
              }
            >
              Remove question
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={(s.prompts?.length ?? 0) >= 30}
          onClick={() =>
            onChange({
              prompts: [
                ...(s.prompts ?? []),
                {
                  id: crypto.randomUUID(),
                  label: "My question",
                  type: "text",
                  required: true,
                  choices: [],
                },
              ],
            })
          }
        >
          + Add a question
        </button>
      </fieldset>
    </div>
  );
}
