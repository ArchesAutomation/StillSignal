import type { Session } from "../model";
import { isActualExecution } from "../trade-context";
import { latest, type ProcessRecord } from "./model";
export type ReplayEvent = {
  id: string;
  at: number;
  occurredAt: number;
  type: string;
  label: string;
  detail: string;
  source: string;
  approximate: boolean;
};
/** The cursor uses record availability, not backdated observation or execution time. */
export function replayTimeline(
  records: ProcessRecord[],
  dayId: string,
  session: Session,
): ReplayEvent[] {
  const runs = new Set(
    records
      .filter((r) => r.kind === "run" && r.body.dayId === dayId)
      .map((r) => r.id),
  );
  const assessments = new Set(
    records
      .filter((r) => r.kind === "assessment" && r.body.dayId === dayId)
      .map((r) => r.id),
  );
  const weekly = new Set(
    records
      .filter((r) => r.kind === "thesis" && r.body.dayId === dayId)
      .flatMap((r) =>
        r.kind === "thesis" && r.body.weeklyId ? [r.body.weeklyId] : [],
      ),
  );
  const events: ReplayEvent[] = records
    .filter(
      (r) =>
        ("dayId" in r.body && r.body.dayId === dayId) ||
        (r.kind === "response" && runs.has(r.body.runId)) ||
        (r.kind === "evaluation" && assessments.has(r.body.assessmentId)) ||
        weekly.has(r.id),
    )
    .map((r) => ({
      id: r.id,
      at: r.createdAt,
      occurredAt: "observedAt" in r.body ? r.body.observedAt : r.createdAt,
      type: r.kind,
      label:
        r.kind === "thesis"
          ? `${r.body.scope} thesis · v${r.revision}`
          : `${r.kind} · v${r.revision}`,
      detail:
        r.kind === "thesis"
          ? `${r.body.bias}: ${r.body.primary}`
          : r.kind === "response"
            ? `${r.body.status} · ${r.body.reason}`
            : r.kind === "evaluation"
              ? `${r.body.adherence} · ${r.body.reason}`
              : r.kind === "assessment"
                ? `${r.body.retrospective ? "Retrospective" : "Pre-trade"}: ${r.body.notes}`
                : r.kind === "observation"
                  ? `${r.body.missing}: ${r.body.value ?? "No value"}`
                  : r.kind === "checkin"
                    ? r.body.reflection
                    : "Saved source record",
      source: "Process record " + r.id,
      approximate: false,
    }));
  for (const e of session.events.filter(isActualExecution))
    events.push({
      id: session.id + ":" + e.id,
      at: Math.max(e.t, e.receivedAt ?? e.t),
      occurredAt: e.t,
      type: "execution",
      label: `${e.symbol} · ${e.kind}`,
      detail: `${e.side} · ${e.quantity} @ ${e.price}`,
      source: e.source,
      approximate:
        e.receivedAt === undefined ||
        e.timePrecision === "day" ||
        e.timestampSource === "order-update",
    });
  // Mutable journal snapshots cannot reconstruct their earlier text after an edit.
  for (const note of session.journal.filter((n) => !n.deletedAt))
    events.push({
      id: session.id + ":" + note.id,
      at: Math.max(note.t, note.updatedAt ?? note.t),
      occurredAt: note.eventTime ?? note.t,
      type: "journal",
      label: note.label || "Journal entry",
      detail: note.text,
      source: note.source ?? "journal",
      approximate: !!note.updatedAt,
    });
  return events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
export function replayContext(
  records: ProcessRecord[],
  dayId: string,
  at: number,
) {
  const available = records.filter((r) => r.createdAt <= at);
  return {
    available,
    theses: latest(available, "thesis", at).filter(
      (t) => t.body.dayId === dayId,
    ),
    assessments: latest(available, "assessment", at).filter(
      (a) => a.body.dayId === dayId,
    ),
  };
}
