"use client";
import { useState } from "react";
import PersistentForm, { clearFormDraft } from "../persistent-form";
import {
  createRecord,
  latest,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import { goalProgress } from "@/lib/process/reviews";
import {
  Area,
  Badge,
  Empty,
  Field,
  History,
  Input,
  Panel,
  Save,
  number,
  string,
  type Context,
} from "../command-center/shared";
const evidenceLabels = {
  preparation: "Days with all preparation requirements completed",
  checkin: "Days with a saved personal check-in",
  audit: "Saved audits fully inside this mission's dates",
  "rule-adherence": "Rule checks explicitly marked followed",
  observation: "Recorded personal-variable observations",
  manual: "Your saved manual confirmations",
} as const;
export function MissionsPanel({ store, day, props, onManage }: Context & { onManage?: () => void }) {
  const goals = latest(store.records, "goal").filter(g => g.body.start <= day.body.date && g.body.end >= day.body.date);
  return (
    <Panel
      title="Active missions"
      detail="Measure process improvements independently of P&L"
      action={<button onClick={() => onManage ? onManage() : props.onPage("Missions")}>{onManage ? "Create mission" : "Manage"}</button>}
    >
      {!goals.length && <Empty>No missions apply to this trading day. You can continue without creating one.</Empty>}
      {goals.map((goal) => {
        const progress = goalProgress(goal, store.records);
        return (
          <article key={goal.id} className="cc-mission">
            <div className="cc-actions">
              <strong>{goal.body.name}</strong>
              <Badge>{progress.complete ? "Complete" : "In progress"}</Badge>
            </div>
            <progress
              aria-label={goal.body.name + " progress"}
              value={progress.value}
              max={progress.target}
            />
            <small>
              {progress.value} / {progress.target} · {evidenceLabels[goal.body.source]} ·{" "}
              {goal.body.start} → {goal.body.end}
            </small>
          </article>
        );
      })}
    </Panel>
  );
}
export default function Missions(context: Context) {
  const { store, day } = context,
    [editing, setEditing] = useState<{ previous?: RecordOf<"goal"> }>(),
    goals = latest(store.records, "goal", Infinity, true);
  const rules = latest(store.records, "playbook").flatMap(p => p.body.rules.map(r => ({ ...r, book: p.body.name, bookId: p.id })));
  const formKey = `ss-mission-form:${context.props.pulse?.owner ?? "local"}:${editing?.previous?.id ?? "new"}`;
  return (
    <div className="cc-stack">
      <MissionsPanel {...context} onManage={() => setEditing({})} />
      <Panel
        title="Mission builder"
        detail="Automatic goals count real evidence. Subjective goals use manual confirmations."
        action={<button onClick={() => setEditing({})}>Create mission</button>}
      >
        {editing && (
          <PersistentForm
            draftKey={formKey}
            className="cc-form"
            key={editing.previous?.id ?? "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                body: BodyOf<"goal"> = {
                  name: string(f, "name"),
                  description: string(f, "description"),
                  source: string(f, "source") as BodyOf<"goal">["source"],
                  target: number(f, "target") ?? 0,
                  start: string(f, "start"),
                  end: string(f, "end"),
                  ruleId: string(f, "ruleId") || undefined,
                  variableId: string(f, "variableId") || undefined,
                  milestones: string(f, "milestones")
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                    .map(Number),
                };
              if (
                await store.save([createRecord("goal", body, editing.previous)])
              ) {
                clearFormDraft(formKey);
                setEditing(undefined);
              }
            }}
          >
            <div className="cc-grid">
              <Input
                name="name"
                label="Mission name"
                value={editing.previous?.body.name}
                required
              />
              <Field label="Evidence source">
                <select
                  name="source"
                  defaultValue={editing.previous?.body.source ?? "preparation"}
                >
                  {[
                    "preparation",
                    "checkin",
                    "audit",
                    "rule-adherence",
                    "observation",
                    "manual",
                  ].map((v) => (
                    <option key={v} value={v}>{evidenceLabels[v as keyof typeof evidenceLabels]}</option>
                  ))}
                </select>
              </Field>
              <Input
                name="target"
                label="Target count"
                type="number"
                min={1}
                value={editing.previous?.body.target ?? 5}
                required
              />
              <Input
                name="start"
                label="Start date"
                type="date"
                value={editing.previous?.body.start ?? day.body.date}
                required
              />
              <Input
                name="end"
                label="End date"
                type="date"
                value={editing.previous?.body.end ?? day.body.date}
                required
              />
              <Input
                name="milestones"
                label="Milestones (counts, comma separated)"
                value={editing.previous?.body.milestones.join(", ")}
              />
              <Field label="Specific rule (optional)">
                <select
                  name="ruleId"
                  defaultValue={editing.previous?.body.ruleId ?? ""}
                >
                  <option value="">Any rule</option>
                  {rules.map(r => <option key={r.bookId + r.id} value={r.id}>{r.book} · {r.name}</option>)}
                </select>
                {!rules.length && <p>No rules yet. <button type="button" onClick={() => context.props.onPage("Trade Quality")}>Create my first rule</button> Your mission draft stays here when you return.</p>}
              </Field>
              <Field label="Specific variable (optional)">
                <select
                  name="variableId"
                  defaultValue={editing.previous?.body.variableId ?? ""}
                >
                  <option value="">Any variable</option>
                  {latest(store.records, "variable").map((v) => (
                    <option key={v.id} value={v.rootId}>
                      {v.body.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Area
              name="description"
              label="Description / completion conditions"
              value={editing.previous?.body.description}
            />
            <div className="cc-actions">
              <Save store={store}>Save mission</Save>
              <button type="button" onClick={() => setEditing(undefined)}>
                Cancel
              </button>
            </div>
          </PersistentForm>
        )}
        {goals.map((g) => {
          const progress = goalProgress(g, store.records),
            history = latest(store.records, "progress").filter(
              (p) => p.body.goalId === g.rootId,
            );
          return (
            <article key={g.id} className="cc-thesis">
              <div className="cc-actions">
                <h3>{g.body.name}</h3>
                <Badge>
                  {g.archived
                    ? "Archived"
                    : progress.complete
                      ? "Complete"
                      : day.body.date < g.body.start ? "Upcoming" : day.body.date > g.body.end ? "Ended" : "Active"}
                </Badge>
                <button onClick={() => setEditing({ previous: g })}>
                  Edit
                </button>
                <button
                  disabled={store.busy}
                  onClick={() =>
                    void store.save([
                      {
                        ...createRecord("goal", g.body, g),
                        archived: !g.archived,
                      },
                    ])
                  }
                >
                  {g.archived ? "Restore" : "Archive"}
                </button>
              </div>
              <p>{g.body.description}</p>
              <p>
                {progress.value}/{progress.target} · {progress.evidence.length}{" "}
                evidence records
              </p>
              <p>
                Milestones:{" "}
                {g.body.milestones
                  .map((n) => `${n}${progress.value >= n ? " ✓" : ""}`)
                  .join(" · ") || "None"}
              </p>
              {g.body.source === "manual" ? (
                <form
                  className="cc-inline"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await store.save([
                      createRecord("progress", {
                        goalId: g.rootId,
                        dayId: day.rootId,
                        method: "manual",
                        value: number(f, "value") ?? 0,
                        note: string(f, "note"),
                      }),
                    ]);
                  }}
                >
                  <Input
                    label="Progress to add"
                    name="value"
                    type="number"
                    min={0}
                    required
                  />
                  <Input label="Confirmation note" name="note" required />
                  <Save store={store}>Confirm progress</Save>
                </form>
              ) : (
                <p className="cc-muted">
                  Progress recalculates from current recorded evidence,
                  including corrections.
                </p>
              )}
              {history.map((p) => (
                <p key={p.id}>
                  {new Date(p.createdAt).toLocaleString()} · +{p.body.value} ·{" "}
                  {p.body.note}
                </p>
              ))}
              <details className="cc-history">
                <summary>Supporting evidence</summary>
                {progress.evidence.map((r) => (
                  <p key={r.id}>
                    {r.kind} · {new Date(r.createdAt).toLocaleString()} · {r.id}
                  </p>
                ))}
              </details>
              <History records={store.records} rootId={g.rootId} />
            </article>
          );
        })}
      </Panel>
    </div>
  );
}
