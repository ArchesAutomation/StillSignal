"use client";
import ThesisWorkspace from "../trading-thesis/workspace";
import Variables from "../variable-builder/workspace";
import Temperature from "../variable-builder/temperature";
import { MissionsPanel } from "../process-goals/workspace";
import QuickCaffeine from "../variable-builder/quick-caffeine";
import Missions from "../process-goals/workspace";
import {
  activityOf,
  type PreparationStep,
} from "@/lib/process/preparation-workflow";
import { ModuleScope } from "../module-workspace";
import type { Context } from "../command-center/shared";
export default function StepActivity({
  step,
  context,
}: {
  step: PreparationStep;
  context: Context;
}) {
  const activity = activityOf(step);
  return (
    <ModuleScope active={false}>
      <div className="prep-activity">
        {activity === "thesis" && (
          <ThesisWorkspace
            {...context}
            visibleFields={step.thesisFields}
            initialScope={
              step.verification === "weekly-thesis" ? "weekly" : "daily"
            }
          />
        )}
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
        {activity === "missions" && (
          <>
            <MissionsPanel {...context} />
            <button onClick={() => context.props.onPage("Missions")}>
              Create or edit a reusable mission
            </button>
          </>
        )}
        {activity === "intentions" && (
          <p className="cc-muted">
            Write your intentions in the questions below. Daily and per-session
            intentions also appear as your Command Center process goal.
          </p>
        )}
      </div>
    </ModuleScope>
  );
}
