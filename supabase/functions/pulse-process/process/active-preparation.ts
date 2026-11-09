import type { BodyOf } from "./model.ts";

type Step = BodyOf<"protocol">["steps"][number];

/** Presentation policy only: original definitions, runs and answers stay intact. */
export function isArchivedPreparationStep(step: Step) {
  return step.activity === "thesis" || step.activity === "missions" ||
    step.verification === "daily-thesis" || step.verification === "weekly-thesis";
}

export function activePreparationSteps(steps: Step[]) {
  return steps.filter((step) => !isArchivedPreparationStep(step));
}

export function activePreparationRun<T extends { body: { steps: Step[] } }>(run: T): T {
  return { ...run, body: { ...run.body, steps: activePreparationSteps(run.body.steps) } };
}
