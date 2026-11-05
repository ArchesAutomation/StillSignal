"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { createRecord, latest, type RecordOf } from "@/lib/process/model";
import {
  unansweredReflections,
  activityOf,
  answerError,
  activityEvidenceError,
  preparationResponse,
  scheduledOn,
  type PreparationStep,
} from "@/lib/process/preparation-workflow";
import { verificationEvidence } from "@/lib/process/engine";
import { useSavedGuide } from "../use-saved-guide";
import { Panel, Field, type Context } from "../command-center/shared";
import StepActivity from "./step-activity";
import PreparationSummary from "./preparation-summary";
const draftSchema = z.object({
  selected: z.string().nullable(),
  page: z.number().int().min(0),
  answers: z.record(z.string(), z.record(z.string(), z.string())),
  reminders: z.array(z.string()),
});
export default function FocusedRun({
  context,
  run,
}: {
  context: Context;
  run: RecordOf<"run">;
}) {
  const { store, day, props } = context;
  const source = store.records.find(
    (r): r is RecordOf<"protocol"> =>
      r.kind === "protocol" && r.id === run.body.templateId,
  );
  const profile = source?.body.profile;
  const activityContext = {
    ...context,
    day: {
      ...day,
      body: {
        ...day.body,
        instrument: source?.body.instrument || day.body.instrument,
      },
    },
  };
  const draft = useSavedGuide(
    `ss-guide-run:${props.pulse?.owner ?? "local"}:${run.id}`,
    () => ({
      selected: null as string | null,
      page: 0,
      answers: {} as Record<string, Record<string, string>>,
      reminders: [] as string[],
    }),
    (v) => draftSchema.parse(v),
  );
  const [reminderSkip, setReminderSkip] = useState(false);
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [showReminder, setShowReminder] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const resolved = (step: PreparationStep) =>
    !scheduledOn(step, day.body.date) ||
    ["complete", "skipped", "not-applicable"].includes(
      preparationResponse(store.records, run, step)?.body.status ?? "",
    );
  const remaining = run.body.steps.filter((s) => !resolved(s));
  const scheduled = run.body.steps.filter((s) => scheduledOn(s, day.body.date));
  const current =
    run.body.steps.find((s) => s.id === draft.value.selected) ?? remaining[0];
  const response = current
    ? preparationResponse(store.records, run, current)
    : undefined;
  const own = current
    ? latest(store.records, "response").find(
        (r) => r.body.runId === run.id && r.body.stepId === current.id,
      )
    : undefined;
  const pages = current
    ? [
        "intro",
        ...(current.checklist?.length ? ["reminders"] : []),
        ...(!["custom", "checklist", "intentions"].includes(activityOf(current))
          ? ["activity"]
          : []),
        ...(current.prompts ?? []).map((p) => p.id),
        "finish",
      ]
    : [];
  const page = Math.min(draft.value.page, pages.length - 1),
    item = pages[page];
  const prompt = current?.prompts?.find((p) => p.id === item);
  const values = {
    ...Object.fromEntries(
      response?.body.answers?.map((a) => [a.id, a.value]) ?? [],
    ),
    ...(current ? draft.value.answers[current.id] : {}),
  };
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: "start" });
  }, [current?.id, item]);
  useEffect(() => {
    setShowReminder(false);
    setError("");
  }, [current?.id]);
  function answer(id: string, value: string) {
    if (current)
      draft.update((v) => ({
        ...v,
        answers: { ...v.answers, [current.id]: { ...values, [id]: value } },
      }));
  }
  function go(offset: number) {
    setError("");
    draft.update((v) => ({ ...v, page: Math.max(0, page + offset) }));
  }
  const missing = (current?.prompts ?? []).filter((p) => !values[p.id]?.trim());
  const omissions = [
    ...unansweredReflections(store.records, run).filter(
      (p) => p.stepId !== current?.id && scheduled.some((s) => s.id === p.stepId),
    ),
    ...missing.map((p) => ({
      stepId: current!.id,
      promptId: p.id,
      label: p.label,
      section: current!.name,
    })),
  ];
  const isLast = current?.id === scheduled.at(-1)?.id;
  async function commit(skip = false, acceptOmissions = false) {
    if (!current || saving) return;
    setError("");
    if (
      isLast &&
      omissions.length &&
      !acceptOmissions &&
      !draft.value.reminders.includes(run.id)
    ) {
      draft.update((v) => ({
        ...v,
        page: pages.length - 1,
        reminders: [...v.reminders, run.id],
      }));
      setReminderSkip(skip);
      setShowReminder(true);
      return;
    }
    const answers = [
      ...(current.checklist ?? []).map((_, i) => ({
        id: `check-${i}`,
        value: values[`check-${i}`] ?? "no",
      })),
      ...(current.prompts ?? []).map((p) => ({
        id: p.id,
        value: values[p.id] ?? "",
      })),
    ];
    const skippedPromptIds = missing.map((p) => p.id);
    if (!skip) {
      const issue =
        answerError(current, answers, skippedPromptIds) ||
        activityEvidenceError(store.records, day.rootId, current);
      if (issue) {
        const invalidPrompt = current.prompts?.find((p) =>
          answerError({ ...current, checklist: [], prompts: [p] }, answers, skippedPromptIds),
        );
        const target = answerError({ ...current, prompts: [] }, answers)
          ? "reminders"
          : invalidPrompt?.id ??
          (answerError(current, answers, skippedPromptIds) ? "reminders" : "activity");
        const targetPage = pages.indexOf(target);
        if (targetPage >= 0)
          draft.update((v) => ({ ...v, page: targetPage }));
        setError(issue);
        return;
      }
      if (
        ["thesis", "checkin"].includes(activityOf(current)) &&
        !verificationEvidence(store.records, run, current.id, Date.now())
      ) {
        draft.update((v) => ({ ...v, page: pages.indexOf("activity") }));
        setError(
          `Save your ${activityOf(current) === "thesis" ? "trading thesis" : "check-in"} above, or skip this section for today.`,
        );
        return;
      }
    }
    setSaving(true);
    const record = createRecord(
      "response",
      {
        runId: run.id,
        stepId: current.id,
        status: skip ? "skipped" : "complete",
        method: "manual",
        reason: skip
          ? "Skipped for today"
          : missing.length
            ? "Unanswered reflections skipped for today"
            : "",
        answers,
        skippedPromptIds: current.allowReflectionSkip
          ? skippedPromptIds
          : undefined,
        completedAt: skip ? undefined : Date.now(),
      },
      own,
    );
    const batch: Context["store"]["records"] = [record];
    const goal =
      current.activity === "intentions"
        ? answers.find((a) => a.value.trim())?.value
        : undefined;
    if (!skip && goal) {
      const currentDay =
        latest(store.records, "day").find((d) => d.rootId === day.rootId) ??
        day;
      batch.unshift(
        createRecord("day", { ...currentDay.body, goal }, currentDay),
      );
    }
    if (await store.save(batch)) {
      draft.update((v) => ({ ...v, selected: null, page: 0 }));
      setShowReminder(false);
    } else
      setError(
        "This section could not be saved. Your answers remain here. Retry saving before leaving.",
      );
    setSaving(false);
  }
  if (!draft.loaded) return <p role="status">Restoring your place…</p>;
  if (!current)
    return (
      <div className="cc-stack">
        <Panel
          title="Your preparation is saved"
          detail="A record of your intentions, not a judgement of readiness."
        >
          <p>
            Review your reference below. Skipped sections remain labelled; you
            can return to any section to add an answer.
          </p>
          <div className="cc-actions">
            <button onClick={() => props.onPage("Command Center")}>
              Open my Command Center
            </button>
            <button
              className="cc-primary"
              onClick={() => props.onPage("Journal")}
            >
              Open my journal →
            </button>
          </div>
          <details>
            <summary>Revisit a section</summary>
            {run.body.steps.map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  draft.update((v) => ({ ...v, selected: s.id, page: 0 }))
                }
              >
                {s.name} ·{" "}
                {preparationResponse(store.records, run, s)?.body.status ??
                  "Not scheduled"}
              </button>
            ))}
          </details>
        </Panel>
        <PreparationSummary {...context} />
      </div>
    );
  return (
    <Panel
      title="Your pre-trading walkthrough"
      detail={`${run.body.steps.length - remaining.length} of ${run.body.steps.length} sections resolved · ${profile?.pace === "short" ? "Take the shorter route whenever useful" : "Make room to reflect; roughly 10–15 minutes for the full routine"}`}
    >
      <div className="journal-guide">
        <div className="guide-progress">
          <span>
            Section {run.body.steps.indexOf(current) + 1} of{" "}
            {run.body.steps.length} · {current.name}
          </span>
          <progress
            value={page + 1}
            max={pages.length}
            aria-label="Current section progress"
          />
        </div>
        <div className="guide-focus prep-focus">
          <small>
            Step {page + 1} of {pages.length} in this section
          </small>
          <h3 ref={heading} tabIndex={-1}>
            {prompt?.label ??
              (item === "finish"
                ? "Keep what you want to carry forward"
                : item === "reminders"
                  ? "Your own commitments, within reach"
                  : current.name)}
          </h3>
          {item === "intro" && (
            <>
              <p>{current.description}</p>
              <p className="guide-why">
                {
                  {
                    thesis:
                      "You can keep a saved applicable plan. Use Revise only when something changed; you do not need to create another plan to continue.",
                    checkin:
                      "This is your own description of how you feel. It will appear in your journal and Command Center; heart rate does not fill in these answers.",
                    checklist:
                      "Read these as reminders. Actual rule adherence is reviewed after a trade, separately from its result.",
                    missions:
                      "Review an existing goal. You can carry it forward over several days or skip mission creation today.",
                    variables:
                      "Record context you want to compare with your experience. Missing measurements stay missing; you can continue without them.",
                    intentions:
                      "Today's intention is separate from the wider perspective you want to remember over your career.",
                    custom:
                      "Use your own words. You can go back, save your place, or skip today's reflection.",
                  }[activityOf(current)]
                }
              </p>
              {profile?.perspective && current.activity === "intentions" && (
                <blockquote>
                  Your longer-term perspective: {profile.perspective}
                </blockquote>
              )}
            </>
          )}
          {item === "reminders" && (
            <ul className="guide-commitments">
              {current.checklist?.map((label, i) => (
                <li key={i}>
                  {current.checklistMode === "reminder" ? (
                    label
                  ) : (
                    <label>
                      <input
                        type="checkbox"
                        checked={values[`check-${i}`] === "yes"}
                        onChange={(e) =>
                          answer(`check-${i}`, e.target.checked ? "yes" : "no")
                        }
                      />
                      {label}
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Keep activity tools mounted as the user walks between questions. */}
          {pages.includes("activity") && (
            <div hidden={item !== "activity"}>
              <StepActivity
                key={current.id}
                context={activityContext}
                step={current}
              />
            </div>
          )}
          {prompt && (
            <>
              <p className="cc-muted">
                {prompt.required && !current.allowReflectionSkip
                  ? "Required by your existing routine"
                  : "Your reflection · you may skip for today"}
              </p>
              <Field label="Your answer">
                {prompt.type === "text" ? (
                  <textarea
                    autoFocus
                    rows={5}
                    maxLength={8000}
                    value={values[prompt.id] ?? ""}
                    onChange={(e) => answer(prompt.id, e.target.value)}
                    placeholder="Take your time. A few honest words are enough."
                  />
                ) : prompt.type === "number" ? (
                  <input
                    type="number"
                    step="any"
                    value={values[prompt.id] ?? ""}
                    onChange={(e) => answer(prompt.id, e.target.value)}
                  />
                ) : (
                  <select
                    value={values[prompt.id] ?? ""}
                    onChange={(e) => answer(prompt.id, e.target.value)}
                  >
                    <option value="">Choose an answer</option>
                    {(prompt.type === "boolean"
                      ? ["yes", "no"]
                      : prompt.choices
                    ).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </Field>
            </>
          )}
          {item === "finish" && (
            <>
              <p>
                Save this section to continue. You can edit a saved answer later
                from today's reference.
              </p>
              {(current.prompts ?? []).map((p) => (
                <p key={p.id}>
                  <strong>{p.label}</strong>
                  <br />
                  {values[p.id]?.trim() || "Not answered"}
                </p>
              ))}
              {showReminder && (
                <div className="guide-reminder" role="status">
                  <strong>A few reflections are unanswered</strong>
                  <ul>
                    {omissions.map((p) => (
                      <li key={p.promptId}>
                        {p.section}: {p.label}
                      </li>
                    ))}
                  </ul>
                  <p>
                    This is your one reminder near the end of preparation.
                    Answer now, or skip these reflections for today.
                  </p>
                  <div className="cc-actions">
                    <button
                      onClick={() =>
                        draft.update((v) => ({
                          ...v,
                          selected: omissions[0].stepId,
                          page: 0,
                        }))
                      }
                    >
                      Answer now
                    </button>
                    <button onClick={() => void commit(reminderSkip, true)}>
                      Skip unanswered reflections & save
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {(error || draft.storageError || store.error) && (
            <div className="guide-error" role="alert">
              <p>{error || draft.storageError || store.error}</p>
              {item === "finish" && pages.includes("activity") && (
                <button
                  onClick={() =>
                    draft.update((v) => ({
                      ...v,
                      page: pages.indexOf("activity"),
                    }))
                  }
                >
                  Return to this section's saved work
                </button>
              )}
            </div>
          )}
        </div>
        <div className="guide-footer">
          <button
            disabled={
              saving || (page === 0 && run.body.steps.indexOf(current) === 0)
            }
            onClick={() =>
              page > 0
                ? go(-1)
                : draft.update((v) => ({
                    ...v,
                    selected:
                      run.body.steps[run.body.steps.indexOf(current) - 1].id,
                    page: 0,
                  }))
            }
          >
            ← Back
          </button>
          <span role="status">
            {saving
              ? "Saving section…"
              : draft.storageError
                ? "Draft needs attention"
                : "Your place and draft are saved on this device"}
          </span>
          {item === "finish" ? (
            <button
              className="cc-primary"
              disabled={saving || store.busy}
              onClick={() => void commit(false)}
            >
              Save section & continue →
            </button>
          ) : (
            <button
              className="cc-primary"
              disabled={saving}
              onClick={() => go(1)}
            >
              Continue →
            </button>
          )}
        </div>
        <div className="cc-actions">
          <button
            disabled={saving || store.busy}
            onClick={() => void commit(true)}
          >
            Skip this section for today
          </button>
          <button onClick={() => props.onPage("Command Center")}>
            Save my place & return later
          </button>
        </div>
        <details className="guide-advanced">
          <summary>All sections & progress</summary>
          <ol>
            {run.body.steps.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() =>
                    draft.update((v) => ({ ...v, selected: s.id, page: 0 }))
                  }
                >
                  {s.name} ·{" "}
                  {!scheduledOn(s, day.body.date)
                    ? "Not scheduled today"
                    : preparationResponse(store.records, run, s)?.body.status ?? "Not reviewed"}
                </button>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </Panel>
  );
}
