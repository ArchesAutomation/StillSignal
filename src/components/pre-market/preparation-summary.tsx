"use client";
import { useState } from "react";
import { createRecord, latest, type RecordOf } from "@/lib/process/model";
import { Field, History, Panel, type Context } from "../command-center/shared";
export default function PreparationSummary({ store, day, props }: Context) {
  const runs = latest(store.records, "run").filter(
    (r) => r.body.dayId === day.rootId,
  );
  const responses = latest(store.records, "response");
  const thesis = latest(store.records, "thesis")
    .filter((t) => t.body.dayId === day.rootId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
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
    const step = runs
      .flatMap((r) => r.body.steps)
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
      {editing === id ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label={label}>
            <textarea
              maxLength={8000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
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
      detail="Your plan and commitments, easy to return to. Changes retain the original record."
    >
      <div className="guide-summary">
        {thesis ? (
          <>
            {field(
              "narrative",
              "Market narrative",
              thesis.body.primary,
              async () => {
                if (
                  await store.save([
                    createRecord(
                      "thesis",
                      {
                        ...thesis.body,
                        primary: value,
                        reason:
                          reason || "Updated narrative from today's reference",
                      },
                      thesis,
                    ),
                  ])
                )
                  setEditing("");
              },
            )}
            <article className="guide-summary-item">
              <strong>Current bias</strong>
              <Field label="Update market bias">
                <select
                  value={thesis.body.bias}
                  disabled={store.busy}
                  onChange={(e) =>
                    void store.save([
                      createRecord(
                        "thesis",
                        {
                          ...thesis.body,
                          bias: e.target.value as typeof thesis.body.bias,
                          reason: "Bias updated from today's reference",
                        },
                        thesis,
                      ),
                    ])
                  }
                >
                  {["bullish", "bearish", "neutral", "no-trade"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <details>
                <summary>Original plan & changes</summary>
                <History records={store.records} rootId={thesis.rootId} />
              </details>
            </article>
          </>
        ) : (
          <p>
            Market narrative has not been recorded.{" "}
            <button onClick={() => props.onPage("Trading Thesis")}>
              Add a plan
            </button>
          </p>
        )}
        {runs.flatMap((run) =>
          run.body.steps.flatMap((step) => {
            const response = responses
              .filter(
                (r) => r.body.runId === run.id && r.body.stepId === step.id,
              )
              .sort((a, b) => b.createdAt - a.createdAt)[0];
            return (step.prompts ?? []).map((prompt) =>
              response ? (
                field(
                  prompt.id,
                  prompt.label,
                  response.body.answers?.find((a) => a.id === prompt.id)
                    ?.value ?? "",
                  () => updateAnswer(response, prompt.id),
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
        <article className="guide-summary-item">
          <strong>How I described feeling</strong>
          <p>
            {checkin
              ? checkin.body.answers
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
