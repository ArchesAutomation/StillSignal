"use client";

import Temperature from "../variable-builder/temperature";
import Variables from "../variable-builder/workspace";

import QuickCaffeine from "../variable-builder/quick-caffeine";

import { isArchivedPreparationStep } from "@/lib/process/active-preparation";
import {
  activityOf,
  type PreparationStep,
} from "@/lib/process/preparation-workflow";
import { ModuleScope } from "../module-workspace";
import type { Context } from "../process/shared";
export default function StepActivity({
  step,
  context,
}: {
  step: PreparationStep;
  context: Context;
}) {
  const activity = activityOf(step);
  if (isArchivedPreparationStep(step)) return null;
  return (
    <ModuleScope active={false}>
      <div className="prep-activity">

        {activity === "variables" && (
          <>
            <QuickCaffeine {...context} />
            <Variables
              {...context}
              preparation
              variableIds={step.variableIds}
            />
          </>
        )}
        {activity === "checkin" && <Temperature {...context} initiallyOpen />}

        {activity === "intentions" && (
          <p className="cc-muted">
            Write your intentions in the questions below. Daily and per-session
            intentions also appear as your Preparation process goal.
          </p>
        )}
      </div>
    </ModuleScope>
  );
}
