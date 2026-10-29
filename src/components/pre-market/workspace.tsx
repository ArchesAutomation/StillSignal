"use client";
import { useState } from "react";
import TemplateTools from "../command-center/template-tools";
import {
  createRecord,
  latest,
  responseStatus,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import { preparation, verificationEvidence } from "@/lib/process/engine";
import {
  Panel,
  Field,
  Input,
  Area,
  Save,
  Empty,
  History,
  string,
  type Context,
} from "../command-center/shared";
const step = (): BodyOf<"protocol">["steps"][number] => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  category: "Preparation",
  requirement: "required",
  condition: "",
  verification: "manual",
  window: "Before the first trade",
  order: 0,
});
export function PreparationPanel({
  store,
  day,
  props,
  compact = false,
}: Context & { compact?: boolean }) {
  const templates = latest(store.records, "protocol"),
    runs = latest(store.records, "run").filter(
      (r) => r.body.dayId === day.rootId,
    ),
    p = preparation(store.records, day.rootId);
  async function verify() {
    const batch = runs.flatMap((run) =>
      run.body.steps.flatMap((s) => {
        const evidence = verificationEvidence(
          store.records,
          run,
          s.id,
          Date.now(),
        );
        const previous = latest(store.records, "response").find(
          (r) => r.body.runId === run.id && r.body.stepId === s.id,
        );
        if (!evidence || previous?.body.status === "complete") return [];
        return [
          createRecord(
            "response",
            {
              runId: run.id,
              stepId: s.id,
              status: "complete",
              method: "verified",
              reason: "Verified against an existing supporting record.",
              evidenceId: evidence.id,
              completedAt: Date.now(),
            },
            previous,
            [{ kind: evidence.kind, id: evidence.id }],
          ),
        ];
      }),
    );
    if (batch.length) await store.save(batch);
    else
      store.setError(
        "No new supporting records are available for automatic completion.",
      );
  }
  return (
    <Panel
      title="Pre-market non-negotiables"
      detail={
        p.total
          ? `${p.complete}/${p.total} required · ${p.unknown} unverified · ${p.excluded} not applicable`
          : "Your preparation, defined by you"
      }
      action={
        <button onClick={() => props.onPage("Pre-Market")}>Manage</button>
      }
    >
      {!runs.length && (
        <form
          className="cc-inline"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              template = templates.find((t) => t.id === string(f, "template"));
            if (template)
              await store.save([
                createRecord("run", {
                  dayId: day.rootId,
                  templateId: template.id,
                  steps: template.body.steps,
                  startedAt: Date.now(),
                }),
              ]);
          }}
        >
          <Field label="Preparation protocol">
            <select name="template" required>
              <option value="">Choose a protocol</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.body.name} · v{t.revision}
                </option>
              ))}
            </select>
          </Field>
          <Save store={store}>Begin preparation</Save>
        </form>
      )}
      {!templates.length && (
        <Empty>Create your preparation protocol to begin.</Empty>
      )}
      {runs.map((run) => (
        <div key={run.id}>
          <h3>
            {store.records.find(
              (r) => r.id === run.body.templateId && r.kind === "protocol",
            )?.kind === "protocol"
              ? "Preparation run"
              : "Protocol"}{" "}
            · {new Date(run.body.startedAt).toLocaleTimeString()}
          </h3>
          {run.body.steps.map((s) => {
            const response = latest(store.records, "response")
              .filter((r) => r.body.runId === run.id && r.body.stepId === s.id)
              .sort((a, b) => b.createdAt - a.createdAt)[0];
            if (compact)
              return (
                <div className="cc-compact-step" key={s.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={response?.body.status === "complete"}
                      disabled={store.busy}
                      onChange={(e) =>
                        void store.save([
                          createRecord(
                            "response",
                            {
                              runId: run.id,
                              stepId: s.id,
                              status: e.target.checked
                                ? "complete"
                                : "incomplete",
                              method: "manual",
                              reason: "Confirmed in Command Center",
                              completedAt: e.target.checked
                                ? Date.now()
                                : undefined,
                            },
                            response,
                          ),
                        ])
                      }
                    />
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {response?.body.status ?? "incomplete"}
                        {response?.body.completedAt
                          ? " · " +
                            new Date(
                              response.body.completedAt,
                            ).toLocaleTimeString()
                          : ""}
                        {response?.body.method === "verified"
                          ? " · evidence verified"
                          : ""}
                      </small>
                    </span>
                  </label>
                  <small>{s.requirement}</small>
                </div>
              );
            return (
              <form
                key={s.id + (response?.id ?? "")}
                className="cc-check-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    status = responseStatus.parse(string(f, "status"));
                  await store.save([
                    createRecord(
                      "response",
                      {
                        runId: run.id,
                        stepId: s.id,
                        status,
                        method: "manual",
                        reason: string(f, "reason"),
                        completedAt:
                          status === "complete" ? Date.now() : undefined,
                      },
                      response,
                    ),
                  ]);
                }}
              >
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.requirement} · {s.category}
                    {s.condition ? " · " + s.condition : ""}
                  </small>
                  {s.description && <p>{s.description}</p>}
                  <small>
                    {s.window}
                    {response?.body.completedAt
                      ? " · completed " +
                        new Date(response.body.completedAt).toLocaleTimeString()
                      : ""}
                    {response?.body.method === "verified"
                      ? " · evidence verified"
                      : ""}
                  </small>
                </div>
                <Field label={s.name + " status"}>
                  <select
                    name="status"
                    defaultValue={response?.body.status ?? "incomplete"}
                  >
                    {responseStatus.options.map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("-", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Input
                  label="Reason / evidence note"
                  name="reason"
                  value={response?.body.reason}
                />
                <Save store={store}>Record</Save>
              </form>
            );
          })}
        </div>
      ))}
      {!!runs.length && (
        <button onClick={() => void verify()} disabled={store.busy}>
          Verify saved thesis & check-ins
        </button>
      )}
      {p.startedAt && (
        <p className="cc-muted">
          Started {new Date(p.startedAt).toLocaleTimeString()}
          {p.finishedAt
            ? " · finished " + new Date(p.finishedAt).toLocaleTimeString()
            : " · in progress"}
          . Historical runs retain their original requirements.
        </p>
      )}
    </Panel>
  );
}
export default function PreMarket(context: Context) {
  const { store } = context,
    templates = latest(store.records, "protocol", Infinity, true);
  const [editing, setEditing] = useState<RecordOf<"protocol"> | undefined>(),
    [steps, setSteps] = useState([step()]),
    [show, setShow] = useState(false);
  return (
    <div className="cc-stack">
      <PreparationPanel {...context} />
      <Panel
        title="Protocol builder"
        detail="Reusable versions; changes apply to future runs."
        action={
          <button
            onClick={() => {
              setEditing(undefined);
              setSteps([step()]);
              setShow(true);
            }}
          >
            New protocol
          </button>
        }
      >
        <TemplateTools kind="protocol" store={store} />
        {templates.map((t) => (
          <div key={t.id} className="cc-list-row">
            <div>
              <strong>{t.body.name}</strong>
              <small>
                v{t.revision} · {t.body.steps.length} requirements
                {t.archived ? " · archived" : ""}
              </small>
              <History records={store.records} rootId={t.rootId} />
            </div>
            <button
              onClick={() => {
                setEditing(t);
                setSteps(t.body.steps);
                setShow(true);
              }}
            >
              Edit next version
            </button>
            <button
              disabled={store.busy}
              onClick={() =>
                void store.save([
                  {
                    ...createRecord("protocol", t.body, t),
                    archived: !t.archived,
                  },
                ])
              }
            >
              {t.archived ? "Restore" : "Archive"}
            </button>
          </div>
        ))}
        {show && (
          <form
            key={editing?.id ?? "new"}
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await store.save([
                  createRecord(
                    "protocol",
                    {
                      name: string(f, "name"),
                      description: string(f, "description"),
                      instrument: string(f, "instrument"),
                      strategy: string(f, "strategy"),
                      session: string(f, "session"),
                      steps: steps.map((s, i) => ({ ...s, order: i })),
                    },
                    editing,
                  ),
                ])
              )
                setShow(false);
            }}
          >
            <div className="cc-grid">
              <Input
                name="name"
                label="Protocol name"
                required
                value={editing?.body.name}
              />
              <Input
                name="instrument"
                label="Instrument (optional)"
                value={editing?.body.instrument}
              />
              <Input
                name="strategy"
                label="Associated strategy"
                value={editing?.body.strategy}
              />
              <Input
                name="session"
                label="Trading session"
                value={editing?.body.session}
              />
            </div>
            <Area
              name="description"
              label="Description"
              value={editing?.body.description}
            />
            {steps.map((s, i) => {
              const update = (patch: Partial<typeof s>) =>
                setSteps((rows) =>
                  rows.map((row, index) =>
                    index === i ? { ...row, ...patch } : row,
                  ),
                );
              return (
                <fieldset key={s.id}>
                  <legend>Requirement {i + 1}</legend>
                  <div className="cc-grid">
                    <Field label="Name">
                      <input
                        required
                        value={s.name}
                        onChange={(e) => update({ name: e.target.value })}
                      />
                    </Field>
                    <Field label="Category">
                      <input
                        required
                        value={s.category}
                        onChange={(e) => update({ category: e.target.value })}
                      />
                    </Field>
                    <Field label="Requirement">
                      <select
                        value={s.requirement}
                        onChange={(e) =>
                          update({
                            requirement: e.target.value as typeof s.requirement,
                          })
                        }
                      >
                        {["required", "optional", "conditional"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Verification">
                      <select
                        value={s.verification}
                        onChange={(e) =>
                          update({
                            verification: e.target
                              .value as typeof s.verification,
                          })
                        }
                      >
                        {[
                          "manual",
                          "daily-thesis",
                          "weekly-thesis",
                          "checkin",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Description">
                      <textarea
                        value={s.description}
                        onChange={(e) =>
                          update({ description: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Condition / applicability">
                      <input
                        value={s.condition}
                        onChange={(e) => update({ condition: e.target.value })}
                      />
                    </Field>
                    <Field label="Expected window">
                      <input
                        value={s.window}
                        onChange={(e) => update({ window: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="cc-actions">
                    <button
                      type="button"
                      disabled={!i}
                      onClick={() =>
                        setSteps((rows) => {
                          const copy = [...rows];
                          [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                          return copy;
                        })
                      }
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      disabled={steps.length < 2}
                      onClick={() =>
                        setSteps((rows) => rows.filter((_, n) => n !== i))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </fieldset>
              );
            })}
            <div className="cc-actions">
              <button
                type="button"
                onClick={() => setSteps((rows) => [...rows, step()])}
              >
                Add requirement
              </button>
              <Save store={store}>
                {editing ? "Save new version" : "Create protocol"}
              </Save>
              <button type="button" onClick={() => setShow(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
