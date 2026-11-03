"use client";
import { useEffect, useRef, useState } from "react";
import {
  createRecord,
  latest,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import {
  activities,
  activityOf,
  answerError,
  activityEvidenceError,
  cadences,
  preparationResponse,
  scheduledOn,
} from "@/lib/process/preparation-workflow";
import { verificationEvidence } from "@/lib/process/engine";
import StepSettings from "./step-settings";
import StepActivity from "./step-activity";
import JournalSetup from "./journal-setup";
import FocusedRun from "./focused-run";
import { Panel, Field, type Context } from "../command-center/shared";

type Step = BodyOf<"protocol">["steps"][number];
const suggestions = [
  [
    "Arrive & check in",
    "Pause and record your focus, energy and stress.",
    "checkin",
    "checkin",
    "session",
  ],
  [
    "Review the bigger picture",
    "Create your weekly market outlook and the conditions that matter.",
    "weekly-thesis",
    "thesis",
    "weekly",
  ],
  [
    "Build today's trading plan",
    "Define scenarios, key levels, entries and invalidation.",
    "daily-thesis",
    "thesis",
    "daily",
  ],
  [
    "Set your risk boundaries",
    "Define and check your personal non-negotiables before trading.",
    "manual",
    "checklist",
    "session",
  ],
  [
    "Review your process goal",
    "Create and review the missions you want to work on.",
    "manual",
    "missions",
    "daily",
  ],
  [
    "Record my personal variables",
    "Create and record the conditions that matter to your process.",
    "manual",
    "variables",
    "daily",
  ],
  [
    "Set my intentions",
    "Decide how you want to show up for this session.",
    "manual",
    "intentions",
    "daily",
  ],
] as const;
function makeStep(
  name = "My custom section",
  description = "",
  verification: Step["verification"] = "manual",
  activity: Step["activity"] = "custom",
  cadence: Step["cadence"] = "session",
): Step {
  return {
    id: crypto.randomUUID(),
    name,
    description,
    category: "Preparation",
    requirement: "required",
    verification,
    condition: "",
    window: "Before the first trade",
    order: 0,
    activity,
    cadence,
    checklist:
      activity === "checklist"
        ? [
            "Review my risk limits",
            "Confirm my entry criteria",
            "Check my no-trade conditions",
          ]
        : [],
    prompts:
      activity === "intentions"
        ? [
            {
              id: crypto.randomUUID(),
              label: "What does following my process look like?",
              type: "text",
              required: true,
              choices: [],
            },
          ]
        : [],
  };
}
function AdvancedSetup({
  context,
  template,
  onClose,
}: {
  context: Context;
  template?: RecordOf<"protocol">;
  onClose: (savedId?: string) => void;
}) {
  const { store } = context;
  const [stage, setStage] = useState(0);
  const [name, setName] = useState(
    template?.body.name ?? "My pre-trading routine",
  );
  const [profile, setProfile] = useState({
    instrument: template?.body.instrument ?? "",
    strategy: template?.body.strategy ?? "",
    session: template?.body.session ?? "",
  });
  const [steps, setSteps] = useState<Step[]>(
    () =>
      template?.body.steps.map((s) => {
        const preset = suggestions.find(([name]) => name === s.name);
        const defaults = preset
          ? makeStep(...preset)
          : makeStep(s.name, s.description, s.verification, activityOf(s));
        return {
          ...defaults,
          ...s,
          activity: s.activity ?? defaults.activity,
          cadence: s.cadence ?? defaults.cadence,
          checklist: s.checklist ?? defaults.checklist,
          prompts: s.prompts ?? defaults.prompts,
        };
      }) ??
      suggestions.map(([n, d, v, a, c], order) => ({
        ...makeStep(n, d, v, a, c),
        order,
      })),
  );
  const [expanded, setExpanded] = useState<string | undefined>(steps[0]?.id);
  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every(
      (s) =>
        s.name.trim() &&
        s.category.trim() &&
        (s.cadence !== "weekdays" ||
          (s.weekdays ?? [1, 2, 3, 4, 5]).length > 0) &&
        (s.thesisFields === undefined || s.thesisFields.length > 0) &&
        (s.prompts ?? []).every(
          (p) =>
            p.label.trim() &&
            (p.type !== "choice" || p.choices.some((c) => c.trim())),
        ),
    );
  const update = (id: string, patch: Partial<Step>) =>
    setSteps((rows) => rows.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  function move(index: number, offset: number) {
    setSteps((rows) => {
      const copy = [...rows];
      [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]];
      return copy;
    });
  }
  return (
    <Panel
      title={
        template ? "Make your routine yours" : "Build your pre-trading routine"
      }
      detail="A little setup now. A clear path every session."
    >
      <ol className="prep-stages" aria-label="Setup progress">
        {["Choose your steps", "Make it yours", "Review & save"].map(
          (label, i) => (
            <li key={label} aria-current={stage === i ? "step" : undefined}>
              <span>{i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (stage < 2) {
            setStage(stage + 1);
            return;
          }
          if (!valid) return;
          const body = {
            ...(template?.body ?? {
              description: "",
              instrument: "",
              strategy: "",
              session: "",
            }),
            ...profile,
            name: name.trim(),
            steps: steps.map((s, order) => ({
              ...s,
              order,
              weekdays: s.weekdays?.length ? s.weekdays : undefined,
              checklist: s.checklist?.map((v) => v.trim()).filter(Boolean),
              prompts: s.prompts?.map((p) => ({
                ...p,
                choices: p.choices.map((c) => c.trim()).filter(Boolean),
              })),
            })),
          };
          const record = createRecord("protocol", body, template);
          if (await store.save([record])) onClose(record.rootId);
        }}
      >
        {stage === 0 && (
          <>
            <h3>What helps you feel prepared?</h3>
            <button
              type="button"
              onClick={() => {
                setSteps([]);
                setStage(1);
              }}
            >
              Start with a blank routine
            </button>
            <p className="cc-muted">
              Start with these steps. Remove anything you do not need, or add
              your own.
            </p>
            <div className="prep-choices">
              {suggestions.map(([n, d, v, a, c]) => {
                const selected = steps.some((s) => s.name === n);
                return (
                  <button
                    type="button"
                    key={n}
                    aria-pressed={selected}
                    onClick={() =>
                      setSteps((rows) =>
                        selected
                          ? rows.filter((s) => s.name !== n)
                          : [...rows, makeStep(n, d, v, a, c)],
                      )
                    }
                  >
                    <span>{selected ? "✓" : "+"}</span>
                    <strong>{n}</strong>
                    <small>{d}</small>
                  </button>
                );
              })}
            </div>
            <p>
              {steps.length} sections in your routine. Each section has its own
              schedule and completion rules.
            </p>
          </>
        )}
        {stage === 1 && (
          <div className="cc-stack">
            <Field label="Routine name">
              <input
                value={name}
                maxLength={160}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="cc-grid">
              {(["instrument", "strategy", "session"] as const).map((key) => (
                <Field key={key} label={key + " (optional)"}>
                  <input
                    maxLength={
                      key === "instrument" ? 40 : key === "session" ? 80 : 160
                    }
                    value={profile[key]}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, [key]: e.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="cc-muted">
              Arrange your steps in the order you want to follow them.
            </p>
            {steps.map((s, i) => (
              <fieldset className="prep-edit-step" key={s.id}>
                <legend>
                  Section {i + 1} · {s.name} ·{" "}
                  {cadences[s.cadence ?? "session"]}
                </legend>
                <button
                  type="button"
                  aria-expanded={expanded === s.id}
                  onClick={() =>
                    setExpanded(expanded === s.id ? undefined : s.id)
                  }
                >
                  {expanded === s.id ? "Close section" : "Customize section"}
                </button>
                {expanded === s.id && (
                  <>
                    <Field label="Step name">
                      <input
                        required
                        maxLength={160}
                        value={s.name}
                        onChange={(e) => update(s.id, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Instructions for yourself">
                      <textarea
                        maxLength={8000}
                        value={s.description}
                        onChange={(e) =>
                          update(s.id, { description: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Completion">
                      <select
                        value={s.requirement}
                        onChange={(e) =>
                          update(s.id, {
                            requirement: e.target.value as Step["requirement"],
                          })
                        }
                      >
                        <option value="required">Required</option>
                        <option value="optional">Optional</option>
                        <option value="conditional">
                          Only when applicable
                        </option>
                      </select>
                    </Field>
                    {s.requirement === "conditional" && (
                      <Field label="When does this apply?">
                        <input
                          value={s.condition}
                          maxLength={8000}
                          onChange={(e) =>
                            update(s.id, { condition: e.target.value })
                          }
                        />
                      </Field>
                    )}
                    <StepSettings
                      step={s}
                      context={context}
                      onChange={(patch) => update(s.id, patch)}
                    />
                    <div className="cc-actions">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        aria-label={`Move ${s.name} up`}
                      >
                        ↑ Move up
                      </button>
                      <button
                        type="button"
                        disabled={i === steps.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${s.name} down`}
                      >
                        ↓ Move down
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSteps((rows) => rows.filter((r) => r.id !== s.id))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </fieldset>
            ))}
          </div>
        )}
        {stage < 2 && (
          <button
            className="prep-add"
            type="button"
            disabled={steps.length >= 100}
            onClick={() => {
              const section = makeStep();
              setSteps((rows) => [...rows, section]);
              setExpanded(section.id);
              setStage(1);
            }}
          >
            + Add a custom step
          </button>
        )}
        {stage === 2 && (
          <>
            <h3>{name}</h3>
            <p className="cc-muted">
              Saved for future sessions. Each day gets a fresh checklist; your
              previous preparation stays intact. Weekly and monthly sections
              reuse their saved completion for that calendar period.
            </p>
            <ol className="prep-review">
              {steps.map((s) => (
                <li key={s.id}>
                  <strong>{s.name}</strong>
                  <small>{s.description || s.requirement}</small>
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="prep-footer">
          <button
            type="button"
            disabled={store.busy}
            onClick={
              stage
                ? () => setStage(stage - 1)
                : template
                  ? () => onClose()
                  : () => context.props.onPage("Command Center")
            }
          >
            {stage ? "Back" : "Cancel"}
          </button>
          <button
            className="cc-primary"
            type="submit"
            disabled={store.busy || !steps.length || (stage > 0 && !valid)}
          >
            {store.busy
              ? "Saving…"
              : stage === 2
                ? "Save my routine"
                : "Continue →"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
export default function GuidedPreparation(context: Context & { editRequest?: number }) {
  const { store, day } = context;
  const templates = latest(store.records, "protocol").sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  const runs = latest(store.records, "run").filter(
    (r) =>
      r.body.dayId === day.rootId &&
      (!r.body.sessionId || r.body.sessionId === context.props.session?.id),
  );
  const [advancedSetup, setAdvancedSetup] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (context.editRequest) { setCreating(false); setEditing(true); }
  }, [context.editRequest]);
  const previousRun = latest(store.records, "run").sort(
    (a, b) => b.createdAt - a.createdAt,
  )[0];
  const previousTemplate = store.records.find(
    (r) => r.id === previousRun?.body.templateId,
  );
  const template =
    templates.find((t) => t.rootId === selected) ??
    templates.find((t) => t.rootId === previousTemplate?.rootId) ??
    templates[0];
  if ((editing || !templates.length) && !advancedSetup)
    return <JournalSetup context={context} template={creating ? undefined : template} onAdvanced={() => setAdvancedSetup(true)} onClose={(id) => { if (id) setSelected(id); setEditing(false); setCreating(false); if (!id) context.props.onPage("Command Center"); }} />;
  if (editing || !templates.length)
    return (
      <AdvancedSetup
        key={creating ? "new" : (template?.id ?? "new")}
        context={context}
        template={creating ? undefined : template}
        onClose={(savedId) => {
          if (savedId) setSelected(savedId);
          setEditing(false);
          setAdvancedSetup(false);
          setCreating(false);
        }}
      />
    );
  return (
    <div className="cc-stack">
      <Panel
        title="Prepare with intention"
        detail="Your routine. One clear step at a time."
        action={
          <div className="cc-actions">
            <button
              disabled={store.busy}
              onClick={() => {
                setCreating(false);
                setEditing(true);
              }}
            >
              Edit my routine
            </button>
            <button
              disabled={store.busy}
              onClick={() => {
                setCreating(true);
                setEditing(true);
              }}
            >
              + New routine
            </button>
          </div>
        }
      >
        {!runs.length ? (
          <>
            <p>
              Follow your saved routine before you begin trading. We will guide
              you through each step.
            </p>
            <Field label="Your saved routine">
              <select
                value={template.rootId}
                onChange={(e) => setSelected(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.rootId}>
                    {t.body.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="cc-muted">
              {[
                template.body.instrument,
                template.body.strategy,
                template.body.session,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <ol className="prep-preview">
              {template.body.steps.map((s) => (
                <li key={s.id}>
                  {s.name}
                  <small>{cadences[s.cadence ?? "session"]}</small>
                </li>
              ))}
            </ol>
            <button
              className="cc-primary"
              disabled={store.busy}
              onClick={() =>
                void store.save([
                  createRecord("run", {
                    dayId: day.rootId,
                    templateId: template.id,
                    sessionId: context.props.session?.id,
                    steps: template.body.steps,
                    startedAt: Date.now(),
                  }),
                ])
              }
            >
              {store.busy ? "Starting…" : "Begin today's routine →"}
            </button>
          </>
        ) : (
          <p className="cc-muted">
            Your session uses the routine you started with. Edits are saved for
            your next session.
          </p>
        )}
      </Panel>
      {runs.map((run) => (
        <FocusedRun key={run.id} context={context} run={run} />
      ))}
    </div>
  );
}
