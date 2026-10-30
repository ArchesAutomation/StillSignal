import { activeObservations } from "../environment/values.ts";
import type { Session } from "../model.ts";
import { isActualExecution } from "../trade-context.ts";
import {
  dateInZone,
  latest,
  type BodyOf,
  type ProcessRecord,
  type RecordOf,
} from "./model.ts";
import { preparation, processScore } from "./engine.ts";
export function periodRecords(
  records: ProcessRecord[],
  start: string,
  end: string,
) {
  const days = latest(records, "day").filter(
      (d) => d.body.date >= start && d.body.date <= end,
    ),
    ids = new Set(days.map((d) => d.rootId));
  const assessments = latest(records, "assessment").filter((a) =>
      ids.has(a.body.dayId),
    ),
    assessmentIds = new Set(assessments.map((a) => a.id));
  const runs = latest(records, "run").filter((r) => ids.has(r.body.dayId)),
    runIds = new Set(runs.map((r) => r.id));
  return {
    days,
    assessments,
    runs,
    observations: activeObservations(records).filter((o) =>
      ids.has(o.body.dayId),
    ),
    checkins: latest(records, "checkin").filter((c) => ids.has(c.body.dayId)),
    evaluations: latest(records, "evaluation").filter((e) =>
      assessmentIds.has(e.body.assessmentId),
    ),
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
    ),
    reviewed = new Set(
      p.assessments.flatMap((a) =>
        a.body.tradeId && a.body.sessionId
          ? [a.body.sessionId + ":" + a.body.tradeId]
          : [],
      ),
    );
  let knownRules = 0,
    unknownRules = 0,
    brokenRules = 0;
  for (const a of p.assessments) {
    const book = records.find(
      (r): r is RecordOf<"playbook"> =>
        r.kind === "playbook" && r.id === a.body.playbookId,
    );
    if (!book) continue;
    const score = processScore(
      p.evaluations.filter((e) => e.body.assessmentId === a.id),
      book.body.rules,
    );
    knownRules += score.known;
    unknownRules += score.unknown;
    brokenRules += score.broken;
  }
  return {
    days: p.days.length,
    sessions: included.length,
    executions: executions.length,
    preparationComplete: p.days.filter((d) => {
      const prep = preparation(records, d.rootId);
      return prep.total > 0 && prep.complete === prep.total;
    }).length,
    knownRules,
    unknownRules,
    brokenRules,
    hrSessions: included.filter((s) => s.sampleCount > 0).length,
    observationCount: p.observations.filter(
      (o) => o.body.missing === "recorded",
    ).length,
    unreviewedTrades: included.reduce(
      (n, s) =>
        n +
        s.events
          .filter(isActualExecution)
          .filter((e) => !reviewed.has(s.id + ":" + e.id)).length,
      0,
    ),
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
  if (source === "rule-adherence")
    evidence = p.evaluations.filter(
      (e) =>
        (!goal.body.ruleId || e.body.ruleId === goal.body.ruleId) &&
        e.body.adherence === "followed",
    );
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
