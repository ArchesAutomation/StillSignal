"use client";
import { useEffect, useRef, useState } from "react";
import {
  createRecord,
  latest,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import { Panel, Field, type Context } from "../command-center/shared";

type Step = BodyOf<"protocol">["steps"][number];
const suggestions = [
  [
    "Arrive & check in",
    "Pause and record your focus, energy and stress.",
    "checkin",
  ],
  [
    "Review the bigger picture",
    "Review your weekly outlook and the conditions that matter today.",
    "weekly-thesis",
  ],
  [
    "Build today's trading plan",
    "Define your scenarios, key levels, entries and invalidation.",
    "daily-thesis",
  ],
  [
    "Set your risk boundaries",
    "Confirm your position size, loss limit and when you will stop trading.",
    "manual",
  ],
  [
    "Review your process goal",
    "Choose the habit you want to practice this session.",
    "manual",
  ],
] as const;
function makeStep(
  name = "My custom step",
  description = "",
  verification: Step["verification"] = "manual",
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
  };
}
function Setup({
  context,
  template,
  onClose,
}: {
  context: Context;
  template?: RecordOf<"protocol">;
  onClose: () => void;
}) {
  const { store } = context;
  const [stage, setStage] = useState(0);
  const [name, setName] = useState(
    template?.body.name ?? "My pre-trading routine",
  );
  const [steps, setSteps] = useState<Step[]>(
    () =>
      template?.body.steps.map((s) => ({ ...s })) ??
      suggestions.map(([n, d, v], order) => ({ ...makeStep(n, d, v), order })),
  );
  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((s) => s.name.trim() && s.category.trim());
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
            name: name.trim(),
            steps: steps.map((s, order) => ({ ...s, order })),
          };
          if (await store.save([createRecord("protocol", body, template)]))
            onClose();
        }}
      >
        {stage === 0 && (
          <>
            <h3>What helps you feel prepared?</h3>
            <p className="cc-muted">
              Start with these steps. Remove anything you do not need, or add
              your own.
            </p>
            <div className="prep-choices">
              {suggestions.map(([n, d, v]) => {
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
                          : [...rows, makeStep(n, d, v)],
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
            <p>{steps.length} steps in your routine</p>
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
            <p className="cc-muted">
              Arrange your steps in the order you want to follow them.
            </p>
            {steps.map((s, i) => (
              <fieldset className="prep-edit-step" key={s.id}>
                <legend>Step {i + 1}</legend>
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
                    <option value="conditional">Only when applicable</option>
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
              setSteps((rows) => [...rows, makeStep()]);
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
              previous preparation stays intact.
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
                  ? onClose
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
function Run({ context, run }: { context: Context; run: RecordOf<"run"> }) {
  const { store, props } = context;
  const responses = latest(store.records, "response");
  const responseFor = (id: string) =>
    responses
      .filter((r) => r.body.runId === run.id && r.body.stepId === id)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  const resolved = (s: Step) => {
    const status = responseFor(s.id)?.body.status;
    return (
      status === "complete" ||
      status === "not-applicable" ||
      (s.requirement === "optional" && status === "skipped")
    );
  };
  const remaining = run.body.steps.filter((s) => !resolved(s));
  const [selected, setSelected] = useState<string | null>(null);
  const current = run.body.steps.find((s) => s.id === selected) ?? remaining[0];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [current?.id]);
  const completed = run.body.steps.length - remaining.length;
  const response = current ? responseFor(current.id) : undefined;
  const page =
    current?.verification === "checkin"
      ? "Command Center"
      : current?.verification.includes("thesis")
        ? "Trading Thesis"
        : undefined;
  return (
    <Panel
      title="Your pre-trading walkthrough"
      detail={`${completed} of ${run.body.steps.length} steps resolved · progress saved as you go`}
    >
      <progress
        className="prep-progress"
        value={completed}
        max={run.body.steps.length}
        aria-label="Routine progress"
      />
      <div className="prep-run">
        <nav aria-label="Routine steps">
          <ol>
            {run.body.steps.map((s, i) => (
              <li key={s.id}>
                <button
                  aria-current={current?.id === s.id ? "step" : undefined}
                  onClick={() => setSelected(s.id)}
                >
                  <span>{resolved(s) ? "✓" : i + 1}</span>
                  <span>
                    {s.name}
                    <small>
                      {responseFor(s.id)?.body.status.replaceAll("-", " ") ??
                        s.requirement}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {current ? (
          <form
            key={current.id + (response?.id ?? "")}
            className="prep-focus"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(
                e.currentTarget,
                (e.nativeEvent as SubmitEvent).submitter,
              );
              const status =
                data.get("action") === "skip"
                  ? "skipped"
                  : data.get("action") === "na"
                    ? "not-applicable"
                    : "complete";
              if (
                status !== "complete" &&
                !String(data.get("note") ?? "").trim()
              ) {
                store.setError(
                  "Add a note explaining why this step is skipped or does not apply.",
                );
                return;
              }
              if (
                await store.save([
                  createRecord(
                    "response",
                    {
                      runId: run.id,
                      stepId: current.id,
                      status,
                      method: "manual",
                      reason: String(data.get("note") ?? ""),
                      completedAt:
                        status === "complete" ? Date.now() : undefined,
                    },
                    response,
                  ),
                ])
              )
                setSelected(null);
            }}
          >
            <span className="cc-eyebrow">
              Step {run.body.steps.indexOf(current) + 1} · {current.requirement}
            </span>
            <h3 ref={heading} tabIndex={-1}>
              {current.name}
            </h3>
            <p>
              {current.description ||
                "Take a moment to complete this step before moving on."}
            </p>
            {current.condition && (
              <p className="cc-muted">Applies when: {current.condition}</p>
            )}
            {page && (
              <button type="button" onClick={() => props.onPage(page)}>
                Open {page === "Trading Thesis" ? "trading thesis" : "check-in"}{" "}
                ↗
              </button>
            )}
            <Field label="Notes (required when skipping or excluding a step)">
              <textarea
                name="note"
                maxLength={8000}
                defaultValue={response?.body.reason ?? ""}
                placeholder="Anything you want to carry into this session…"
              />
            </Field>
            <div className="cc-actions">
              <button
                type="submit"
                name="action"
                value="complete"
                className="cc-primary"
                disabled={store.busy}
              >
                Complete & continue →
              </button>
              {current.requirement === "optional" && (
                <button
                  type="submit"
                  name="action"
                  value="skip"
                  disabled={store.busy}
                >
                  Skip this step
                </button>
              )}
              {current.requirement === "conditional" && (
                <button
                  type="submit"
                  name="action"
                  value="na"
                  disabled={store.busy}
                >
                  Does not apply today
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="prep-focus" role="status">
            <span className="cc-eyebrow">Preparation complete</span>
            <h3>Your routine is checked off.</h3>
            <p>
              Your preparation is saved. You can revisit any step or continue to
              your session.
            </p>
            <button
              className="cc-primary"
              onClick={() => props.onPage("Live Session")}
            >
              Continue to live session →
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
export default function GuidedPreparation(context: Context) {
  const { store, day } = context;
  const templates = latest(store.records, "protocol").sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  const runs = latest(store.records, "run").filter(
    (r) =>
      r.body.dayId === day.rootId &&
      (!r.body.sessionId || r.body.sessionId === context.props.session?.id),
  );
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
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
  if (editing || !templates.length)
    return (
      <Setup
        key={template?.id ?? "new"}
        context={context}
        template={template}
        onClose={() => setEditing(false)}
      />
    );
  return (
    <div className="cc-stack">
      <Panel
        title="Prepare with intention"
        detail="Your routine. One clear step at a time."
        action={
          <button disabled={store.busy} onClick={() => setEditing(true)}>
            Edit my routine
          </button>
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
            <ol className="prep-preview">
              {template.body.steps.map((s) => (
                <li key={s.id}>{s.name}</li>
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
        <Run key={run.id} context={context} run={run} />
      ))}
    </div>
  );
}
