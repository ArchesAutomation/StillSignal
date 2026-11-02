import {
  latest,
  weekOf,
  type BodyOf,
  type ProcessRecord,
  type RecordOf,
} from "./model";
export type PreparationStep = BodyOf<"protocol">["steps"][number];
export const activities = {
  checklist: [
    "Pre-market non-negotiables",
    "Write the rules, risk limits and checks you need before trading.",
  ],
  thesis: [
    "Trading thesis",
    "Build your market outlook, levels, scenarios and invalidation.",
  ],
  variables: [
    "Personal variables",
    "Define and record the conditions that matter to your trading.",
  ],
  missions: ["Missions", "Create, review and track your process goals."],
  intentions: [
    "Intentions",
    "Decide how you want to show up and what a good process looks like.",
  ],
  checkin: [
    "Personal check-in",
    "Record your own focus, energy, confidence and circumstances.",
  ],
  custom: [
    "Your own section",
    "Add your own questions, instructions and checklist.",
  ],
} as const;
export const cadences = {
  session: "Every session",
  daily: "Once a day",
  weekly: "Once a week",
  monthly: "Once a month",
  weekdays: "On selected weekdays",
} as const;
export function activityOf(step: PreparationStep): keyof typeof activities {
  return (
    step.activity ??
    (step.verification.includes("thesis")
      ? "thesis"
      : step.verification === "checkin"
        ? "checkin"
        : "custom")
  );
}
export function scheduledOn(step: PreparationStep, date: string) {
  return (
    step.cadence !== "weekdays" ||
    (step.weekdays ?? [1, 2, 3, 4, 5]).includes(
      new Date(date + "T12:00:00Z").getUTCDay(),
    )
  );
}
const signature = (step: PreparationStep) =>
  JSON.stringify({ ...step, order: 0 });
/** Carry actual completed evidence only within its configured calendar period.
 * Templates and run snapshots are immutable; changing a section invalidates reuse. */
export function preparationResponse(
  records: ProcessRecord[],
  run: RecordOf<"run">,
  step: PreparationStep,
  at = Infinity,
) {
  const responses = latest(records, "response", at)
    .filter((r) => r.body.stepId === step.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const own = responses.find((r) => r.body.runId === run.id);
  if (own || !step.cadence || step.cadence === "session") return own;
  const day = latest(records, "day", Math.min(at, run.createdAt)).find(
    (d) => d.rootId === run.body.dayId,
  );
  const template = records.find(
    (r) => r.kind === "protocol" && r.id === run.body.templateId,
  );
  if (!day || !template) return undefined;
  const period = (date: string) =>
    step.cadence === "weekly"
      ? weekOf(date)
      : step.cadence === "monthly"
        ? date.slice(0, 7)
        : date;
  return latest(records, "response", Math.min(at, run.body.startedAt))
    .filter((r) => r.body.stepId === step.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((response) => {
      if (
        response.body.status !== "complete" ||
        response.body.completedAt === undefined ||
        response.body.completedAt > run.body.startedAt
      )
        return false;
      const previousRun = latest(
        records,
        "run",
        Math.min(at, run.createdAt),
      ).find((r) => r.id === response.body.runId);
      if (!previousRun || previousRun.body.startedAt > run.body.startedAt)
        return false;
      const previousTemplate = records.find(
        (r) => r.id === previousRun.body.templateId && r.kind === "protocol",
      );
      const previousDay = latest(
        records,
        "day",
        Math.min(at, run.createdAt),
      ).find((d) => d.rootId === previousRun.body.dayId);
      const previousStep = previousRun.body.steps.find((s) => s.id === step.id);
      return (
        previousTemplate?.kind === "protocol" &&
        template.kind === "protocol" &&
        previousTemplate.rootId === template.rootId &&
        ["instrument", "strategy", "session"].every(
          (key) =>
            previousTemplate.body[
              key as "instrument" | "strategy" | "session"
            ] === template.body[key as "instrument" | "strategy" | "session"],
        ) &&
        previousStep &&
        signature(previousStep) === signature(step) &&
        previousDay &&
        previousDay.body.timezone === day.body.timezone &&
        previousDay.body.instrument === day.body.instrument &&
        previousDay.body.account === day.body.account &&
        previousDay.body.date <= day.body.date &&
        period(previousDay.body.date) === period(day.body.date)
      );
    });
}
export function answerError(
  step: PreparationStep,
  answers: NonNullable<BodyOf<"response">["answers"]>,
) {
  const values = new Map(answers.map((a) => [a.id, a.value]));
  for (const [index, label] of (step.checklist ?? []).entries())
    if (values.get("check-" + index) !== "yes")
      return `Check “${label}” before completing this section.`;
  for (const prompt of step.prompts ?? []) {
    const value = values.get(prompt.id)?.trim() ?? "";
    if (prompt.required && !value)
      return `Answer “${prompt.label}” before completing this section.`;
    if (!value) continue;
    if (prompt.type === "number" && !Number.isFinite(Number(value)))
      return `Enter a number for “${prompt.label}”.`;
    if (prompt.type === "boolean" && !["yes", "no"].includes(value))
      return `Choose yes or no for “${prompt.label}”.`;
    if (prompt.type === "choice" && !prompt.choices.includes(value))
      return `Choose an option for “${prompt.label}”.`;
  }
  return "";
}
export function activityEvidenceError(
  records: ProcessRecord[],
  dayId: string,
  step: PreparationStep,
) {
  if (step.activity === "variables") {
    const variables = latest(records, "variable").filter(
      (v) =>
        !v.body.archived &&
        (!step.variableIds || step.variableIds.includes(v.rootId)),
    );
    if (!variables.length)
      return "Create or select at least one personal variable for this section.";
    if (step.variableIds?.some((id) => !variables.some((v) => v.rootId === id)))
      return "A selected variable was archived or removed. Edit your routine to choose active variables.";
    const observations = latest(records, "observation");
    const targets = step.variableIds
      ? variables
      : variables.filter((v) => v.body.required);
    if (
      !targets.length &&
      !observations.some(
        (o) =>
          o.body.dayId === dayId &&
          variables.some((v) => v.id === o.body.definitionId) &&
          (o.body.missing === "recorded" ||
            o.body.missing === "not-applicable"),
      )
    )
      return "Record at least one personal variable before completing this section.";
    for (const variable of targets)
      if (
        !observations.some(
          (o) =>
            o.body.dayId === dayId &&
            o.body.definitionId === variable.id &&
            (o.body.missing === "recorded" ||
              o.body.missing === "not-applicable"),
        )
      )
        return `Record “${variable.body.name}” before completing this section.`;
  }
  if (step.activity === "missions") {
    const day = latest(records, "day").find((d) => d.rootId === dayId);
    if (
      !day ||
      !latest(records, "goal").some(
        (g) => g.body.start <= day.body.date && g.body.end >= day.body.date,
      )
    )
      return "Create a mission that applies to this trading day before completing this section.";
  }
  return "";
}
