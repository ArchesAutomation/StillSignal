"use client";
import { latest } from "@/lib/process/model";
import { isArchivedPreparationStep } from "@/lib/process/active-preparation";
import type { ProcessStore } from "./use-process";
import { History, Panel } from "./shared";

/** A read-only home for retired features. Nothing is migrated or deleted. */
export default function ArchivedTools({ store, onBack }: { store: ProcessStore; onBack: () => void }) {
  const theses = latest(store.records, "thesis", Infinity, true);
  const goals = latest(store.records, "goal", Infinity, true);
  const routines = latest(store.records, "protocol", Infinity, true).filter(r => r.body.steps.some(isArchivedPreparationStep));
  const runs = latest(store.records, "run", Infinity, true).filter(r => r.body.steps.some(isArchivedPreparationStep));
  const responses = latest(store.records, "response", Infinity, true);
  return <div className="cc-workspace cc-stack">
    <button onClick={onBack}>← Command Center</button>
    <Panel title="Archived tools" detail="Trading theses, weekly/daily market plans and missions are no longer part of preparation. Their saved records remain here, read-only.">
      {!theses.length && !goals.length && !runs.length && !routines.length && <p>No saved records for these tools.</p>}
      {routines.map(row => <details key={row.id}><summary>Saved routine · {row.body.name}</summary>
        {row.body.steps.filter(isArchivedPreparationStep).map(step => <article key={step.id}><h3>{step.name}</h3><p>{step.description}</p></article>)}
        <History records={store.records} rootId={row.rootId} />
      </details>)}
      {theses.map(row => <article className="cc-thesis" key={row.id}>
        <h3>{row.body.scope} market plan · {row.body.periodStart}</h3>
        <p>{row.body.instrument} · {row.body.bias}</p>
        {(["structure", "events", "levels", "liquidity", "primary", "alternate", "entries", "invalidation", "noTrade", "targets", "notes"] as const).map(key => row.body[key] && <div key={key}><strong>{key}</strong><p style={{ whiteSpace: "pre-wrap" }}>{row.body[key]}</p></div>)}
        <History records={store.records} rootId={row.rootId} />
      </article>)}
      {goals.map(row => <article className="cc-thesis" key={row.id}>
        <h3>{row.body.name}</h3><p>{row.body.description}</p>
        <p>{row.body.start} – {row.body.end} · target {row.body.target}</p>
        <History records={store.records} rootId={row.rootId} />
        {latest(store.records, "progress", Infinity, true).filter(p => p.body.goalId === row.rootId || p.body.goalId === row.id).map(p => <p key={p.id}>Recorded progress: {p.body.value} · {p.body.note}</p>)}
      </article>)}
      {runs.map(run => <details key={run.id}><summary>Archived preparation steps · {new Date(run.body.startedAt).toLocaleString()}</summary>
        {run.body.steps.filter(isArchivedPreparationStep).map(step => {
          const response = responses.find(r => r.body.runId === run.id && r.body.stepId === step.id);
          return <article key={step.id}><h3>{step.name}</h3><p>{step.description}</p><p>{response?.body.status ?? "Not recorded"}</p>
            {response?.body.answers?.map(answer => <p key={answer.id}>{step.prompts?.find(p => p.id === answer.id)?.label ?? answer.id}: {answer.value}</p>)}
            {response && <History records={store.records} rootId={response.rootId} />}
          </article>;
        })}
      </details>)}
    </Panel>
  </div>;
}
