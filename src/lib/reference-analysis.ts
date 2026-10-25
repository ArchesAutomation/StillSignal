import type { JournalEntry, Sample, Session } from "./model";
import { journalDateValue } from "./journal-day";
import { noteTime } from "./journal-routing";
import { environmentAt } from "./journal-reference";
import { summary } from "./analytics";
const mean = (a: number[]) =>
  a.length ? a.reduce((n, x) => n + x, 0) / a.length : null;
const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length
    ? (b[Math.floor((b.length - 1) / 2)] + b[Math.floor(b.length / 2)]) / 2
    : null;
};
function correlation(a: number[], b: number[]) {
  if (a.length < 3) return null;
  const ma = mean(a)!,
    mb = mean(b)!,
    den = Math.sqrt(
      a.reduce((n, x) => n + (x - ma) ** 2, 0) *
        b.reduce((n, x) => n + (x - mb) ** 2, 0),
    );
  return den
    ? a.reduce((n, x, i) => n + (x - ma) * (b[i] - mb), 0) / den
    : null;
}
export type AnalysisFilter = {
  from: string;
  to: string;
  origin: string;
  stage: string;
  scope: string;
  baselineSeconds: number;
};
export function referenceAnalysis(
  sessions: Session[],
  owner: string,
  samples: Record<string, Sample[]>,
  filter: AnalysisFilter,
) {
  const rows = [
    ...new Map(
      sessions
        .filter(
          (s) =>
            s.owner === owner &&
            journalDateValue(s.startedAt) >= filter.from &&
            journalDateValue(s.startedAt) <= filter.to,
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];
  const records = rows.flatMap((s) =>
    s.journal
      .filter(
        (n) =>
          !n.deletedAt &&
          (filter.origin === "all" || n.captureMode === filter.origin) &&
          (filter.stage === "all" ||
            (filter.stage === "neutral"
              ? !n.section || n.section === "stillness"
              : n.section === filter.stage)),
      )
      .map((n) => {
        const at = noteTime(n),
          hr = samples[s.id] || [],
          enabled = !!(
            s.blueprint?.combine?.hr && s.blueprint.combine.transcript
          ),
          window =
            at === null ? [] : hr.filter((p) => Math.abs(p.t - at) <= 30000);
        const baseline = enabled
          ? summary(hr, hr[0]?.t || s.startedAt, filter.baselineSeconds)
              .baseline
          : null;
        const value = enabled
          ? window.length
            ? mean(window.map((p) => p.bpm))
            : (n.context?.hrWindowMean ?? n.context?.bpm ?? null)
          : null;
        const count = enabled
          ? window.length || n.context?.hrWindowCount || null
          : null;
        const base =
          baseline ?? (enabled ? (n.context?.baseline ?? null) : null);
        const env = n.capture
          ? n.capture.environment
          : (at !== null
              ? environmentAt(s, at, n.capturedAt ?? n.t)
              : undefined) || s.blueprint?.context;
        return {
          session: s,
          note: n,
          hrMean: value,
          hrCount: count,
          baseline: base,
          delta: value !== null && base !== null ? value - base : null,
          environment: env
            ? { location: env.location, social: env.social, setup: env.setup }
            : null,
          method: window.length
            ? "Loaded HR ±30s"
            : n.context?.hrWindowMean !== undefined
              ? "Saved HR ±30s window"
              : n.context?.bpm !== undefined
                ? "Legacy nearest sample"
                : "No matched HR",
        };
      }),
  );
  const labels = [...new Set(records.map((r) => r.note.label))].map((label) => {
    const group = records.filter((r) => r.note.label === label),
      hr = group.filter((r) => r.hrMean !== null),
      values = hr.map((r) => r.hrMean!),
      avg = mean(values);
    return {
      label,
      notes: group.length,
      matched: hr.length,
      mean: avg,
      delta: mean(hr.filter((r) => r.delta !== null).map((r) => r.delta!)),
      sd:
        values.length > 1
          ? Math.sqrt(
              values.reduce((n, v) => n + (v - avg!) ** 2, 0) /
                (values.length - 1),
            )
          : null,
      records: group,
    };
  });
  const environments = [
    ...new Set(
      records
        .filter(
          (r) => r.environment && r.session.blueprint?.combine?.environment,
        )
        .map((r) => JSON.stringify(r.environment)),
    ),
  ].map((key) => {
    const group = records.filter(
        (r) =>
          JSON.stringify(r.environment) === key &&
          r.session.blueprint?.combine?.environment,
      ),
      sessionIds = [...new Set(group.map((r) => r.session.id))];
    const deltas = sessionIds
      .map((id) =>
        mean(
          group
            .filter((r) => r.session.id === id && r.delta !== null)
            .map((r) => r.delta!),
        ),
      )
      .filter((x): x is number => x !== null);
    return {
      context: JSON.parse(key) as {
        location: string;
        social: string;
        setup: string;
      },
      sessions: sessionIds.length,
      notes: group.length,
      delta: mean(deltas),
    };
  });
  const scopes = [
    ...new Set(
      rows.flatMap((s) =>
        (s.blueprint?.pnl || []).map((p) =>
          JSON.stringify([p.account, p.currency, p.symbol]),
        ),
      ),
    ),
  ];
  const scope = scopes.includes(filter.scope) ? filter.scope : scopes[0];
  const bins = ["Loss", "0–99", "100–249", "250+"].map((name) => ({
      name,
      sessions: 0,
      points: 0,
      delta: null as number | null,
    })),
    coefficients: number[] = [];
  let matchedPoints = 0;
  if (scope)
    for (const s of rows) {
      if (!s.blueprint?.combine?.hr || !s.blueprint.combine.pnl) continue;
      const hr = samples[s.id] || [],
        baseline = summary(
          hr,
          hr[0]?.t || s.startedAt,
          filter.baselineSeconds,
        ).baseline;
      if (baseline === null) continue;
      const pairs = (s.blueprint.pnl || [])
        .filter(
          (p) =>
            JSON.stringify([p.account, p.currency, p.symbol]) === scope &&
            p.unrealised !== undefined &&
            p.position !== undefined &&
            p.position !== 0,
        )
        .flatMap((p) => {
          const point = hr
            .filter((h) => h.t <= p.t && p.t - h.t <= 10000)
            .at(-1);
          return point
            ? [{ profit: p.unrealised!, delta: point.bpm - baseline }]
            : [];
        });
      matchedPoints += pairs.length;
      const r = correlation(
        pairs.map((p) => p.profit),
        pairs.map((p) => p.delta),
      );
      if (r !== null) coefficients.push(r);
      for (let i = 0; i < 4; i++) {
        const values = pairs
          .filter(
            (p) =>
              (p.profit < 0
                ? 0
                : p.profit < 100
                  ? 1
                  : p.profit < 250
                    ? 2
                    : 3) === i,
          )
          .map((p) => p.delta);
        if (!values.length) continue;
        const b = bins[i];
        b.delta =
          ((b.delta || 0) * b.sessions + mean(values)!) / (b.sessions + 1);
        b.sessions++;
        b.points += values.length;
      }
    }
  const pairs = records
    .filter(
      (r) => r.note.revisitsId && r.session.blueprint?.combine?.transcript,
    )
    .flatMap((later) => {
      const original = rows
        .filter((s) => s.blueprint?.combine?.transcript)
        .flatMap((s) => s.journal)
        .find((n) => !n.deletedAt && n.id === later.note.revisitsId);
      return original
        ? [{ original, later: later.note, session: later.session }]
        : [];
    });
  const life = [
    ...new Set(
      rows.flatMap((s) =>
        (s.blueprint?.lifestyle || []).map((e) => e.category),
      ),
    ),
  ].map((category) => ({
    category,
    count: rows.reduce(
      (n, s) =>
        n +
        (s.blueprint?.lifestyle || []).filter((e) => e.category === category)
          .length,
      0,
    ),
  }));
  return {
    sessions: rows,
    records,
    labels,
    environments,
    scopes,
    scope,
    bins,
    medianCorrelation: median(coefficients),
    correlationSessions: coefficients.length,
    matchedPoints,
    pairs,
    life,
  };
}
