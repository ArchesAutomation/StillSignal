"use client";
import { useMemo, useState } from "react";
import type { Sample, Session } from "@/lib/model";
import { liveNotes } from "@/lib/smart-journal";
import { cx, Title, signed, time } from "./shared";
import TradeJourneys from "./trade-journeys";
export default function Patterns({
  sessions,
  selected,
  selectedSamples,
  owner,
  onOpen,
}: {
  sessions: Session[];
  selected: Session;
  selectedSamples: Sample[];
  owner: string;
  onOpen: (s: Session, t?: number) => void;
}) {
  const [days, setDays] = useState(30),
    [active, setActive] = useState("");
  const rangeSessions = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            s.startedAt >= selected.startedAt - days * 86400000 &&
            s.startedAt <= selected.startedAt + 86400000,
        )
        .sort((a, b) => b.startedAt - a.startedAt),
    [sessions, selected.startedAt, days],
  );
  const records = useMemo(
    () => rangeSessions.flatMap((s) => liveNotes(s.journal).map((n) => ({ s, n }))),
    [rangeSessions],
  );
  const labels = [...new Set(records.map((r) => r.n.label))]
    .map((label) => {
      const rows = records.filter((r) => r.n.label === label),
        hr = rows.filter((r) => r.n.context?.delta !== undefined);
      return {
        label,
        rows,
        hr,
        mean: hr.length
          ? hr.reduce((n, r) => n + r.n.context!.delta!, 0) / hr.length
          : null,
      };
    })
    .sort((a, b) => (b.mean ?? -999) - (a.mean ?? -999));
  const best = labels.find((l) => l.mean !== null),
    focus = labels.find((l) => l.label === active) || best || labels[0];
  const max = Math.max(1, ...labels.map((l) => Math.abs(l.mean || 0)));
  const evidence = focus?.rows || [];
  return (
    <>
      <Title
        title="Your heart-rate patterns"
        description="Each pattern combines your labels, HR, trade timing and outcomes—without claiming that heart rate caused the result."
      >
        <select
          className={cx("ghost")}
          aria-label="Pattern date range"
          value={days}
          onChange={(e) => setDays(+e.target.value)}
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </Title>
      <div className={cx("visualinsight")}>
        <div className={cx("insightnumber")}>
          {best ? signed(best.mean!) : "—"}
        </div>
        <div>
          <h3>
            {best
              ? `${best.label}-labelled moments showed your largest average rise.`
              : "Your observations will bring this view to life."}
          </h3>
          <p>
            {best
              ? `${best.hr.length} reflections include heart rate and a baseline. Explore the original moments before interpreting the association.`
              : "Add your own labels to recorded moments to begin."}
          </p>
        </div>
        <div className={cx("confidence")}>
          {best?.hr.length || 0} MOMENTS
          <br />
          DESCRIPTIVE DATA
        </div>
      </div>
      <div className={cx("analyticsgrid")}>
        <div className={cx("trendpanel")}>
          <div className={cx("eyebrow")}>
            Average response by your own label
          </div>
          {labels.slice(0, 5).map((l, i) => (
            <button
              className={cx("emotionrow")}
              key={l.label}
              onClick={() => {
                setActive(l.label);
              }}
            >
              <span>{l.label}</span>
              <div className={cx("bar")}>
                <i
                  style={{
                    width:
                      Math.max(2, (Math.abs(l.mean || 0) / max) * 88) + "%",
                    background: [
                      "var(--red)",
                      "var(--orange)",
                      "var(--purple)",
                      "var(--green)",
                      "var(--blue)",
                    ][i],
                  }}
                />
              </div>
              <b>{l.mean === null ? "—" : signed(l.mean) + " BPM"}</b>
            </button>
          ))}
          {!labels.length && (
            <p className={cx("empty-note")}>No confirmed labels yet.</p>
          )}
          <div className={cx("insightcall")}>
            <strong>So what might this mean?</strong>
            <p>
              Heart rate provides context; your words provide meaning. Compare
              the recorded moments and the decisions that followed.
            </p>
            <button
              className={cx("ghost")}
              onClick={() => {
                setActive(best?.label || "");
                document
                  .getElementById("ss-pattern-evidence")
                  ?.scrollIntoView({ block: "center", behavior: "smooth" });
              }}
            >
              Inspect the moments
            </button>
          </div>
        </div>
        <div>
          <div className={cx("eyebrow")}>Repeated connections</div>
          {labels.slice(0, 3).map((l) => (
            <div className={cx("finding")} key={l.label}>
              <strong>{l.label} in your journal</strong>
              <p>
                {l.rows.length} self-reported moments, {l.hr.length} with
                recorded heart-rate context.
              </p>
              <button
                onClick={() => {
                  setActive(l.label);
                }}
              >
                {l.rows.length} moments · see what changed →
              </button>
            </div>
          ))}
        </div>
      </div>
      <Title
        title="Trade journeys"
        description="Every recorded execution, session by session. Follow heart rate from ten minutes before through the trade and read your own reflections beside it. Missing measurements stay blank."
      />
      <TradeJourneys sessions={rangeSessions} selected={selected} selectedSamples={selectedSamples} owner={owner} onOpen={onOpen} />
      <div className={cx("patternlens")} id="ss-pattern-evidence">
        <div className={cx("patternlens-top")}>
          <div>
            <h3>{focus?.label || "Your"} moments</h3>
            <p>
              {evidence.length} supporting reflections. Times use your browser’s
              local timezone.
            </p>
          </div>
        </div>
        <div className={cx("patternstats")}>
          <div className={cx("patternstat")}>
            <span>REFLECTIONS</span>
            <strong>{evidence.length}</strong>
          </div>
          <div className={cx("patternstat")}>
            <span>SESSIONS</span>
            <strong>{new Set(evidence.map((r) => r.s.id)).size}</strong>
          </div>
          <div className={cx("patternstat")}>
            <span>HR CONTEXT</span>
            <strong>
              {evidence.filter((r) => r.n.context?.bpm !== undefined).length}
            </strong>
          </div>
          <div className={cx("patternstat")}>
            <span>INTERPRETATION</span>
            <strong>Yours</strong>
          </div>
        </div>
        <div className={cx("evidence-list")}>
          {evidence.slice(0, 8).map(({ s, n }) => (
            <button key={s.id + n.id} onClick={() => onOpen(s, n.t)}>
              <span>
                {new Date(n.t).toLocaleDateString()} · {time(n.t)}
              </span>
              <b>{n.label}</b>
              <span>{n.text.slice(0, 150)}</span>
              <span>→</span>
            </button>
          ))}
        </div>
        <div className={cx("patternquestion")}>
          <b>Worth investigating:</b> what changed in your attention, thoughts,
          or decisions? Compare the original moments before deciding what the
          pattern means.
        </div>
      </div>
      <p className={cx("datacaveat")}>
        Comparisons describe your recorded history; they are not predictions or
        instructions. Missing heart-rate data remains blank.
      </p>
    </>
  );
}
