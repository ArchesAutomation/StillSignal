import type { Session, TradeEvent } from "../model.ts";
import { isActualExecution } from "../trade-context.ts";
import { validateValue } from "../environment/values.ts";
import {
  activityEvidenceError,
  activityOf,
  answerError,
  preparationResponse,
  scheduledOn,
} from "./preparation-workflow.ts";
import { thesisMatchesDay, thesisMatchesInstrument } from "./thesis.ts";
import { activePreparationSteps } from "./active-preparation.ts";
import {
  createRecord,
  dateInZone,
  isLiveKind,
  latest,
  type ProcessRecord,
  type RecordOf,
  type Kind,
} from "./model.ts";
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
      if (stepEvidence && isLiveKind(stepEvidence.kind)) add(stepEvidence.kind, stepEvidence.id);
    }
  }
  if (r.kind === "thesis") add("thesis", r.body.weeklyId);
  if (r.kind === "observation") add("variable", r.body.definitionId);
  if (r.kind === "progress") add("goal", r.body.goalId);
  if (r.kind === "goal") add("variable", r.body.variableId);
  // Older records may still point at retired playbooks/assessments; those links are not required.
  const kept = r.refs.filter((ref) => isLiveKind(ref.kind));
  return [
    ...new Map(
      [...refs, ...kept].map((ref) => [ref.kind + ref.id, ref]),
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
  includeArchived = false,
) {
  const runs = latest(records, "run", at).filter((r) => r.body.dayId === dayId);
  let total = 0,
    complete = 0,
    unknown = 0,
    skipped = 0,
    excluded = 0,
    sections = 0,
    resolved = 0,
    omissions = 0;
  const completions: number[] = [];
  const day = latest(records, "day", at).find((d) => d.rootId === dayId);
  for (const run of runs)
    for (const step of includeArchived ? run.body.steps : activePreparationSteps(run.body.steps)) {
      const response = preparationResponse(records, run, step, at);
      if (!day || scheduledOn(step, day.body.date)) {
        sections++;
        if (
          ["complete", "skipped", "not-applicable"].includes(
            response?.body.status ?? "",
          )
        )
          resolved++;
        if (
          response?.body.status === "skipped" ||
          response?.body.skippedPromptIds?.length
        )
          omissions++;
      }
      if (step.requirement === "optional") continue;
      if (day && !scheduledOn(step, day.body.date)) {
        excluded++;
        continue;
      }
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
        completions.push(
          Math.max(run.body.startedAt, response.body.completedAt!),
        );
      } else if (!response || response.body.status === "unverified") unknown++;
      else if (response.body.status === "skipped") skipped++;
    }
  return {
    runs,
    sections,
    resolved,
    omissions,
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
  return [
    ...latest(records, "checkin", now),
    ...latest(records, "thesis", now),
  ]
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
            thesisMatchesInstrument(r, instrument ?? "") &&
            !!(
              r.body.primary.trim() ||
              r.body.notes.trim() ||
              r.body.noTrade.trim() ||
              r.body.structure.trim() ||
              (activityOf(step) === "thesis" &&
                [
                  r.body.events,
                  r.body.levels,
                  r.body.liquidity,
                  r.body.alternate,
                  r.body.entries,
                  r.body.invalidation,
                  r.body.targets,
                  ...r.body.screenshots,
                ].some((value) => value.trim()))
            ) &&
            !!day &&
            thesisMatchesDay(r, day) &&
            (step.verification === "daily-thesis"
              ? r.body.scope !== "weekly"
              : r.body.scope === "weekly")),
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
    for (const ref of requiredRefs(row)) if (isLiveKind(ref.kind)) get(ref.kind, ref.id);
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
      const requirement = run.body.steps.find((s) => s.id === row.body.stepId);
      if (row.body.status === "complete" && requirement) {
        const message =
          answerError(
            requirement,
            row.body.answers ?? [],
            row.body.skippedPromptIds,
          ) || activityEvidenceError(records, run.body.dayId, requirement);
        if (message) throw new Error(message);
        if (
          (requirement.activity === "thesis" ||
            requirement.activity === "checkin") &&
          !verificationEvidence(records, run, requirement.id, row.createdAt)
        )
          throw new Error(
            "Save the supporting thesis or check-in before completing this section.",
          );
      }
      if (
        row.body.skippedPromptIds?.some(
          (id) =>
            !requirement?.allowReflectionSkip ||
            !requirement.prompts?.some((p) => p.id === id) ||
            row.body.answers?.some((a) => a.id === id && a.value.trim()),
        )
      )
        throw new Error(
          "Skipped questions must belong to this section and have no answer.",
        );
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
      if (row.body.status === "not-applicable" && !row.body.reason.trim())
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
      (row.kind === "observation" || row.kind === "checkin") &&
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
  "process",
  "temperature",
  "missions",
  "physiology",
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
