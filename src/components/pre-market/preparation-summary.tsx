"use client";
import { useState } from "react";
import { createRecord, latest, type RecordOf } from "@/lib/process/model";
import { Field, History, Panel, type Context } from "../command-center/shared";
import { activePreparationRun } from "@/lib/process/active-preparation";
import { activityOf, type PreparationStep } from "@/lib/process/preparation-workflow";
export default function PreparationSummary({ store, day, props }: Context) {
  const runs = latest(store.records, "run").map(activePreparationRun).filter(
    (r) => r.body.dayId === day.rootId,
  );
  const responses = latest(store.records, "response");
  // A routine can be restarted or revised during the day. Keep every run in
  // history, but show only its current run in the working reference.
  const currentRuns = new Map<string, RecordOf<"run">>();
  for (const run of [...runs].sort((a, b) => a.createdAt - b.createdAt)) {
    const template = store.records.find(
      (r) => r.kind === "protocol" && r.id === run.body.templateId,
    );
    currentRuns.set(template?.rootId ?? run.body.templateId, run);
  }
  const currentSteps = [...currentRuns.values()].flatMap((run) => run.body.steps);
  const profiles = [...currentRuns.values()].flatMap((run) => {
    const template = store.records.find((r) => r.kind === "protocol" && r.id === run.body.templateId);
    return template?.kind === "protocol" && template.body.profile ? [template.body.profile] : [];
  });
  const checkin = latest(store.records, "checkin")
    .filter((c) => c.body.dayId === day.rootId)
    .sort((a, b) => b.body.observedAt - a.body.observedAt)[0];
  const [editing, setEditing] = useState(""),
    [value, setValue] = useState(""),
    [reason, setReason] = useState("");
  async function updateAnswer(response: RecordOf<"response">, id: string) {
    const answers = [
      ...(response.body.answers ?? []).filter((a) => a.id !== id),
      { id, value },
    ];
    const batch: Context["store"]["records"] = [
      createRecord(
        "response",
        {
          ...response.body,
          reason: reason || "Updated this answer from today's reference",
          answers,
          skippedPromptIds: response.body.skippedPromptIds?.filter(
            (p) => p !== id,
          ),
        },
        response,
      ),
    ];
    const step = runs.find((r) => r.id === response.body.runId)?.body.steps
      .find((s) => s.id === response.body.stepId);
    if (step?.activity === "intentions" && step.prompts?.[0]?.id === id) {
      const currentDay =
        latest(store.records, "day").find((d) => d.rootId === day.rootId) ??
        day;
      batch.unshift(
        createRecord("day", { ...currentDay.body, goal: value }, currentDay),
      );
    }
    if (await store.save(batch)) setEditing("");
  }
  const edit = (id: string, text: string) => {
    setEditing(id);
    setValue(text);
    setReason("");
  };
  const field = (
    id: string,
    label: string,
    text: string,
    save: () => Promise<void>,
    prompt?: NonNullable<PreparationStep["prompts"]>[number],
    detail?: string,
  ) => (
    <article key={id} className="guide-summary-item">
      <div>
        <strong>{label}</strong>
        <button
          type="button"
          aria-label={"Edit " + label.toLowerCase()}
          onClick={() => edit(id, text)}
        >
          Edit
        </button>
      </div>
      {detail && <small>{detail}</small>}
      {editing === id ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label={label}>
            {prompt?.type === "boolean" || prompt?.type === "choice" ? (
              <select required={id === "bias"} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="" disabled={id === "bias"}>Skipped / not recorded</option>
                {(prompt.type === "boolean" ? ["yes", "no"] : prompt.choices).map((choice) => <option key={choice}>{choice}</option>)}
              </select>
            ) : prompt?.type === "number" ? (
              <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
            ) : <textarea
              maxLength={8000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />}
          </Field>
          <Field label="Reason for this change (optional)">
            <input
              maxLength={8000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="cc-actions">
            <button type="submit" disabled={store.busy}>
              Save this answer
            </button>
            <button type="button" onClick={() => setEditing("")}>
              Cancel
            </button>
          </div>
          {store.error && <p role="alert">{store.error}</p>}
        </form>
      ) : (
        <p>{text || "Skipped / not recorded"}</p>
      )}
    </article>
  );
  return (
    <Panel
      title="Today's reference"
      detail="Your check-in, boundaries and reflections, easy to return to. Changes retain the original record."
    >
      <div className="guide-summary">
        {[...currentRuns.values()].flatMap((run) =>
          run.body.steps.flatMap((step) => {
            const response = responses
              .filter(
                (r) => r.body.runId === run.id && r.body.stepId === step.id,
              )
              .sort((a, b) => b.createdAt - a.createdAt)[0];
            return (step.prompts ?? []).map((prompt) =>
              response ? (
                field(
                  `${run.id}:${prompt.id}`,
                  prompt.label,
                  response.body.answers?.find((a) => a.id === prompt.id)
                    ?.value ?? "",
                  () => updateAnswer(response, prompt.id),
                  prompt,
                )
              ) : (
                <article key={prompt.id}>
                  <strong>{prompt.label}</strong>
                  <p>Not recorded</p>
                </article>
              ),
            );
          }),
        )}
        {!currentSteps.some((s) => activityOf(s) === "intentions" && s.prompts?.length) && field(
          "day-goal", "Today's process intention", day.body.goal,
          async () => {
            const currentDay = latest(store.records, "day").find((d) => d.rootId === day.rootId) ?? day;
            if (await store.save([createRecord("day", { ...currentDay.body, goal: value }, currentDay)])) setEditing("");
          },
        )}
        {[...new Set(profiles.map((p) => p.perspective).filter(Boolean))].map((perspective) => (
          <article key={perspective} className="guide-summary-item"><strong>Longer-term perspective</strong><p>{perspective}</p></article>
        ))}
        {currentSteps.filter((s) => activityOf(s) === "checklist" && s.checklist?.length).map((step) => (
          <article key={step.id} className="guide-summary-item">
            <strong>Risk commitments · {step.name}</strong>
            <p>Reminders from your saved routine; they do not confirm adherence.</p>
            <ul>{step.checklist!.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </article>
        ))}
        <article className="guide-summary-item">
          <strong>How I described feeling</strong>
          <p>
            {checkin
              ? checkin.body.arrival?.join(" · ") || checkin.body.answers
                  .filter((a) => a.value !== null)
                  .map((a) => `${a.question}: ${a.value}/10`)
                  .join(" · ") ||
                checkin.body.reflection ||
                "Check-in saved without ratings"
              : "Not recorded"}
          </p>
          <button onClick={() => props.onPage("Settings & Variables")}>
            Open my check-in
          </button>
        </article>
        <details>
          <summary>Preparation status & saved history</summary>
          {runs.map((run) => (
            <ul key={run.id}>
              {run.body.steps.map((step) => {
                const response = responses.find(
                  (r) => r.body.runId === run.id && r.body.stepId === step.id,
                );
                return (
                  <li key={step.id}>
                    {step.name}: {response?.body.status ?? "Not reviewed"}
                    {response?.body.skippedPromptIds?.length
                      ? ` · ${response.body.skippedPromptIds.length} questions skipped`
                      : ""}
                    {response && (
                      <History
                        records={store.records}
                        rootId={response.rootId}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
        </details>
      </div>
    </Panel>
  );
}
