"use client";
import { useMemo, useState } from "react";
import { Activity, BookOpen, ChevronRight } from "lucide-react";
import { clock, type Session } from "@/lib/model";
import {
  type HrMoment,
  type personalProfile,
  reconstructTrades,
} from "@/lib/smart-journal";
export default function JournalInsights({
  session,
  moments,
  profile,
  hasSamples,
  onMoment,
  onEvidence,
}: {
  session: Session;
  moments: HrMoment[];
  profile: ReturnType<typeof personalProfile>;
  hasSamples: boolean;
  onMoment: (t: number, hrEventId?: string) => void;
  onEvidence: (sessionId: string) => void;
}) {
  const [expanded, setExpanded] = useState("");
  const trades = useMemo(
    () => reconstructTrades(session.events),
    [session.events],
  );
  return (
    <section
      className="glass smart-insights"
      aria-label="Personal journal insights"
    >
      <div className="panel-heading">
        <div>
          <h2>
            <BookOpen size={17} /> Your personal insights
          </h2>
          <p>
            Calculated from your confirmed reflections across your saved
            history.
          </p>
        </div>
        <span className="tag">{profile.count} reflections</span>
      </div>
      {profile.count === 0 ? (
        <p>
          Your journal starts with you. Add a reflection to begin building your
          personal history.
        </p>
      ) : (
        <div className="pattern-grid">
          {profile.patterns.slice(0, 4).map((pattern) => (
            <div className="pattern-card" key={pattern.label}>
              <strong>{pattern.label}</strong>
              <span>
                {pattern.count} of {profile.count} reflections
              </span>
              {pattern.elevated > 0 && (
                <small>
                  {pattern.elevated} with recorded HR at least 10 BPM above
                  baseline
                </small>
              )}
              {pattern.afterLoss > 0 && (
                <small>
                  {pattern.afterLoss} within 10 minutes after a recorded loss
                </small>
              )}
              <button
                className="text-button"
                onClick={() =>
                  setExpanded(expanded === pattern.label ? "" : pattern.label)
                }
              >
                View supporting moments <ChevronRight size={13} />
              </button>
              {expanded === pattern.label &&
                pattern.examples.map((e) => (
                  <button
                    key={e.noteId + e.sessionId}
                    className="text-button"
                    onClick={() => onEvidence(e.sessionId)}
                  >
                    {new Date(e.t).toLocaleDateString()} · {clock(e.t)}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      {!profile.enough && (
        <p className="form-intro">
          Patterns are early observations. Learned sensitivity needs at least 8
          reflections across 3 sessions, including enough HR-linked check-ins.
        </p>
      )}
      {profile.suggestedThreshold !== null && (
        <p className="form-intro">
          Your HR-linked check-ins suggest a +{profile.suggestedThreshold} BPM
          sensitivity. You can choose learned sensitivity in Settings.
        </p>
      )}
      <div className="panel-heading">
        <div>
          <h3>
            <Activity size={15} /> Moments to investigate
          </h3>
          <p>Detected from this session’s HR. No execution required.</p>
        </div>
        <span>{moments.length} moments</span>
      </div>
      {moments.length ? (
        <div className="moment-list">
          {moments.slice(-12).map((m) => (
            <button
              key={m.id}
              className="moment-row"
              onClick={() => onMoment(m.t, m.id)}
            >
              <span>
                {clock(m.t)} ·{" "}
                {m.kind === "rise" ? "Sudden rise" : "Sustained elevation"}
              </span>
              <strong>+{Math.round(m.delta)} BPM</strong>
              <span>
                Add context <ChevronRight size={13} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="form-intro">
          {hasSamples
            ? "No qualifying HR moments in this session yet. Detection needs a complete opening baseline and continuous samples."
            : "Attach a wearable to discover HR moments. Your reflections and screenshots work without one."}
        </p>
      )}
      {trades.length > 0 && (
        <details className="reconstructed-trades">
          <summary>
            {trades.filter((t) => t.exit).length} matched fill segments ·{" "}
            {trades.filter((t) => !t.exit).length} open segments
          </summary>
          <p className="form-intro">
            Entries and exits matched by quantity in time order. Partial fills
            can produce several segments. Price alerts are excluded.
          </p>
          {trades.slice(-20).map((trade, i) => (
            <div className="moment-row" key={i}>
              <span>
                {trade.symbol} · {trade.side} · {trade.quantity} qty
              </span>
              <span>
                {clock(trade.entry)} → {trade.exit ? clock(trade.exit) : "Open"}
              </span>
              <span>
                {trade.entryPrice} → {trade.exitPrice ?? "—"}
              </span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
