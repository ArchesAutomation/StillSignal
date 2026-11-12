import { activeObservations } from "../environment/values";
import type { Session } from "../model";
import { isActualExecution } from "../trade-context";
import {
  dateInZone,
  latest,
  type BodyOf,
  type ProcessRecord,
  type RecordOf,
} from "./model";
import { preparation } from "./engine";
export function periodRecords(
  records: ProcessRecord[],
  start: string,
  end: string,
) {
  const days = latest(records, "day").filter(
      (d) => d.body.date >= start && d.body.date <= end,
    ),
    ids = new Set(days.map((d) => d.rootId));
  const runs = latest(records, "run").filter((r) => ids.has(r.body.dayId)),
    runIds = new Set(runs.map((r) => r.id));
  return {
    days,
    runs,
    observations: activeObservations(records).filter((o) =>
      ids.has(o.body.dayId),
    ),
    checkins: latest(records, "checkin").filter((c) => ids.has(c.body.dayId)),
    responses: latest(records, "response").filter((r) =>
      runIds.has(r.body.runId),
    ),
  };
}
export function auditSnapshot(
  records: ProcessRecord[],
  sessions: Session[],
  start: string,
  end: string,
  timezone: string,
): BodyOf<"audit">["snapshot"] {
  const p = periodRecords(records, start, end),
    included = sessions.filter(
      (s) =>
        !s.demo &&
        dateInZone(s.startedAt, timezone) >= start &&
        dateInZone(s.startedAt, timezone) <= end,
    );
  const executions = included.flatMap((s) =>
    s.events.filter(isActualExecution),
  );
  return {
    days: p.days.length,
    sessions: included.length,
    executions: executions.length,
    preparationComplete: p.days.filter((d) => {
      const prep = preparation(records, d.rootId);
      return prep.total > 0 && prep.complete === prep.total;
    }).length,
    // Rule checks and trade reviews are retired. These fields stay in the saved
    // audit format so older audits remain readable; new audits record zero.
    knownRules: 0,
    unknownRules: 0,
    brokenRules: 0,
    unreviewedTrades: 0,
    hrSessions: included.filter((s) => s.sampleCount > 0).length,
    observationCount: p.observations.filter(
      (o) => o.body.missing === "recorded",
    ).length,
  };
}
export function goalProgress(goal: RecordOf<"goal">, records: ProcessRecord[]) {
  const p = periodRecords(records, goal.body.start, goal.body.end),
    source = goal.body.source;
  let evidence: ProcessRecord[] = [],
    value = 0;
  if (source === "preparation")
    evidence = p.days.filter((d) => {
      const prep = preparation(records, d.rootId);
      return prep.total > 0 && prep.complete === prep.total;
    });
  if (source === "checkin")
    evidence = p.days.filter((d) =>
      p.checkins.some((c) => c.body.dayId === d.rootId),
    );
  if (source === "audit")
    evidence = latest(records, "audit").filter(
      (a) => a.body.start >= goal.body.start && a.body.end <= goal.body.end,
    );
  if (source === "observation")
    evidence = p.observations.filter(
      (o) =>
        o.body.missing === "recorded" &&
        (!goal.body.variableId ||
          records.find((r) => r.id === o.body.definitionId)?.rootId ===
            goal.body.variableId),
    );
  // "rule-adherence" goals came from retired rule checks; they no longer gain progress.
  if (source === "manual") {
    evidence = latest(records, "progress").filter(
      (r) =>
        r.body.goalId === goal.rootId &&
        r.body.method === "manual" &&
        p.days.some((d) => d.rootId === r.body.dayId),
    );
    value = evidence.reduce(
      (sum, r) => sum + (r.kind === "progress" ? r.body.value : 0),
      0,
    );
  } else value = evidence.length;
  return {
    value,
    target: goal.body.target,
    fraction: Math.min(1, value / goal.body.target),
    complete: value >= goal.body.target,
    evidence,
  };
}
