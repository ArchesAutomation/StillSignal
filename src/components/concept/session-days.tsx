"use client";
import { useEffect, useMemo, useState } from "react";
import { summary, downsample } from "@/lib/analytics";
import { cloudConfigured, pullSession } from "@/lib/cloud";
import { money, type JournalEntry, type Sample, type Session } from "@/lib/model";
import { groupSessionDays, type SessionDay } from "@/lib/session-days";
import { sessionIdeas } from "@/lib/position-ideas";
import { liveNotes, mergeNotes, reconstructTrades } from "@/lib/smart-journal";
import { getSamples } from "@/lib/storage";
import { isActualExecution, pnlByCurrency } from "@/lib/trade-context";
import { Screenshot } from "../reflection-editor";
import { cx, time } from "./shared";
import { noteTime } from "@/lib/journal-routing";

const count = (n: number, singular: string) =>
  `${n.toLocaleString()} ${singular}${n === 1 ? "" : "s"}`;

function HeartTrace({ samples }: { samples: Sample[] }) {
  const points = downsample(samples, 160);
  if (points.length < 2) return null;
  const first = points[0].t;
  const span = Math.max(1000, points.at(-1)!.t - first);
  const low = Math.min(55, ...points.map((point) => point.bpm));
  const high = Math.max(115, ...points.map((point) => point.bpm));
  const path = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"} ${8 + ((point.t - first) / span) * 484} ${75 - ((point.bpm - low) / (high - low)) * 62}`,
    )
    .join(" ");
  return (
    <svg
      className={cx("recording-trace")}
      viewBox="0 0 500 84"
      preserveAspectRatio="none"
      role="img"
      aria-label="Recorded heart-rate trend for this session"
    >
      <line x1="8" x2="492" y1="72" y2="72" stroke="#2b3839" />
      <path d={path} fill="none" stroke="#ff8179" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EntryModule({
  entry,
  onOpen,
  disabled,
}: {
  entry: JournalEntry;
  onOpen: () => void;
  disabled: boolean;
}) {
  const preview = entry.text.replace(/\s+/g, " ").trim() || "Reflection without text";
  return (
    <details className={cx("entry-module")}>
      <summary>
        <span className={cx("entry-time")}>{noteTime(entry) === null ? "Untimed" : time(noteTime(entry)!, false)}</span>
        <span className={cx("entry-label")}>{entry.label || "Reflection"}</span>
        <span className={cx("entry-preview")}>{preview}</span>
        <span className={cx("module-chevron")} aria-hidden="true">⌄</span>
      </summary>
      <div className={cx("entry-module-body")}>
        <p>{entry.text || "No written reflection was saved."}</p>
        <div className={cx("entry-context")}>
          <span>{noteTime(entry) === null ? "No event time supplied" : new Date(noteTime(entry)!).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
          {entry.context?.bpm !== undefined && <span>{entry.context.bpm} BPM</span>}
          {entry.context?.baseline !== undefined && <span>Baseline {Math.round(entry.context.baseline)} BPM</span>}
          {entry.context?.delta !== undefined && (
            <span>{entry.context.delta >= 0 ? "+" : ""}{Math.round(entry.context.delta)} BPM from baseline</span>
          )}
          {entry.source && <span>{entry.source === "voice" ? "Voice reflection" : entry.source === "typed" ? "Written reflection" : "HR check-in"}</span>}
        </div>
        {entry.screenshot && <Screenshot path={entry.screenshot.path} name={entry.screenshot.name} />}
        <button className={cx("textlink")} disabled={disabled} onClick={onOpen}>
          Open this entry in the full journal
        </button>
      </div>
    </details>
  );
}

function RecordingModule({
  item,
  selected,
  selectedSamples,
  owner,
  baselineSeconds,
  active,
  onOpen,
  onManage,
  onEntry,
}: {
  item: Session;
  selected: Session;
  selectedSamples: Sample[];
  owner: string;
  baselineSeconds: number;
  active: boolean;
  onOpen: () => void;
  onManage: () => void;
  onEntry: (entry: JournalEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState<{ samples: Sample[]; loading: boolean; error: boolean }>({
    samples: [],
    loading: false,
    error: false,
  });
  const entries = liveNotes(mergeNotes(item.journal)).sort((a, b) => a.t - b.t);
  const events = item.events.filter((event) => !event.voided).sort((a, b) => a.t - b.t);
  const trades = sessionIdeas(item).filter((trade) => trade.exit);
  const samples = selected.id === item.id ? selectedSamples : loaded.samples;
  const stats = useMemo(
    () => summary(samples, item.startedAt, baselineSeconds),
    [samples, item.startedAt, baselineSeconds],
  );
  useEffect(() => {
    if (!expanded || selected.id === item.id || !item.sampleCount) return;
    let alive = true;
    setLoaded({ samples: [], loading: true, error: false });
    void (async () => {
      let local: Sample[] = [];
      try {
        local = await getSamples(item.id, owner);
      } catch {
        // A cloud copy may still be available when local storage is unavailable.
      }
      let points = local;
      if (points.length < item.sampleCount && cloudConfigured && navigator.onLine) {
        try {
          const remote = await pullSession(item.id);
          if (remote.session.owner !== owner || remote.session.id !== item.id)
            throw new Error("Workspace identity mismatch.");
          points = [...new Map([...local, ...remote.samples].map((point) => [point.t, point])).values()]
            .sort((a, b) => a.t - b.t);
        } catch {
          // Keep the local measurements and report any missing detail below.
        }
      }
      if (alive) setLoaded({ samples: points, loading: false, error: !points.length && item.sampleCount > 0 });
    })();
    return () => {
      alive = false;
    };
  }, [expanded, item.id, item.sampleCount, owner, selected.id]);
  return (
    <article className={cx("recording-module", expanded && "expanded")}>
      <button
        className={cx("recording-toggle")}
        aria-expanded={expanded}
        aria-controls={`recording-${item.id}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={cx("recording-mark")}>◴</span>
        <span className={cx("recording-heading")}>
          <strong>{item.name}</strong>
          <small>{time(item.startedAt, false)}–{item.endedAt ? time(item.endedAt, false) : "Unfinished"} · {item.source}</small>
        </span>
        <span className={cx("recording-counts")}>{count(entries.length, "reflection")} · {count(events.filter(isActualExecution).length, "order")} · {count(trades.length, "closed trade")}</span>
        <span className={cx("module-chevron")} aria-hidden="true">⌄</span>
      </button>
      {expanded && (
        <div id={`recording-${item.id}`} className={cx("recording-body")}>
          <div className={cx("recording-stats")}>
            <div><span>Heart-rate samples</span><strong>{item.sampleCount.toLocaleString()}</strong></div>
            <div><span>Average HR</span><strong>{stats.mean === null ? "—" : `${Math.round(stats.mean)} BPM`}</strong></div>
            <div><span>Peak HR</span><strong>{stats.peak === null ? "—" : `${stats.peak} BPM`}</strong></div>
            <div><span>Opening baseline</span><strong>{stats.baseline === null ? "—" : `${Math.round(stats.baseline)} BPM`}</strong></div>
          </div>
          {loaded.loading && selected.id !== item.id && <p className={cx("recording-note")}>Loading recorded heart rate…</p>}
          {loaded.error && <p className={cx("recording-note")}>Heart-rate detail is unavailable here. Open the full journal to retry.</p>}
          {!!samples.length && (
            <>
              <HeartTrace samples={samples} />
              {samples.length < item.sampleCount && (
                <p className={cx("recording-note")}>Showing {samples.length.toLocaleString()} of {item.sampleCount.toLocaleString()} recorded samples.</p>
              )}
            </>
          )}
          <div className={cx("recording-actions")}>
            <button className={cx("primary")} disabled={active && item.id !== selected.id} onClick={onOpen}>Open full journal</button>
            <button className={cx("ghost")} disabled={active && item.id !== selected.id} onClick={onManage}>Manage recording</button>
          </div>
          <section className={cx("recording-section")}>
            <h3>Journal entries <span>{entries.length}</span></h3>
            {entries.length ? entries.map((entry) => (
              <EntryModule
                key={entry.id}
                entry={entry}
                disabled={active && item.id !== selected.id}
                onOpen={() => onEntry(entry)}
              />
            )) : <p className={cx("recording-empty")}>No reflections were added to this recording.</p>}
          </section>
          <section className={cx("recording-section")}>
            <h3>Trade activity <span>{events.length}</span></h3>
            {events.length ? (
              <div className={cx("recording-events")}>
                {events.map((event) => (
                  <div key={event.id} className={cx("recording-event")}>
                    <time>{time(event.t, false)}</time>
                    <b>{event.symbol}</b>
                    <span>{event.kind} · {event.side} · {event.quantity} @ {event.price}</span>
                    {event.pnl !== undefined && <strong>{money(event.pnl, event.currency || "USD")}</strong>}
                  </div>
                ))}
              </div>
            ) : <p className={cx("recording-empty")}>No trades were attached to this recording.</p>}
          </section>
        </div>
      )}
    </article>
  );
}

function DayModule({
  day,
  open,
  onToggle,
  selected,
  selectedSamples,
  owner,
  baselineSeconds,
  active,
  onOpen,
  onManage,
  onEntry,
}: {
  day: SessionDay;
  open: boolean;
  onToggle: () => void;
  selected: Session;
  selectedSamples: Sample[];
  owner: string;
  baselineSeconds: number;
  active: boolean;
  onOpen: (session: Session) => void;
  onManage: (session: Session) => void;
  onEntry: (session: Session, entry: JournalEntry) => void;
}) {
  const date = new Date(day.date);
  const totals = pnlByCurrency(day.events);
  return (
    <section className={cx("day-module", open && "expanded")}>
      <button
        className={cx("day-toggle")}
        aria-expanded={open}
        aria-controls={`day-${day.key}`}
        onClick={onToggle}
      >
        <span className={cx("day-date")}>
          <small>{date.toLocaleDateString("en-US", { weekday: "long" })}</small>
          <strong>{date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>
        </span>
        <span className={cx("day-summary")}>
          <b>{count(day.sessions.length, "recording")} · {count(day.entries.length, "reflection")} · {count(day.executedOrders, "order")}</b>
          <span className={cx("day-summary-labels")}>
            {day.labels.length
              ? <>{day.labels.slice(0, 3).map(({ name, count }) => <small key={name}>{name} <b>{count}</b></small>)}{day.labels.length > 3 && <small>+{day.labels.length - 3} more</small>}</>
              : <small>No reflection labels yet</small>}
          </span>
        </span>
        <span className={cx("module-chevron")} aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div id={`day-${day.key}`} className={cx("day-body")}>
          <div className={cx("day-snapshot")}>
            <div><span>Recordings</span><strong>{day.sessions.length}</strong></div>
            <div><span>Reflections</span><strong>{day.entries.length}</strong></div>
            <div><span>Orders executed</span><strong>{day.executedOrders}</strong></div>
            <div><span>Closed trades</span><strong>{day.closedTrades}</strong></div>
            <div><span>HR samples</span><strong>{day.sampleCount.toLocaleString()}</strong></div>
          </div>
          <button className={cx("primary")} disabled={active && !day.sessions.some(item => item.id === selected.id)} onClick={() => onOpen(day.sessions.find(item => item.id === selected.id) || day.sessions[0])}>Open Trading Journal</button>
          <div className={cx("day-feeling")}>
            <div>
              <span className={cx("eyebrow")}>How you described the day</span>
              <p>{day.labels.length
                ? "These are your own reflection labels, collected across this day's recordings."
                : "Add a reflection to give this day your own context."}</p>
            </div>
            {day.labels.length > 0 && (
              <div className={cx("day-labels")} aria-label="Reflection label counts">
                {day.labels.map(({ name, count }) => (
                  <div key={name} className={cx("day-label-row")}>
                    <span>{name}</span><div aria-hidden="true"><i style={{ width: `${(count / day.entries.length) * 100}%` }} /></div><b>{count}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!!totals.length && (
            <div className={cx("day-performance")}>
              <span>Realised trade P&L</span>
              <strong>{totals.map(([currency, value]) => `${value > 0 ? "+" : ""}${money(value, currency)}`).join(" · ")}</strong>
            </div>
          )}
          <div className={cx("day-recordings")}>
            {day.sessions.map((item) => (
              <RecordingModule
                key={item.id}
                item={item}
                selected={selected}
                selectedSamples={selectedSamples}
                owner={owner}
                baselineSeconds={baselineSeconds}
                active={active}
                onOpen={() => onOpen(item)}
                onManage={() => onManage(item)}
                onEntry={(entry) => onEntry(item, entry)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function SessionDays({
  history,
  selected,
  selectedSamples,
  owner,
  baselineSeconds,
  active,
  onOpen,
  onManage,
  onEntry,
}: {
  history: Session[];
  selected: Session;
  selectedSamples: Sample[];
  owner: string;
  baselineSeconds: number;
  active: boolean;
  onOpen: (session: Session) => void;
  onManage: (session: Session) => void;
  onEntry: (session: Session, entry: JournalEntry) => void;
}) {
  const days = useMemo(() => groupSessionDays(history), [history]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const currentDay = days.find((day) => day.sessions.some((session) => session.id === selected.id));
  const effectiveDay = openDay === null ? (currentDay?.key || days[0]?.key) : openDay;
  return (
    <div className={cx("day-list")}>
      {days.map((day) => (
        <DayModule
          key={day.key}
          day={day}
          open={effectiveDay === day.key}
          onToggle={() => setOpenDay(effectiveDay === day.key ? "" : day.key)}
          selected={selected}
          selectedSamples={selectedSamples}
          owner={owner}
          baselineSeconds={baselineSeconds}
          active={active}
          onOpen={onOpen}
          onManage={onManage}
          onEntry={onEntry}
        />
      ))}
    </div>
  );
}
