"use client";
import { useState } from "react";
import ProcessReplay from "./replay";
import {
  createRecord,
  latest,
  weekOf,
  type RecordOf,
} from "@/lib/process/model";
import { auditSnapshot, periodRecords } from "@/lib/process/reviews";
import {
  Area,
  Badge,
  Field,
  History,
  Input,
  Panel,
  Save,
  string,
  type Context,
} from "../command-center/shared";
export default function Audits({ store, day, props }: Context) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily"),
    [start, setStart] = useState(day.body.date),
    [end, setEnd] = useState(day.body.date),
    [editing, setEditing] = useState<RecordOf<"audit">>();
  const snapshot = auditSnapshot(
      store.records,
      props.history,
      start,
      end,
      day.body.timezone,
    ),
    records = periodRecords(store.records, start, end),
    rows = latest(store.records, "audit").sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  function changePeriod(p: typeof period) {
    setEditing(undefined);
    setPeriod(p);
    setStart(
      p === "daily"
        ? day.body.date
        : p === "weekly"
          ? weekOf(day.body.date)
          : day.body.date.slice(0, 8) + "01",
    );
    setEnd(day.body.date);
  }
  return (
    <div className="cc-stack">
      <ProcessReplay store={store} day={day} props={props}/>
      <Panel
        title="Audits & reviews"
        detail="Review preparation, outcomes and process separately. Saved evidence summaries retain revision history."
      >
        <div className="cc-grid">
          <Field label="Review period">
            <select
              value={period}
              onChange={(e) => changePeriod(e.target.value as typeof period)}
            >
              {["daily", "weekly", "monthly"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Through">
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <div className="cc-status-grid">
          {Object.entries(snapshot).map(([key, value]) => (
            <div key={key}>
              <small>{key.replace(/([A-Z])/g, " $1")}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p className="cc-muted">
          HR sessions indicate recording availability, not proof of emotional
          state. No-trade days remain in preparation and review counts.
        </p>
        <details>
          <summary>Recorded day statuses and evidence</summary>
          {records.days.map((d) => (
            <p key={d.id}>
              {d.body.date} · {d.body.status} ·{" "}
              {d.body.instrument || "No instrument selected"}
            </p>
          ))}
          {records.checkins.map((c) => (
            <p key={c.id}>
              {new Date(c.body.observedAt).toLocaleString()} ·{" "}
              {c.body.answers
                .map((a) => `${a.question}: ${a.value ?? "missing"}`)
                .join(" · ")}
            </p>
          ))}
        </details>
        <form
          key={editing?.id ?? period + start + end}
          className="cc-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (end < start) {
              store.setError("Review end precedes its start.");
              return;
            }
            const f = new FormData(e.currentTarget);
            const sources = [
              ...records.days,
              ...records.assessments,
              ...records.runs,
              ...records.evaluations,
              ...records.responses,
              ...records.checkins,
              ...records.observations,
            ];
            await store.save([
              createRecord(
                "audit",
                {
                  dayId: day.rootId,
                  period,
                  start,
                  end,
                  summary: string(f, "summary"),
                  reflection: string(f, "reflection"),
                  nextGoals: string(f, "nextGoals"),
                  snapshot,
                },
                editing,
                sources.map((r) => ({ kind: r.kind, id: r.id })),
              ),
            ]);
            setEditing(undefined);
          }}
        >
          <Area
            label="Review summary"
            name="summary"
            value={editing?.body.summary}
            required
          />
          <Area
            label="What did you observe? (Include plan adherence on no-trade days)"
            name="reflection"
            value={editing?.body.reflection}
          />
          <Area
            label="Process goals for the next period"
            name="nextGoals"
            value={editing?.body.nextGoals}
          />
          <Save store={store}>
            {editing
              ? "Save review revision"
              : "Save review with evidence snapshot"}
          </Save>
        </form>
      </Panel>
      <Panel title="Saved reviews">
        {!rows.length && <p className="cc-empty">No audits recorded yet.</p>}
        {rows.map((a) => (
          <article className="cc-thesis" key={a.id}>
            <div className="cc-actions">
              <h3>
                {a.body.start} → {a.body.end}
              </h3>
              <Badge>{a.body.period}</Badge>
              <button
                onClick={() => {
                  setEditing(a);
                  setStart(a.body.start);
                  setEnd(a.body.end);
                  setPeriod(a.body.period);
                }}
              >
                Revise review
              </button>
            </div>
            <p>{a.body.summary}</p>
            <p>{a.body.reflection}</p>
            <small>
              Next goals: {a.body.nextGoals || "Not recorded"} · snapshot v
              {a.revision}
            </small>
            <History records={store.records} rootId={a.rootId} />
          </article>
        ))}
      </Panel>
    </div>
  );
}
