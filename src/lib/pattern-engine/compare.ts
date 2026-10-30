import type { Sample, Session, TradeEvent } from "../model";
import { isActualExecution } from "../trade-context";
import { reconstructTrades } from "../smart-journal";
import { observationsAt } from "../environment/values";
import { preparation, processScore, thesisAt } from "../process/engine";
import { dateInZone, latest, type ProcessRecord } from "../process/model";
import { analyticalSamples, eventPhysiology } from "./physiology";
export type EvidenceRow = {
  id: string;
  day: string;
  session: Session;
  event: TradeEvent;
  strategy: string | null;
  process: number | null;
  ruleCoverage: number | null;
  preparation: number | null;
  thesisId?: string;
  bias?: string;
  checkinId?: string;
  physiology: ReturnType<typeof eventPhysiology>;
  variables: ReturnType<typeof observationsAt>;
  indexInDay: number;
  sinceLoss: boolean | null;
};
export function buildEvidence(
  records: ProcessRecord[],
  sessions: Session[],
  samples: Map<string, Sample[]>,
  baselineSeconds = 300,
  threshold = 20,
): EvidenceRow[] {
  const days = latest(records, "day"),
    rows: EvidenceRow[] = [],
    seen = new Set<string>(),
    counters = new Map<string, number>(),
    allExecutions = sessions
      .filter((s) => !s.demo)
      .flatMap((s) => s.events.filter(isActualExecution))
      .sort((a, b) => a.t - b.t);
  for (const session of [...sessions]
    .filter((s) => !s.demo)
    .sort((a, b) => a.startedAt - b.startedAt)) {
    const executions = session.events
        .filter(isActualExecution)
        .sort((a, b) => a.t - b.t),
      positions = reconstructTrades(executions);
    for (const event of executions.filter((e) => e.kind !== "exit")) {
      const key = session.id + ":" + event.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = days.find(
        (d) => dateInZone(event.t, d.body.timezone) === d.body.date,
      );
      if (!day) continue;
      const assessment = latest(records, "assessment")
          .filter(
            (a) =>
              a.body.sessionId === session.id && a.body.tradeId === event.id,
          )
          .sort((a, b) => b.createdAt - a.createdAt)[0],
        book =
          assessment &&
          records.find(
            (r) => r.kind === "playbook" && r.id === assessment.body.playbookId,
          ),
        score =
          assessment && book?.kind === "playbook"
            ? processScore(
                latest(records, "evaluation").filter(
                  (e) => e.body.assessmentId === assessment.id,
                ),
                book.body.rules,
              )
            : undefined;
      const thesis =
          event.timePrecision === "day" ||
          event.timestampSource === "order-update"
            ? undefined
            : thesisAt(records, day.rootId, event.symbol, event.t),
        checkin = latest(records, "checkin")
          .filter(
            (c) => c.body.dayId === day.rootId && c.body.observedAt <= event.t,
          )
          .sort((a, b) => b.body.observedAt - a.body.observedAt)[0];
      const matched = positions.filter((p) => p.entryEventId === event.id),
        totalClosed = matched.reduce((s, p) => s + p.quantity, 0),
        exit =
          totalClosed >= event.quantity - 1e-8 &&
          matched.every((p) => p.exit !== undefined)
            ? Math.max(...matched.map((p) => p.exit!))
            : undefined;
      const before = allExecutions
        .filter(
          (e) =>
            e.t < event.t &&
            e.kind === "exit" &&
            e.pnl !== undefined &&
            e.timePrecision !== "day" &&
            (e.broker?.accountId || e.account || "") ===
              (event.broker?.accountId || event.account || "") &&
            dateInZone(e.t, day.body.timezone) === day.body.date,
        )
        .at(-1);
      const indexInDay = (counters.get(day.rootId) ?? 0) + 1;
      counters.set(day.rootId, indexInDay);
      rows.push({
        id: key,
        day: day.body.date,
        session,
        event,
        strategy: book?.kind === "playbook" ? book.body.name : null,
        process: score?.score ?? null,
        ruleCoverage: score?.coverage ?? null,
        preparation:
          event.timePrecision === "day" ||
          event.timestampSource === "order-update"
            ? null
            : preparation(records, day.rootId, event.t).percent,
        thesisId: thesis?.id,
        bias: thesis?.body.bias,
        checkinId: checkin?.id,
        physiology: eventPhysiology(
          analyticalSamples(session, samples.get(session.id) ?? []),
          event,
          exit,
          baselineSeconds,
          threshold,
        ),
        variables:
          event.timePrecision === "day" ||
          event.timestampSource === "order-update"
            ? []
            : observationsAt(
                records,
                day.rootId,
                event.t,
                session.id,
                event.id,
              ),
        indexInDay,
        sinceLoss: before ? before.pnl! < 0 : null,
      });
    }
  }
  const ordered = rows.sort((a, b) => a.event.t - b.event.t);
  counters.clear();
  for (const row of ordered) {
    row.indexInDay = (counters.get(row.day) ?? 0) + 1;
    counters.set(row.day, row.indexInDay);
  }
  return ordered;
}
export const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
export function describe(values: number[]) {
  const n = values.length,
    mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
  return {
    n,
    mean,
    median: median(values),
    sd:
      n > 1
        ? Math.sqrt(
            values.reduce((sum, v) => sum + (v - mean!) ** 2, 0) / (n - 1),
          )
        : null,
    min: n ? Math.min(...values) : null,
    max: n ? Math.max(...values) : null,
  };
}
export type Metric =
  | "hr-mean"
  | "hr-peak"
  | "hr-rate"
  | "hr-duration"
  | "hr-recovery"
  | "process"
  | "preparation";
