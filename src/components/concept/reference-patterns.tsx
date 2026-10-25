"use client";
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
}: {
  sessions: Session[];
  selected: Session;
  selectedSamples: Sample[];
  baselineSeconds: number;
  onOpen: (s: Session, t?: number) => void;
}) {
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
  }, [ids, selected.id]);
  const availableSamples = useMemo(
    () => ({ ...samples, [selected.id]: selectedSamples }),
    [samples, selected.id, selectedSamples],
  );
  const filter = { from, to, origin, stage, scope, baselineSeconds };
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
              methodVersion: "journal-reference-1",
              filter,
              scope: data.scope,
              noteFilterAppliesTo:
                "Labels, environment notes and linked reflections; continuous open-profit series uses the date range only",
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
          {data.sessions.length} sessions · {data.records.length} matching notes
          ·{" "}
          {loading
            ? "Loading available HR…"
            : "Available source records loaded"}
          . Combining sources follows each session’s data choices in Settings.
        </p>
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
          {data.records.map((r) => (
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
      <section className={cx("reference-card")}>
        <h2>Holding open profit</h2>
        <p>
          While a measured position is open, how does recorded HR differ from
          its opening baseline?
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
              <option value="">No timestamped open-position snapshots</option>
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
          Mean per session, then equally across sessions. Median within-session
          correlation: {number(data.medianCorrelation, 2)} ·{" "}
          {data.correlationSessions} eligible sessions. {data.matchedPoints}{" "}
          matched points. This panel uses the date range; stage/origin filters
          apply to note panels. Missing marks, positions and HR stay
          unavailable.
        </p>
      </section>
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
        <summary>Sources and method</summary>
        <p>
          Version journal-reference-1. HR windows use available samples ±30s;
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
