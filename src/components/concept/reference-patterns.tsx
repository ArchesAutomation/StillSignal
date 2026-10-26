"use client";
import { unknown, type ContextFilter } from "@/lib/context-comparison";
import { useEffect, useMemo, useState } from "react";
import type { Sample, Session } from "@/lib/model";
import { referenceAnalysis } from "@/lib/reference-analysis";
import { getSamples } from "@/lib/storage";
import { cloudConfigured, pullSession } from "@/lib/cloud";
import { journalDateValue } from "@/lib/journal-day";
import { stages } from "@/lib/journal-reference";
import { cx } from "./shared";
export default function ReferencePatterns({
  sessions,
  selected,
  selectedSamples,
  baselineSeconds,
  onOpen,
  onConnect,
}: {
  sessions: Session[];
  selected: Session;
  selectedSamples: Sample[];
  baselineSeconds: number;
  onOpen: (s: Session, t?: number) => void;
  onConnect?: () => void;
}) {
  const [context, setContext] = useState<ContextFilter>({});
  const [from, setFrom] = useState(
      journalDateValue(selected.startedAt).slice(0, 7) + "-01",
    ),
    [to, setTo] = useState(journalDateValue(selected.startedAt)),
    [origin, setOrigin] = useState("all"),
    [stage, setStage] = useState("all"),
    [scope, setScope] = useState(""),
    [samples, setSamples] = useState<Record<string, Sample[]>>({}),
    [loading, setLoading] = useState(false),
    [status, setStatus] = useState("");
  const rows = useMemo(
    () =>
      [selected, ...sessions.filter((s) => s.id !== selected.id)].filter(
        (s) =>
          s.owner === selected.owner &&
          journalDateValue(s.startedAt) >= from &&
          journalDateValue(s.startedAt) <= to,
      ),
    [sessions, selected, from, to],
  );
  const ids = rows.map((s) => `${s.id}:${s.sampleCount}`).join(",");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const all: Record<string, Sample[]> = {};
      for (let i = 0; i < rows.length; i += 4) {
        await Promise.all(
          rows.slice(i, i + 4).map(async (s) => {
            if (!s.blueprint?.combine?.hr) return;
            let points =
              s.id === selected.id
                ? selectedSamples
                : await getSamples(s.id, s.owner);
            if (
              points.length < s.sampleCount &&
              cloudConfigured &&
              navigator.onLine
            ) {
              try {
                const remote = await pullSession(s.id);
                if (
                  remote.session.owner === s.owner &&
                  remote.session.id === s.id
                )
                  points = [
                    ...new Map(
                      [...points, ...remote.samples].map((p) => [p.t, p]),
                    ).values(),
                  ].sort((a, b) => a.t - b.t);
              } catch {
                /* Available local evidence remains usable. */
              }
            }
            all[s.id] = points;
          }),
        );
      }
      if (alive) setSamples(all);
    })()
      .catch(() => {
        if (alive)
          setStatus(
            "Some historical heart-rate samples are unavailable. Saved words remain visible.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [
    ids,
    selected.id,
    rows.map((s) => (s.blueprint?.combine?.hr ? 1 : 0)).join(""),
  ]);
  const availableSamples = useMemo(
    () => ({ ...samples, [selected.id]: selectedSamples }),
    [samples, selected.id, selectedSamples],
  );
  const filter = { from, to, origin, stage, scope, baselineSeconds, context };
  const data = useMemo(
    () => referenceAnalysis(rows, selected.owner, availableSamples, filter),
    [
      rows,
      selected.owner,
      availableSamples,
      from,
      to,
      origin,
      stage,
      scope,
      baselineSeconds,
      context,
    ],
  );
  const number = (v: number | null, digits = 1) =>
      v === null ? "—" : v.toFixed(digits),
    signed = (v: number | null) =>
      v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
  function exportInputs() {
    const blob = new Blob(
        [
          JSON.stringify(
            {
              methodVersion: "still-signal-v4.1",
              filter,
              scope: data.scope,
              noteFilterAppliesTo:
                "Origin/stage apply to notes. Date and context filters apply to notes, event responses and open-profit observations.",
              sessions: data.sessions.map((s) => ({
                id: s.id,
                timezone: s.timezone,
                events: s.events,
                pnl: s.blueprint?.pnl,
                environmentHistory: s.blueprint?.environmentHistory,
                lifestyle: s.blueprint?.lifestyle,
                sourceChoices: s.blueprint?.combine,
              })),
              records: data.records.map(({ session, ...record }) => ({
                sessionId: session.id,
                ...record,
              })),
              samples: availableSamples,
              exclusions: rows.map((s) => ({
                sessionId: s.id,
                pauses: s.blueprint?.measurementPauses,
              })),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `still-signal-analysis-${from}-${to}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={cx("reference-patterns")}>
      <div className={cx("reference-page-head")}>
        <p>
          Labels, open exposure and environment, with the evidence attached.
        </p>
        <button onClick={exportInputs}>Export analysis inputs ↗</button>
      </div>
      <section className={cx("reference-card")}>
        <div className={cx("analysis-controls")}>
          <label>
            From
            <input
              type="date"
              aria-label="Patterns from"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              aria-label="Patterns to"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Reflection origin
            <select
              aria-label="Pattern origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              <option value="all">Live + later + unknown</option>
              <option value="live">Live only</option>
              <option value="post-session">Later only</option>
            </select>
          </label>
          <label>
            Stage
            <select
              aria-label="Pattern stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="all">All stages</option>
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
              <option value="neutral">Neutral day reflections</option>
            </select>
          </label>
        </div>
        <p className={cx("quiet-copy")}>
          {from} – {to} · {data.sessions.length} eligible sessions ·{" "}
          {data.records.length} matching notes ·{" "}
          {loading
            ? "Loading available HR…"
            : "Available source records loaded"}
          . Combining sources follows each session’s data choices in Settings.
        </p>
      </section>
      <section className={cx("reference-card")} aria-label="Context filters">
        <h2>Choose the context to compare</h2>
        <div className={cx("analysis-controls")}>
          {(
            [
              ["location", "Location"],
              ["setup", "Setup"],
              ["social", "People nearby"],
              ["country", "Country / environment"],
            ] as const
          ).map(([key, label]) => {
            const values = [
              ...new Set(
                rows
                  .flatMap((s) => [
                    ...(s.blueprint?.environmentHistory || []).map(
                      (e) => e[key],
                    ),
                    ...s.journal.map((n) =>
                      key === "setup" ||
                      key === "location" ||
                      key === "social" ||
                      key === "country"
                        ? n.capture?.environment?.[key]
                        : undefined,
                    ),
                  ])
                  .filter((v): v is string => !!v),
              ),
            ];
            return (
              <label key={key}>
                {label}
                <select
                  aria-label={`Pattern ${label}`}
                  value={context[key] || ""}
                  onChange={(e) =>
                    setContext((v) => ({ ...v, [key]: e.target.value }))
                  }
                >
                  <option value="">All recorded groups</option>
                  {[...values, unknown].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <label>
            Lifestyle category
            <select
              aria-label="Pattern lifestyle category"
              value={context.lifestyle || ""}
              onChange={(e) =>
                setContext((v) => ({ ...v, lifestyle: e.target.value }))
              }
            >
              <option value="">All categories</option>
              {[
                ...new Set(
                  rows.flatMap((s) =>
                    (s.blueprint?.lifestyle || []).map(
                      (e) => e.categoryLabel || e.category,
                    ),
                  ),
                ),
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Category answer
            <select
              aria-label="Pattern category answer"
              value={context.answer || ""}
              disabled={!context.lifestyle}
              onChange={(e) =>
                setContext((v) => ({ ...v, answer: e.target.value }))
              }
            >
              <option value="">All answers + Unknown</option>
              <option value="yes">Yes / present</option>
              <option value="no">No / explicitly absent</option>
              <option value="unknown">Unknown / not recorded</option>
            </select>
          </label>
          <label>
            Nearby commitment
            <select
              aria-label="Pattern nearby commitment"
              value={context.commitment || ""}
              onChange={(e) =>
                setContext((v) => ({ ...v, commitment: e.target.value }))
              }
            >
              <option value="">All groups</option>
              <option value="yes">Declared nearby</option>
              <option value="no">Explicitly none</option>
              <option value="unknown">Unknown / not recorded</option>
            </select>
          </label>
          <button
            onClick={() => {
              setContext({});
              setOrigin("all");
              setStage("all");
            }}
          >
            Clear filters
          </button>
        </div>
        <p>
          {from} – {to} · {data.records.length} eligible notes ·{" "}
          {data.sessions.length} eligible sessions. Missing context stays
          Unknown.
        </p>
        <div className={cx("comparison-groups")}>
          {data.comparison.map((g) => (
            <article key={g.name}>
              <h3>{g.name}</h3>
              <b>
                {g.notes} notes · {g.sessions} sessions
              </b>
              <p>
                {g.matched} with matched HR ·{" "}
                {g.delta === null
                  ? "HR unavailable"
                  : `${signed(g.delta)} BPM from baseline`}
              </p>
              {g.matched < 3 && (
                <small>
                  Not enough comparable data yet. Review the original records.
                </small>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className={cx("reference-card")} aria-label="Event responses">
        <h2>What changed around executions?</h2>
        <p>
          {from} – {to}. The comparison recomputes across every eligible date.
        </p>
        <div className={cx("comparison-groups")}>
          {data.responses.map((r) => (
            <article key={r.kind}>
              <h3>
                {r.kind === "fill"
                  ? "Other fills"
                  : r.kind === "entry"
                    ? "Entries / additions"
                    : "Partial / final exits"}
              </h3>
              <b>
                {r.count} events · {r.dates} dates
              </b>
              <p>
                {r.matched} with before-and-after HR ·{" "}
                {r.delta === null
                  ? "Not enough comparable data yet"
                  : `${signed(r.delta)} BPM average observed change`}
              </p>
              {r.example && (
                <details>
                  <summary>One recorded example</summary>
                  <button
                    onClick={() =>
                      onOpen(r.example!.session, r.example!.event.t)
                    }
                  >
                    {new Date(r.example.event.t).toLocaleString()} ·{" "}
                    {r.example.event.symbol}
                  </button>
                </details>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className={cx("reference-card")}>
        <h2>HR alongside your own labels</h2>
        <p>
          Each observation uses a note-centred ±30-second window when available.
          Older notes retain their recorded sample method.
        </p>
        <div className={cx("reference-table-wrap")}>
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Notes</th>
                <th>Matched</th>
                <th>Mean BPM</th>
                <th>From baseline</th>
                <th>SD</th>
              </tr>
            </thead>
            <tbody>
              {data.labels.map((l) => (
                <tr key={l.label}>
                  <td>{l.label === "Unlabelled" ? "No label" : l.label}</td>
                  <td>{l.notes}</td>
                  <td>{l.matched}</td>
                  <td>{number(l.mean)}</td>
                  <td>{signed(l.delta)}</td>
                  <td>{number(l.sd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.labels.length && <p>No matching notes in this range.</p>}
        <details>
          <summary>Inspect matching moments</summary>
          {data.records.slice(0, 8).map((r) => (
            <button
              className={cx("analysis-evidence")}
              key={r.session.id + r.note.id}
              onClick={() => onOpen(r.session, r.note.t)}
            >
              <strong>
                {new Date(r.session.startedAt).toLocaleDateString()} ·{" "}
                {r.note.label}
              </strong>
              <span>{r.note.text.slice(0, 160)}</span>
              <small>
                {r.method} ·{" "}
                {r.hrCount === null
                  ? "Sample count unavailable"
                  : `${r.hrCount} samples`}{" "}
                · {r.note.captureMode || "Origin unknown"}
              </small>
            </button>
          ))}
        </details>
      </section>
      {rows.some((s) =>
        s.blueprint?.pnl?.some(
          (p) =>
            p.unrealised !== undefined &&
            p.position !== undefined &&
            p.position !== 0,
        ),
      ) ? (
        <>
          <section className={cx("reference-card")}>
            <h2>Holding open profit</h2>
            <p>
              While a measured position is open, how does recorded HR differ
              from its opening baseline?
            </p>
            <label>
              Account · currency · instrument
              <select
                aria-label="Open-profit account scope"
                value={data.scope || ""}
                onChange={(e) => setScope(e.target.value)}
              >
                {data.scopes.length ? (
                  data.scopes.map((s) => (
                    <option key={s} value={s}>
                      {(JSON.parse(s) as string[]).join(" · ")}
                    </option>
                  ))
                ) : (
                  <option value="">
                    No timestamped open-position snapshots
                  </option>
                )}
              </select>
            </label>
            <div className={cx("reference-table-wrap")}>
              <table>
                <thead>
                  <tr>
                    <th>Open P&L band</th>
                    <th>Sessions</th>
                    <th>Matched points</th>
                    <th>Mean HR above baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bins.map((b) => (
                    <tr key={b.name}>
                      <td>{b.name}</td>
                      <td>{b.sessions}</td>
                      <td>{b.points}</td>
                      <td>{signed(b.delta)} BPM</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={cx("quiet-copy")}>
              Mean per session, then equally across sessions. Median
              within-session correlation: {number(data.medianCorrelation, 2)} ·{" "}
              {data.correlationSessions} eligible sessions. {data.matchedPoints}{" "}
              matched points. This panel uses the date range; stage/origin
              filters apply to note panels. Missing marks, positions and HR stay
              unavailable.
            </p>
          </section>
          {!data.matchedPoints && (
            <p className={cx("quiet-copy")}>
              Timestamped source records are available, but there is not enough
              comparable HR and open-position data yet. Check coverage and your
              source choices in Settings.
            </p>
          )}
        </>
      ) : (
        <section className={cx("reference-card", "profit-preview")}>
          <h2>Explore how holding open profit relates to your session</h2>
          <p>
            A timestamped open-position P&L feed or executions plus valid
            historical market marks can show what changed while you held profit.
            CSV fills alone cannot supply that path.
          </p>
          <button onClick={onConnect}>Connect a supported source</button>
          <details>
            <summary>Preview what this could show · example data</summary>
            <strong>ILLUSTRATIVE EXAMPLE · not your data or a finding</strong>
            <svg
              viewBox="0 0 600 130"
              role="img"
              aria-label="Illustrative example of open profit beside HR, not your data"
            >
              <path
                d="M20 100 L120 70 L220 80 L320 25 L420 50 L580 90"
                stroke="var(--green)"
                fill="none"
                strokeWidth="3"
              />
              <path
                d="M20 90 L120 85 L220 65 L320 60 L420 35 L580 80"
                stroke="var(--coral)"
                fill="none"
                strokeWidth="3"
              />
              <text x="20" y="125" fill="var(--muted)">
                Example only: open profit (green), heart rate (coral)
              </text>
            </svg>
            <p>
              Example questions: did HR change as profit grew? What was recorded
              around a partial exit or giveback? Actual results require valid
              samples in the selected dates.
            </p>
          </details>
        </section>
      )}
      <section className={cx("reference-card")}>
        <h2>Where you trade</h2>
        <p>
          Recorded context and your own words. Source counts describe
          associations; they do not establish a cause.
        </p>
        <div className={cx("reference-table-wrap")}>
          <table>
            <thead>
              <tr>
                <th>Environment</th>
                <th>Sessions</th>
                <th>Matching notes</th>
                <th>Mean HR delta</th>
              </tr>
            </thead>
            <tbody>
              {data.environments.map((e) => (
                <tr key={JSON.stringify(e.context)}>
                  <td>{Object.values(e.context).join(" · ")}</td>
                  <td>{e.sessions}</td>
                  <td>{e.notes}</td>
                  <td>{signed(e.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.environments.length && (
          <p>No enabled environment evidence in this range.</p>
        )}
      </section>
      <section className={cx("reference-card")}>
        <h2>Live words, later perspective</h2>
        <p>
          A later reflection must explicitly revisit the original moment. Both
          accounts remain intact.
        </p>
        {data.pairs.map(({ original, later, session }) => (
          <div key={later.id} className={cx("perspective-pair")}>
            <blockquote>
              <small>
                ORIGINAL · {original.captureMode || "Origin unknown"}
              </small>
              {original.text}
            </blockquote>
            <blockquote>
              <small>LATER</small>
              {later.text}
            </blockquote>
            <button onClick={() => onOpen(session, later.t)}>
              Open linked reflection
            </button>
          </div>
        ))}
        {!data.pairs.length && (
          <p>No explicitly linked pair matches these filters.</p>
        )}
      </section>
      <section className={cx("reference-card")}>
        <h2>Life around your sessions</h2>
        {data.life.length ? (
          data.life.map((e) => (
            <p key={e.category}>
              {e.category} · {e.count} recorded events
            </p>
          ))
        ) : (
          <p>No lifestyle context entered. Blank fields mean unknown.</p>
        )}
        <p className={cx("quiet-copy")}>
          Entered events supply context and optional reflection questions. They
          are not evidence of an effect on your trading.
        </p>
      </section>
      <details className={cx("reference-card")}>
        <summary>How is this comparison made?</summary>
        <p>
          Version still-signal-v4.1. HR windows use available samples ±30s;
          counts remain attached to their source moments. Opening baseline
          follows your {baselineSeconds / 60}-minute recording setting. Legacy
          notes may only contain the nearest recorded sample. Continuous-profit
          analysis uses backward HR samples no more than 10 seconds old; it
          requires nonzero measured positions and actual timestamped open P&L.
          Overlapping samples are not independent observations; SD is not a
          confidence interval. Exports include records and calculation inputs.
        </p>
      </details>
      <p role="status">{status}</p>
    </div>
  );
}