export function metricValue(row: EvidenceRow, metric: Metric, window: string) {
  const w = row.physiology.windows[window];
  return metric === "process"
    ? row.process
    : metric === "preparation"
      ? row.preparation
      : metric === "hr-recovery"
        ? row.physiology.recovery
        : metric === "hr-peak"
          ? (w?.maximumDeviation ?? null)
          : metric === "hr-rate"
            ? (w?.ratePerMinute ?? null)
            : metric === "hr-duration"
              ? (w?.aboveSeconds ?? null)
              : (w?.meanDeviation ?? null);
}
export type ComparisonGroup = {
  key: string;
  values: number[];
  rows: EvidenceRow[];
  stats: ReturnType<typeof describe>;
  days: number;
  sessions: number;
  coverage: number | null;
};
/** Partition on definition ID: old numeric units/types/choices never mix silently. */
export function compare(
  rows: EvidenceRow[],
  metric: Metric,
  window: string,
  variableId: string,
  split?: number,
  secondVariable?: string,
) {
  const groups = new Map<string, { values: number[]; rows: EvidenceRow[] }>();
  let excluded = 0;
  for (const row of rows) {
    const value = metricValue(row, metric, window),
      observation = row.variables.find(
        (v) => v.definition.rootId === variableId,
      ),
      second = secondVariable
        ? row.variables.find((v) => v.definition.rootId === secondVariable)
        : undefined;
    if (
      value === null ||
      !observation ||
      observation.observation.body.missing !== "recorded" ||
      (secondVariable &&
        (!second || second.observation.body.missing !== "recorded"))
    ) {
      excluded++;
      continue;
    }
    const label = (item: NonNullable<typeof observation>) => {
      const v = item.observation.body.value;
      const group =
        typeof v === "number" && split !== undefined
          ? v < split
            ? `< ${split}`
            : `≥ ${split}`
          : Array.isArray(v)
            ? [...v].sort().join(", ") || "Empty selection"
            : String(v);
      return `${item.definition.body.name} v${item.definition.revision} (${item.definition.body.unit || item.definition.body.type}): ${group}`;
    };
    const key = label(observation) + (second ? " / " + label(second) : ""),
      group = groups.get(key) ?? { values: [], rows: [] };
    group.values.push(value);
    group.rows.push(row);
    groups.set(key, group);
  }
  return {
    groups: [...groups].map(
      ([key, group]): ComparisonGroup => ({
        key,
        ...group,
        stats: describe(group.values),
        days: new Set(group.rows.map((r) => r.day)).size,
        sessions: new Set(group.rows.map((r) => r.session.id)).size,
        coverage: metric.startsWith("hr-")
          ? group.rows.reduce(
              (sum, r) => sum + (r.physiology.windows[window]?.coverage ?? 0),
              0,
            ) / group.rows.length
          : null,
      }),
    ),
    excluded,
  };
}
/** Cluster bootstrap resamples whole days, preserving within-day trade dependence.
 * Deterministic seed; no interval for fewer than five independent days per group. */
export function difference(a: ComparisonGroup, b: ComparisonGroup) {
  if (a.stats.mean === null || b.stats.mean === null)
    return { effect: null, interval: null };
  const effect = b.stats.mean - a.stats.mean;
  if (a.days < 5 || b.days < 5) return { effect, interval: null };
  let seed = 731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const days = [...new Set([...a.rows, ...b.rows].map((r) => r.day))];
  const byDay = (g: ComparisonGroup) =>
    new Map(
      days.map((day) => [
        day,
        g.rows.flatMap((r, i) => (r.day === day ? [g.values[i]] : [])),
      ]),
    );
  const ad = byDay(a),
    bd = byDay(b),
    distribution: number[] = [];
  for (let repeat = 0; repeat < 1000; repeat++) {
    let asum = 0,
      an = 0,
      bsum = 0,
      bn = 0;
    for (let i = 0; i < days.length; i++) {
      const day = days[Math.floor(random() * days.length)];
      for (const value of ad.get(day)!) {
        asum += value;
        an++;
      }
      for (const value of bd.get(day)!) {
        bsum += value;
        bn++;
      }
    }
    if (an && bn) distribution.push(bsum / bn - asum / an);
  }
  distribution.sort((x, y) => x - y);
  if (distribution.length < 950) return { effect, interval: null };
  return {
    effect,
    interval: [
      distribution[Math.floor(distribution.length * 0.025)],
      distribution[Math.floor(distribution.length * 0.975)],
    ] as [number, number],
  };
}
