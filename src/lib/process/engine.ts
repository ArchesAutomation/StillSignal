import type { Session, TradeEvent } from "../model";
import { isActualExecution } from "../trade-context";
import { validateValue } from "../environment/values";
import {
  createRecord,
  dateInZone,
  latest,
  type ProcessRecord,
  type RecordOf,
  type Kind,
  type Rule,
} from "./model";
export function requiredRefs(r: ProcessRecord): ProcessRecord["refs"] {
  const refs: ProcessRecord["refs"] = [];
  const add = (kind: Kind, id: string | undefined) => {
    if (id) refs.push({ kind, id });
  };
  if (r.previousId) add(r.kind, r.previousId);
  const b = r.body;
  if ("dayId" in b) add("day", b.dayId);
  if (r.kind === "run") add("protocol", r.body.templateId);
  if (r.kind === "response") {
    add("run", r.body.runId);
    if (r.body.evidenceId) {
      const stepEvidence = r.refs.find((x) => x.id === r.body.evidenceId);
      if (stepEvidence) add(stepEvidence.kind, stepEvidence.id);
    }
  }
  if (r.kind === "thesis") add("thesis", r.body.weeklyId);
  if (r.kind === "observation") add("variable", r.body.definitionId);
  if (r.kind === "assessment") add("playbook", r.body.playbookId);
  if (r.kind === "evaluation") add("assessment", r.body.assessmentId);
  if (r.kind === "progress") add("goal", r.body.goalId);
  if (r.kind === "goal") add("variable", r.body.variableId);
  return [
    ...new Map(
      [...refs, ...r.refs].map((ref) => [ref.kind + ref.id, ref]),
    ).values(),
  ];
}
export function withRefs<T extends ProcessRecord>(row: T): T {
  return { ...row, refs: requiredRefs(row) };
}
export function dayRecords(records: ProcessRecord[], dayId: string) {
  return records.filter((r) =>
    r.kind === "day"
      ? r.rootId === dayId
      : "dayId" in r.body && r.body.dayId === dayId,
  );
}
export function preparation(
  records: ProcessRecord[],
  dayId: string,
  at = Infinity,
) {
  const runs = latest(records, "run", at).filter((r) => r.body.dayId === dayId);
  let total = 0,
    complete = 0,
    unknown = 0,
    skipped = 0,
    excluded = 0;
  const completions: number[] = [];
  for (const run of runs)
    for (const step of run.body.steps) {
      const response = latest(records, "response", at)
        .filter((r) => r.body.runId === run.id && r.body.stepId === step.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (step.requirement === "optional") continue;
      if (response?.body.status === "not-applicable") {
        excluded++;
        continue;
      }
      total++;
      if (
        response?.body.status === "complete" &&
        response.body.completedAt! <= at
      ) {
        complete++;
        completions.push(response.body.completedAt!);
      } else if (!response || response.body.status === "unverified") unknown++;
      else if (response.body.status === "skipped") skipped++;
    }
  return {
    runs,
    total,
    complete,
    unknown,
    skipped,
    excluded,
    percent: total ? (100 * complete) / total : null,
    startedAt: runs.length
      ? Math.min(...runs.map((r) => r.body.startedAt))
      : null,
    finishedAt:
      total > 0 && total === complete ? Math.max(...completions) : null,
  };
}
export function thesisAt(
  records: ProcessRecord[],
  dayId: string,
  instrument: string,
  t: number,
) {
  return records
    .filter(
      (r): r is RecordOf<"thesis"> =>
        r.kind === "thesis" &&
        !r.archived &&
        r.body.dayId === dayId &&
        r.body.instrument === instrument &&
        r.createdAt <= t,
    )
    .sort((a, b) => b.createdAt - a.createdAt || b.revision - a.revision)[0];
}
export function processScore(
  evaluations: RecordOf<"evaluation">[],
  rules: Rule[],
) {
  let numerator = 0,
    denominator = 0,
    eligible = 0,
    known = 0,
    unknown = 0,
    excluded = 0,
    broken = 0;
  for (const rule of rules) {
    const e = evaluations.find((x) => x.body.ruleId === rule.id)?.body;
    if (e?.adherence === "not-applicable") {
      excluded++;
      continue;
    }
    eligible++;
    if (!e || e.adherence === "unknown") {
      unknown++;
      continue;
    }
    known++;
    denominator += rule.weight;
    numerator +=
      rule.weight *
      (e.adherence === "followed" ? 1 : e.adherence === "partial" ? 0.5 : 0);
    if (e.adherence === "broken") broken++;
  }
  return {
    score: denominator ? (100 * numerator) / denominator : null,
    coverage: eligible ? known / eligible : null,
    known,
    unknown,
    excluded,
    broken,
  };
}
export function evaluateRule(
  rule: Rule,
  event: TradeEvent,
  day: RecordOf<"day">,
  records: ProcessRecord[],
) {
  const result = (
    adherence: RecordOf<"evaluation">["body"]["adherence"],
    reason: string,
    evidenceIds: string[] = [],
  ) => ({ adherence, reason, evidenceIds });
  if (rule.verification === "manual")
    return result("unknown", "Requires the trader's review.");
  if (!isActualExecution(event))
    return result("unknown", "No confirmed execution.");
  if (rule.verification === "max-size")
    return rule.limit === undefined
      ? result("unknown", "No size limit.")
      : result(
          event.quantity <= rule.limit ? "followed" : "broken",
          `${event.quantity} execution units; limit ${rule.limit}. Cumulative position size is not inferred.`,
          [event.id],
        );
  if (event.timePrecision === "day" || event.timestampSource === "order-update")
    return result(
      "unknown",
      "Exact execution time is unavailable (date-only or approximate order-update import).",
    );
  if (rule.verification === "time-window") {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: day.body.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(event.t));
    const minute =
      Number(parts.find((p) => p.type === "hour")!.value) * 60 +
      Number(parts.find((p) => p.type === "minute")!.value);
    if (rule.startMinute === undefined || rule.endMinute === undefined)
      return result("unknown", "No time window.");
    const inside =
      rule.startMinute <= rule.endMinute
        ? minute >= rule.startMinute && minute <= rule.endMinute
        : minute >= rule.startMinute || minute <= rule.endMinute;
    return result(
      inside ? "followed" : "broken",
      `Execution checked in ${day.body.timezone}.`,
      [event.id],
    );
  }
  if (rule.verification === "preparation") {
    const p = preparation(records, day.rootId, event.t);
    if (!p.runs.length || p.unknown)
      return result(
        "unknown",
        "Preparation evidence is missing or unverified.",
      );
    return p.total
      ? result(
          p.complete === p.total ? "followed" : "broken",
          `${p.complete}/${p.total} applicable required steps complete before execution.`,
          p.runs.map((r) => r.id),
        )
      : result("not-applicable", "No applicable required steps.");
  }
  const thesis = thesisAt(records, day.rootId, event.symbol, event.t);
  if (!thesis || event.side === "unknown" || event.kind === "exit")
    return result("unknown", "No applicable entry-direction evidence.");
  if (thesis.body.bias === "neutral")
    return result("not-applicable", "Recorded thesis was neutral.");
  return result(
    thesis.body.bias === (event.side === "long" ? "bullish" : "bearish")
      ? "followed"
      : "broken",
    `Compared with thesis revision ${thesis.revision} available at execution.`,
    [event.id, thesis.id],
  );
}
export function verificationEvidence(
  records: ProcessRecord[],
  run: RecordOf<"run">,
  stepId: string,
  now: number,
) {
  const step = run.body.steps.find((x) => x.id === stepId);
  if (!step || step.verification === "manual") return undefined;
  const day = latest(records, "day", run.createdAt).find(
    (d) => d.rootId === run.body.dayId,
  );
  const template = records.find(
    (r) => r.kind === "protocol" && r.id === run.body.templateId,
  );
  const instrument =
    template?.kind === "protocol"
      ? template.body.instrument || day?.body.instrument
      : day?.body.instrument;
  return records
    .filter(
      (r) =>
        r.createdAt <= now &&
        !r.archived &&
        (step.verification === "checkin"
          ? r.kind === "checkin" &&
            r.body.dayId === run.body.dayId &&
            (r.body.answers.some((a) => a.value !== null) ||
              !!(
                r.body.physical.trim() ||
                r.body.circumstances.trim() ||
                r.body.reflection.trim()
              ))
          : r.kind === "thesis" &&
            (!instrument || r.body.instrument === instrument) &&
            !!(
              r.body.primary.trim() ||
              r.body.notes.trim() ||
              r.body.noTrade.trim() ||
              r.body.structure.trim()
            ) &&
            (step.verification === "daily-thesis"
              ? r.body.dayId === run.body.dayId && r.body.scope !== "weekly"
              : r.body.scope === "weekly" &&
                !!day &&
                r.body.periodStart <= day.body.date &&
                day.body.date <=
                  new Date(
                    Date.parse(r.body.periodStart + "T12:00:00Z") +
                      6 * 86400000,
                  )
                    .toISOString()
                    .slice(0, 10))),
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}
export function validateAppend(
  existing: ProcessRecord[],
  batch: ProcessRecord[],
  sessions: Session[],
) {
  const records = [...existing];
  const get = <K extends Kind>(kind: K, id: string): RecordOf<K> => {
    const found = records.find((r) => r.kind === kind && r.id === id);
    if (!found)
      throw new Error(
        `Missing ${kind} evidence. Sync or open its source first.`,
      );
    return found as RecordOf<K>;
  };
  for (const row of batch) {
    const duplicate = records.find((r) => r.id === row.id);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(row))
        throw new Error("Idempotency conflict.");
      continue;
    }
    const previous = latest(records, row.kind, Infinity, true).find(
      (r) => r.rootId === row.rootId,
    );
    if (
      row.revision > 1 &&
      (!previous ||
        previous.id !== row.previousId ||
        row.revision !== previous.revision + 1 ||
        row.createdAt < previous.createdAt)
    )
      throw new Error(
        "This record changed on another device. Refresh before saving a new revision.",
      );
    if (row.createdAt > Date.now() + 300000)
      throw new Error("Record time is in the future.");
    for (const ref of requiredRefs(row)) get(ref.kind, ref.id);
    if (row.kind === "day") {
      if (
        previous &&
        previous.kind === "day" &&
        (previous.body.date !== row.body.date ||
          previous.body.timezone !== row.body.timezone)
      )
        throw new Error("Day date and timezone are immutable.");
      if (
        latest(records, "day").some(
          (d) =>
            d.rootId !== row.rootId &&
            d.body.date === row.body.date &&
            d.body.timezone === row.body.timezone,
        )
      )
        throw new Error(
          "This trading day already exists. Refresh the workspace.",
        );
      if (
        row.body.sessionIds.some(
          (id) => !sessions.some((s) => s.id === id && !s.demo),
        )
      )
        throw new Error("Session is unavailable.");
    }
    if (row.kind === "run") {
      const template = get("protocol", row.body.templateId);
      if (
        previous?.kind === "run" &&
        JSON.stringify(previous.body) !== JSON.stringify(row.body)
      )
        throw new Error(
          "An actual preparation run retains its original requirements and start time.",
        );
      if (
        JSON.stringify(row.body.steps) !== JSON.stringify(template.body.steps)
      )
        throw new Error("Run must preserve its template version.");
    }
    if (row.kind === "response") {
      const run = get("run", row.body.runId);
      if (
        previous?.kind === "response" &&
        (previous.body.runId !== row.body.runId ||
          previous.body.stepId !== row.body.stepId)
      )
        throw new Error(
          "A preparation response cannot be moved to another requirement.",
        );
      if (
        row.body.completedAt !== undefined &&
        (row.body.completedAt < run.body.startedAt ||
          row.body.completedAt > row.createdAt + 300000)
      )
        throw new Error(
          "Completion time must belong to this actual preparation run.",
        );
      if (!run.body.steps.some((s) => s.id === row.body.stepId))
        throw new Error("Unknown checklist requirement.");
      if (row.body.method === "verified") {
        const evidence = verificationEvidence(
          records,
          run,
          row.body.stepId,
          row.createdAt,
        );
        if (
          !evidence ||
          evidence.id !== row.body.evidenceId ||
          row.body.status !== "complete"
        )
          throw new Error(
            "Automatic completion requires its supporting record.",
          );
      }
      if (
        ["skipped", "not-applicable"].includes(row.body.status) &&
        !row.body.reason.trim()
      )
        throw new Error(
          "Record a reason for skipping or excluding a requirement.",
        );
    }
    if (row.kind === "observation") {
      validateValue(get("variable", row.body.definitionId), row.body);
      if (
        row.body.source === "manual" &&
        row.body.observedAt > row.createdAt + 300000
      )
        throw new Error("Observation cannot be in the future.");
    }
    if (row.kind === "thesis" && row.body.scope !== "weekly" && !row.body.dayId)
      throw new Error("Daily and intraday theses require a trading day.");
    if (
      (row.kind === "assessment" || row.kind === "observation") &&
      row.body.sessionId
    ) {
      const session = sessions.find(
        (s) => s.id === row.body.sessionId && !s.demo,
      );
      if (!session) throw new Error("Session is unavailable.");
      if (
        row.body.tradeId &&
        !session.events.some(
          (e) => e.id === row.body.tradeId && isActualExecution(e),
        )
      )
        throw new Error("Execution is unavailable.");
      if (row.kind === "assessment") {
        const event = session.events.find((e) => e.id === row.body.tradeId);
        const playbook = get("playbook", row.body.playbookId);
        const linkingOnly =
          previous?.kind === "assessment" &&
          !previous.body.tradeId &&
          JSON.stringify({
            ...previous.body,
            sessionId: row.body.sessionId,
            tradeId: row.body.tradeId,
          }) === JSON.stringify(row.body);
        const recordedAt = linkingOnly ? previous!.createdAt : row.createdAt;
        if (
          event &&
          ((playbook.createdAt > event.t && !row.body.retrospective) ||
            ((row.body.assessedAt > event.t || recordedAt > event.t) &&
              !row.body.retrospective))
        )
          throw new Error(
            "A review entered after execution must be marked retrospective.",
          );
      }
    }
    if (row.kind === "assessment" && !row.body.tradeId && !row.body.planned)
      throw new Error("Record a planned setup or select an execution.");
    if (row.kind === "assessment" && row.body.tradeId && !row.body.sessionId)
      throw new Error("An execution requires its session.");
    if (row.kind === "evaluation") {
      const assessment = get("assessment", row.body.assessmentId),
        playbook = get("playbook", assessment.body.playbookId);
      const rule = playbook.body.rules.find((r) => r.id === row.body.ruleId);
      if (!rule)
        throw new Error("Rule does not belong to the pinned playbook.");
      if (row.body.method === "verified") {
        const day = latest(records, "day").find(
          (d) => d.rootId === assessment.body.dayId,
        )!;
        const event = sessions
          .find((s) => s.id === assessment.body.sessionId)
          ?.events.find((e) => e.id === assessment.body.tradeId);
        if (!event || !day) throw new Error("Execution evidence unavailable.");
        const expected = evaluateRule(rule, event, day, records);
        if (
          row.body.adherence !== expected.adherence ||
          JSON.stringify(row.body.evidenceIds) !==
            JSON.stringify(expected.evidenceIds)
        )
          throw new Error("Rule verification does not match evidence.");
      }
    }
    if (row.kind === "progress" && row.body.method === "verified")
      throw new Error(
        "Automatic mission progress is derived from its evidence sources, not manually assigned.",
      );
    records.push(row);
  }
  return records;
}
export function sessionsForDay(sessions: Session[], day: RecordOf<"day">) {
  return sessions.filter(
    (s) =>
      !s.demo &&
      (day.body.sessionIds.includes(s.id) ||
        dateInZone(s.startedAt, day.body.timezone) === day.body.date),
  );
}
export const defaultPanels = [
  "preparation",
  "thesis",
  "temperature",
  "missions",
  "physiology",
  "process",
] as const;
export function defaultLayout() {
  return createRecord("layout", {
    name: "Original workspace",
    isDefault: true,
    showMarket: true,
    panels: defaultPanels.map((id) => ({
      id,
      visible: true,
      width: "normal" as const,
    })),
    statusWidgets: [
      "session",
      "preparation",
      "readiness",
      "thesis",
      "review",
      "goal",
    ],
  });
}
