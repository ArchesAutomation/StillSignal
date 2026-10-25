"use client";
import { useState } from "react";
import type { Session } from "@/lib/model";
import { environmentPatterns } from "@/lib/session-timeline";
import { cx } from "./shared";
export default function EnvironmentPatterns({
  sessions,
  selected,
  onOpen,
}: {
  sessions: Session[];
  selected: Session;
  onOpen: (s: Session) => void;
}) {
  const [match, setMatch] = useState("");
  const groups = environmentPatterns(
    [selected, ...sessions.filter((s) => s.id !== selected.id)],
    selected.owner,
    Math.max(Date.now(), selected.startedAt),
  );
  const shown = match
    ? groups.filter((g) => g.context.strategy === match)
    : groups;
  return (
    <section className={cx("environment-patterns")}>
      <h2>Your environment, over time</h2>
      <p>
        Last 30 days. At least 5 distinct session days per setting for an early
        signal; 10 for more established evidence. Repeated recordings on one day
        count once.
      </p>
      <label>
        Strategy filter
        <select value={match} onChange={(e) => setMatch(e.target.value)}>
          <option value="">All strategy labels</option>
          {[...new Set(groups.map((g) => g.context.strategy))]
            .filter(Boolean)
            .map((v) => (
              <option key={v}>{v}</option>
            ))}
        </select>
      </label>
      {!shown.length && (
        <p className={cx("empty-note")}>
          Save context and enable Environment in this session’s data controls to
          include it here.
        </p>
      )}
      <div className={cx("pattern-grid")}>
        {shown.map((g, i) => (
          <article key={i}>
            <small>
              {g.evidence} · {g.count} days · {g.sessions.length} recordings
            </small>
            <h3>{g.context.location}</h3>
            <p>
              {g.context.social} · {g.context.setup} ·{" "}
              {g.context.strategy || "No strategy label"} ·{" "}
              {g.context.newsDay ? "News day" : "No news flag"}
            </p>
            <small>
              {new Date(g.start).toLocaleDateString()}–
              {new Date(g.end).toLocaleDateString()}
            </small>
            <p>
              {g.adherence === null
                ? "More assessed sessions are needed before comparing adherence."
                : `${Math.round(g.adherence * 100)}% self-reported commitment adherence across ${g.assessed} assessed days.`}
            </p>
            {g.meanHrDelta !== null && (
              <p>
                Mean recorded HR change at reflections:{" "}
                {g.meanHrDelta > 0 ? "+" : ""}
                {Math.round(g.meanHrDelta)} BPM from each session baseline ·{" "}
                {g.hrCount} matched reflections. Only sessions with HR analysis
                consent contribute.
              </p>
            )}
            <details>
              <summary>Underlying sessions</summary>
              {g.sessions.map((s) => (
                <button
                  key={s.id}
                  className={cx("textlink")}
                  onClick={() => onOpen(s)}
                >
                  {new Date(s.startedAt).toLocaleDateString()} · {s.name}
                </button>
              ))}
            </details>
          </article>
        ))}
      </div>
      <p>
        Groups separate strategy, setup, social context, news flag, account size
        and four-hour local session bands. Missing context and unassessed rules
        remain visible gaps. These are personal associations; other factors may
        explain differences. Consider testing one change at a time.
      </p>
    </section>
  );
}
