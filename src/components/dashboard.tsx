"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bluetooth,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  ExternalLink,
  Heart,
  History,
  LayoutDashboard,
  Link2,
  LogOut,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Target,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { usePulse } from "./use-pulse";
import { Timeline } from "./timeline";
import { summary, eventWindow, nearest, downsample } from "@/lib/analytics";
import { cadenceOptions, clock, money, type TradeEvent } from "@/lib/model";
import { parseTrades, csvTemplate } from "@/lib/csv";
import {
  authClient,
  cloudConfigured,
  api,
  pullSessions,
  sync,
} from "@/lib/cloud";
type Tab = "Overview" | "Sessions" | "Journal" | "Connections" | "Settings";
function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((s / 60) % 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function download(name: string, text: string, type = "application/json") {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function Stat({
  label,
  value,
  unit,
  detail,
  icon,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail: ReactNode;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="stat glass">
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="stat-detail">{detail}</div>
      {children}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  error,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={19} />
        </button>
      </div>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      {children}
    </dialog>
  );
}
export default function Dashboard({
  user,
}: {
  user: import("@/lib/workspace").WorkspaceUser;
}) {
  const p = usePulse(user);
  const [tab, setTab] = useState<Tab>("Overview"),
    [modal, setModal] = useState<"trade" | "note" | "delete" | null>(null),
    [selected, setSelected] = useState<TradeEvent | null>(null),
    [range, setRange] = useState(0),
    [replay, setReplay] = useState(false),
    [replayPosition, setReplayPosition] = useState(100),
    [busy, setBusy] = useState(false),
    [hook, setHook] = useState(""),
    [journalFilter, setJournalFilter] = useState("All entries");
  const s = p.session,
    isWorkspace = s?.id === "workspace";
  const fullEnd =
    s?.endedAt || (p.recording ? p.now : p.samples.at(-1)?.t) || p.now;
  const viewEnd =
    replayPosition < 100 && s
      ? s.startedAt + ((fullEnd - s.startedAt) * replayPosition) / 100
      : fullEnd;
  const viewStart = s
    ? Math.max(s.startedAt, range ? viewEnd - range * 60000 : s.startedAt)
    : p.now;
  const shown = useMemo(
    () => p.samples.filter((x) => x.t <= viewEnd),
    [p.samples, viewEnd],
  );
  const stats = useMemo(
    () => summary(shown, s?.startedAt || 0, p.settings.baselineSeconds),
    [shown, s?.startedAt, p.settings.baselineSeconds],
  );
  const insightSamples = useMemo(
    () => shown.filter((x) => x.t <= p.insightTime),
    [shown, p.insightTime],
  );
  const insight = useMemo(
    () =>
      summary(insightSamples, s?.startedAt || 0, p.settings.baselineSeconds),
    [insightSamples, s?.startedAt, p.settings.baselineSeconds],
  );
  const latest = shown.at(-1);
  const delta =
    latest && stats.baseline !== null
      ? Math.round(latest.bpm - stats.baseline)
      : null;
  const visibleEvents = s?.events.filter((e) => e.t <= viewEnd) || [];
  const pnl = visibleEvents.reduce(
      (v, e) => v + (e.kind === "exit" ? (e.pnl ?? 0) : 0),
      0,
    ),
    closed = visibleEvents.filter((e) => e.kind === "exit"),
    wins = closed.filter((e) => (e.pnl ?? 0) > 0).length;
  const hasPnl = closed.some((e) => e.pnl !== undefined);
  const stale = p.recording && (!latest || p.now - latest.t > 10000);
  useEffect(() => {
    if (!replay) return;
    const timer = setInterval(
      () =>
        setReplayPosition((x) => {
          if (x >= 100) {
            setReplay(false);
            return 100;
          }
          return Math.min(100, x + 0.5);
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [replay]);
  useEffect(() => {
    setReplay(false);
    setReplayPosition(100);
    setSelected(null);
    setHook("");
  }, [s?.id]);
  async function act(task: () => Promise<unknown>) {
    setBusy(true);
    p.setError("");
    try {
      await task();
    } catch (e) {
      p.setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function exportSession() {
    if (s)
      download(
        `trade-pulse-${s.id}.json`,
        JSON.stringify(
          { version: 1, session: s, samples: p.samples, settings: p.settings },
          null,
          2,
        ),
      );
  }
  function toggleReplay() {
    if (p.recording) return;
    if (!replay && replayPosition === 100) setReplayPosition(0);
    setReplay(!replay);
  }
  const [cloudHealth, setCloudHealth] = useState(false);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setCloudHealth(d.cloudConfigured))
      .catch(() => {});
  }, []);
  if (!s)
    return (
      <div className="loading">
        <Activity size={32} />
        <span>Opening Trade Pulse…</span>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Trade Pulse home">
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          <span>
            trade<span className="brand-light">pulse</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">TP</span>
          <div>
            Personal workspace<small>MVP · Personal analytics</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { name: "Overview", icon: LayoutDashboard },
              { name: "Sessions", icon: History },
              { name: "Journal", icon: BookOpen },
              { name: "Connections", icon: Link2 },
              { name: "Settings", icon: SlidersHorizontal },
            ] as const
          ).map((n) => (
            <button
              key={n.name}
              className={tab === n.name ? "nav active" : "nav"}
              onClick={() => setTab(n.name)}
            >
              <n.icon size={18} />
              {n.name}
              {n.name === "Sessions" && (
                <span className="nav-count">{p.history.length}</span>
              )}
              {n.name === "Overview" && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="device-mini">
            <span className={"status-dot " + (p.recording ? "green" : "")} />
            <div>
              {p.recording ? "WHOOP connected" : "Make the connection"}
              <small>
                {p.recording
                  ? "Recording heart-rate samples"
                  : "Bring your physiology into focus"}
              </small>
            </div>
            <Bluetooth size={16} />
          </div>
          <button className="user-button" onClick={() => setTab("Settings")}>
            <span className="avatar">
              {p.email ? p.email[0].toUpperCase() : "T"}
            </span>
            <span>
              {p.email?.split("@")[0] || "Your workspace"}
              <small>{"Private account"}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace
            <ChevronRight size={13} />
            <strong>{tab}</strong>
          </div>
          <div className="topbar-right">
            <span className="private-label">
              <ShieldCheck size={14} />
              Private by design
            </span>
            <span className="divider" />
            <span className="sync-label">
              <Cloud size={15} />
              {p.syncState}
            </span>
            <button
              className="icon-button"
              onClick={() => setTab("Settings")}
              aria-label="Settings"
            >
              <Settings size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR EDGE STARTS WITH AWARENESS</div>
              <h1>
                {tab === "Overview"
                  ? "Know your pulse. Understand your trades."
                  : tab === "Sessions"
                    ? "Every session tells a story."
                    : tab === "Journal"
                      ? "Put your experience into words."
                      : tab === "Connections"
                        ? "Connect your trading world."
                        : "Make it your own."}
              </h1>
              <p>
                {tab === "Overview"
                  ? "A clearer picture of what happens within you, while the market moves."
                  : tab === "Sessions"
                    ? "Revisit your heart rate, trade events, and personal context."
                    : tab === "Journal"
                      ? "Your labels. Your observations. A little more understanding each session."
                      : tab === "Connections"
                        ? "Pair your WHOOP and bring TradingView alerts onto one timeline."
                        : "Choose the rhythm that fits the way you trade."}
              </p>
            </div>
            <button
              className={p.recording ? "button stop" : "button primary"}
              disabled={busy}
              onClick={() => act(p.recording ? p.stop : p.start)}
            >
              {p.recording ? <Square size={14} /> : <Radio size={16} />}{" "}
              {p.recording ? "End session" : "Start session"}
            </button>
          </div>
          {p.error && (
            <div role="alert" className="banner error">
              <span>{p.error}</span>
              <button onClick={() => p.setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {p.recording &&
            p.settings.alerts &&
            insight.baseline !== null &&
            insightSamples.length > 0 &&
            insightSamples.at(-1)!.bpm - insight.baseline >=
              p.settings.threshold && (
              <div className="banner" role="status">
                <span>
                  Heart rate is{" "}
                  {Math.round(insightSamples.at(-1)!.bpm - insight.baseline)}{" "}
                  BPM above your opening baseline at the last insight refresh.
                  Add your own context if useful.
                </span>
              </div>
            )}
          {p.notice && (
            <div role="status" className="banner">
              <span>{p.notice}</span>
              <button
                onClick={() => p.setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "Overview" && (
            <>
              <div className="session-bar">
                <div>
                  <span
                    className={"status-dot " + (p.recording ? "green" : "")}
                  />
                  <strong>
                    {p.recording
                      ? "Session in progress"
                      : isWorkspace
                        ? "No active session"
                        : "Session review"}
                  </strong>
                  {!isWorkspace && (
                    <span className="muted">
                      {new Date(s.startedAt).toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                  <span className="session-clock">
                    <Clock size={13} />
                    {isWorkspace ? "—" : duration(fullEnd - s.startedAt)}
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={() => setTab("Settings")}
                >
                  <SlidersHorizontal size={14} /> Insights every{" "}
                  {p.settings.cadence < 60
                    ? `${p.settings.cadence}s`
                    : `${p.settings.cadence / 60}m`}
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  label={
                    p.recording ? "Current heart rate" : "Latest heart rate"
                  }
                  value={stale ? "—" : (latest?.bpm ?? "—")}
                  unit="BPM"
                  detail={
                    <>
                      <span
                        className={
                          delta !== null && delta > 0 ? "orange" : "mint"
                        }
                      >
                        {delta === null
                          ? "Awaiting signal"
                          : `${delta >= 0 ? "+" : ""}${delta} BPM`}
                      </span>{" "}
                      {delta === null ? "" : "from session baseline"}
                    </>
                  }
                  icon={<Heart size={17} className="orange" />}
                >
                  <svg
                    className="spark"
                    viewBox="0 0 120 42"
                    aria-hidden="true"
                  >
                    <path
                      d={downsample(shown.slice(-100), 40)
                        .map(
                          (q, i, a) =>
                            `${i ? "L" : "M"}${(i * 120) / Math.max(1, a.length - 1)},${39 - (q.bpm - 45) * 0.36}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#f78d65"
                      strokeWidth="1.7"
                    />
                  </svg>
                </Stat>
                <Stat
                  label="Session baseline"
                  value={
                    stats.baseline === null ? "—" : Math.round(stats.baseline)
                  }
                  unit="BPM"
                  detail={`First ${p.settings.baselineSeconds / 60} minutes · ${shown.length && shown.at(-1)!.t < s.startedAt + p.settings.baselineSeconds * 1000 ? "building" : "sample average"}`}
                  icon={<Target size={17} />}
                />
                <Stat
                  label="Recorded P&L"
                  value={
                    hasPnl ? (
                      <span className={pnl >= 0 ? "mint" : "rose"}>
                        {money(pnl)}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                  detail={`${closed.length} exits · ${wins} with positive P&L`}
                  icon={<ArrowUpRight size={17} />}
                />
                <Stat
                  label="Trade events"
                  value={visibleEvents.length.toString().padStart(2, "0")}
                  detail={
                    <>
                      <span className="mint">
                        {visibleEvents.filter((e) => e.kind === "entry").length}{" "}
                        entries
                      </span>
                      <span className="dot-separator">·</span>
                      {closed.length} exits
                    </>
                  }
                  icon={<Activity size={17} />}
                />
              </div>
              <section className="glass timeline-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Your session, in sync{" "}
                      <span
                        className={p.recording ? "live-badge" : "subtle-badge"}
                      >
                        {p.recording
                          ? stale
                            ? "NO SIGNAL"
                            : "LIVE"
                          : replay
                            ? "REPLAY"
                            : "TIMELINE"}
                      </span>
                    </h2>
                    <p>
                      Heart rate meets every entry, exit, and moment in between.
                    </p>
                  </div>
                  <div className="segmented">
                    {[
                      { v: 15, l: "15m" },
                      { v: 30, l: "30m" },
                      { v: 60, l: "1h" },
                      { v: 0, l: "All" },
                    ].map((r) => (
                      <button
                        className={range === r.v ? "selected" : ""}
                        key={r.v}
                        onClick={() => setRange(r.v)}
                      >
                        {r.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-legend">
                  <span>
                    <i className="line orange-bg" />
                    Heart rate
                  </span>
                  <span>
                    <i className="circle mint-bg" />
                    Entry
                  </span>
                  <span>
                    <i className="circle purple-bg" />
                    Exit
                  </span>
                  <span>
                    <i className="dashed" />
                    Baseline
                  </span>
                  <span className="legend-unit">
                    BPM · {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </span>
                </div>
                <Timeline
                  samples={shown}
                  events={visibleEvents}
                  journal={s.journal}
                  baseline={stats.baseline}
                  start={viewStart}
                  end={Math.max(viewEnd, viewStart + 60000)}
                  onSelect={setSelected}
                />
                <div className="timeline-bottom">
                  <span>
                    <span className="status-dot small" />
                    {isWorkspace
                      ? "No recorded samples"
                      : `${p.samples.length.toLocaleString()} samples saved`}
                    {stats.gaps > 0 && ` · ${stats.gaps} signal gaps`}
                  </span>
                  <div>
                    <button
                      className="text-button"
                      disabled={isWorkspace}
                      onClick={() => setModal("note")}
                    >
                      <Plus size={14} />
                      Add moment
                    </button>
                    <span className="divider" />
                    <button
                      className="text-button"
                      onClick={toggleReplay}
                      disabled={p.recording || !p.samples.length}
                    >
                      {replay ? <Pause size={14} /> : <Play size={14} />}Replay
                      session
                    </button>
                  </div>
                </div>
                {(replay || replayPosition < 100) && (
                  <div className="replay-bar">
                    <input
                      aria-label="Replay position"
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={replayPosition}
                      onChange={(e) => setReplayPosition(+e.target.value)}
                    />
                    <span>{clock(viewEnd)}</span>
                    <button
                      className="text-button"
                      onClick={() => {
                        setReplay(false);
                        setReplayPosition(100);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                )}
              </section>
              <div className="lower-grid">
                <section className="glass events-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Trade activity{" "}
                        <span className="count-badge">
                          {visibleEvents.length}
                        </span>
                      </h2>
                      <p>The decisions behind the timeline.</p>
                    </div>
                    <div className="inline-actions">
                      <label
                        className="icon-button upload-button"
                        title="Import CSV"
                      >
                        <Upload size={16} />
                        <input
                          aria-label="Import trade CSV"
                          type="file"
                          disabled={isWorkspace}
                          accept=".csv,text/csv"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f)
                              void act(async () => {
                                if (f.size > 2000000)
                                  throw new Error(
                                    "Choose a CSV smaller than 2 MB.",
                                  );
                                await p.addEvents(parseTrades(await f.text()));
                                p.setNotice("Trade events imported.");
                              });
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        className="button small-button"
                        disabled={isWorkspace}
                        onClick={() => setModal("trade")}
                      >
                        <Plus size={14} />
                        Add event
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Instrument</th>
                          <th>Event</th>
                          <th>Time</th>
                          <th>Heart rate</th>
                          <th>P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEvents
                          .slice(-6)
                          .reverse()
                          .map((e) => (
                            <tr key={e.id} onClick={() => setSelected(e)}>
                              <td>
                                <button
                                  className="symbol-button"
                                  onClick={() => setSelected(e)}
                                >
                                  <span
                                    className={
                                      "symbol-icon " +
                                      (e.symbol === "ES" ? "blue" : "")
                                    }
                                  >
                                    {e.symbol.slice(0, 2)}
                                  </span>
                                  <span>
                                    {e.symbol}
                                    <small>
                                      {e.side === "long" ? "Long" : "Short"} ·{" "}
                                      {e.quantity} qty
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <span className={"event-tag " + e.kind}>
                                  {e.kind === "entry" ? (
                                    <ArrowUpRight size={12} />
                                  ) : (
                                    <ArrowDownLeft size={12} />
                                  )}{" "}
                                  {e.kind}
                                </span>
                              </td>
                              <td className="tabular">
                                {clock(e.t).replace(/\s?(AM|PM)$/, "")}
                              </td>
                              <td className="tabular">
                                {nearest(shown, e.t)?.bpm ?? "—"}
                                <small className="inline-muted"> BPM</small>
                              </td>
                              <td
                                className={
                                  (e.pnl ?? 0) >= 0
                                    ? "mint tabular"
                                    : "rose tabular"
                                }
                              >
                                {e.pnl === undefined ? "—" : money(e.pnl)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!visibleEvents.length && (
                      <div className="empty-state">
                        <Activity />
                        <h3>Your first event belongs here.</h3>
                        <p>
                          Add an entry, import a CSV, or connect TradingView.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="panel-footer">
                    {visibleEvents.length > 6
                      ? "Showing the latest 6 events"
                      : "Click an event to explore its context"}
                    <button
                      className="text-button"
                      disabled={isWorkspace}
                      onClick={exportSession}
                    >
                      Export session <Download size={13} />
                    </button>
                  </div>
                </section>
                <section className="glass insights-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <span className="orange">
                          <Zap size={16} />
                        </span>{" "}
                        Session observations
                      </h2>
                      <p>A little perspective, without the noise.</p>
                    </div>
                  </div>
                  <div className="observation">
                    <span className="observation-icon">
                      <Activity size={17} />
                    </span>
                    <div>
                      <h3>
                        {insight.peak === null
                          ? "A baseline starts with you"
                          : `Your session peaked at ${insight.peak} BPM`}
                      </h3>
                      <p>
                        {insight.baseline === null
                          ? "Connect your WHOOP and start a session to build your own timeline."
                          : `${Math.round((insight.peak || 0) - insight.baseline)} BPM above your opening baseline. Context is yours to add.`}
                      </p>
                    </div>
                  </div>
                  <div className="observation">
                    <span className="observation-icon purple">
                      <BookOpen size={17} />
                    </span>
                    <div>
                      <h3>
                        {s.journal.length
                          ? `${s.journal.length} moments with personal context`
                          : "Numbers tell part of the story"}
                      </h3>
                      <p>
                        {s.journal.length
                          ? "Your journal adds what a sensor cannot: what you were thinking and feeling."
                          : "Add a moment to describe what this session felt like to you."}
                      </p>
                      <button
                        className="text-button orange"
                        disabled={isWorkspace}
                        onClick={() => setModal("note")}
                      >
                        Add a reflection <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="insight-note">
                    <ShieldCheck size={13} />
                    <span>
                      Descriptive statistics. No emotion detection or trading
                      recommendations.
                    </span>
                  </div>
                </section>
              </div>
              <section className="journal-strip glass">
                <span className="journal-strip-icon">
                  <BookOpen size={21} />
                </span>
                <div>
                  <h3>Your numbers have a story. Give them context.</h3>
                  <p>
                    A quick reflection today becomes a clearer picture tomorrow.
                  </p>
                </div>
                <button
                  className="button"
                  disabled={isWorkspace}
                  onClick={() => setModal("note")}
                >
                  Open your journal <ArrowUpRight size={14} />
                </button>
              </section>
            </>
          )}
          {tab === "Sessions" && (
            <section className="glass content-panel">
              <div className="panel-heading">
                <div>
                  <h2>Saved sessions</h2>
                  <p>
                    Your recordings stay on this browser. Sign in to enable
                    cloud sync when configured.
                  </p>
                </div>
                <button
                  className="button"
                  disabled={!p.email || busy}
                  onClick={() =>
                    act(async () => {
                      await pullSessions(p.owner);
                      await p.refreshHistory();
                      p.setNotice("Cloud sessions refreshed.");
                    })
                  }
                >
                  <Cloud size={16} />
                  Refresh cloud
                </button>
              </div>
              {p.history.length === 0 ? (
                <div className="empty-state tall">
                  <History size={32} />
                  <h3>Your trading story starts here.</h3>
                  <p>
                    Enable WHOOP Heart Rate Broadcast, then start your first
                    session.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => act(p.start)}
                  >
                    Start a session
                  </button>
                </div>
              ) : (
                <div className="session-list">
                  {p.history.map((item) => (
                    <button
                      key={item.id}
                      className="session-item"
                      onClick={() =>
                        act(async () => {
                          await p.openSession(item);
                          if (!p.recording) setTab("Overview");
                        })
                      }
                    >
                      <span className="session-item-icon">
                        <Activity size={20} />
                      </span>
                      <div>
                        <h3>{item.name}</h3>
                        <p>
                          {new Date(item.startedAt).toLocaleString()} ·{" "}
                          {item.events.length} events ·{" "}
                          {item.sampleCount.toLocaleString()} samples
                        </p>
                      </div>
                      <span className="tag">
                        {item.endedAt ? "Completed" : "Interrupted / active"}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "Journal" && (
            <section className="glass content-panel">
              <div className="panel-heading">
                <div>
                  <h2>Session journal</h2>
                  <p>{s.name} · Reflections belong to the selected session.</p>
                </div>
                <button
                  className="button primary"
                  disabled={isWorkspace}
                  onClick={() => setModal("note")}
                >
                  <Plus size={15} />
                  Add reflection
                </button>
              </div>
              <div className="filter-row">
                {[
                  "All entries",
                  "Focused",
                  "Calm",
                  "Impatient",
                  "FOMO",
                  "Other",
                ].map((f) => (
                  <button
                    key={f}
                    onClick={() => setJournalFilter(f)}
                    className={journalFilter === f ? "filter active" : "filter"}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="journal-grid">
                {s.journal
                  .filter(
                    (j) =>
                      journalFilter === "All entries" ||
                      j.label === journalFilter,
                  )
                  .map((j) => (
                    <article className="journal-card" key={j.id}>
                      <div>
                        <span className="journal-label">{j.label}</span>
                        <time>{clock(j.t)}</time>
                      </div>
                      <p>{j.text || "A moment marked for reflection."}</p>
                      <small>
                        {nearest(p.samples, j.t)?.bpm ?? "—"} BPM at this moment
                        · Self-reported
                      </small>
                    </article>
                  ))}
              </div>
              {s.journal.filter(
                (j) =>
                  journalFilter === "All entries" || j.label === journalFilter,
              ).length === 0 && (
                <div className="empty-state tall">
                  <BookOpen />
                  <h3>A moment worth remembering?</h3>
                  <p>
                    Describe your own experience. Heart rate alone does not tell
                    us how you felt.
                  </p>
                </div>
              )}
            </section>
          )}
          {tab === "Connections" && (
            <>
              <div className="connections-grid">
                <section className="glass connection-card">
                  <div className="connection-top">
                    <span className="connection-logo">
                      <Bluetooth size={26} />
                    </span>
                    <span className="tag">
                      {p.recording ? "Connected" : "Bluetooth"}
                    </span>
                  </div>
                  <h2>WHOOP</h2>
                  <p>
                    Live heart rate, directly from your wearable. Every received
                    sample is preserved independently of your insight interval.
                  </p>
                  <ol>
                    <li>Open WHOOP → Device Settings.</li>
                    <li>
                      Enable <strong>Heart Rate Broadcast</strong>.
                    </li>
                    <li>
                      Use Chrome or Edge on a supported desktop, or Chrome on
                      Android.
                    </li>
                    <li>Start a session and choose your sensor.</li>
                  </ol>
                  <div className="connection-note">
                    Keep this tab open and your device awake. Bluetooth
                    recording is unavailable in Safari and iPhone browsers. No
                    WHOOP login is needed.
                  </div>
                  <button
                    className="button primary"
                    disabled={busy || p.recording}
                    onClick={() => act(p.start)}
                  >
                    <Bluetooth size={16} />
                    {p.recording
                      ? "Recording with " + p.device
                      : "Pair WHOOP & start"}
                  </button>
                </section>
                <section className="glass connection-card">
                  <div className="connection-top">
                    <span className="connection-logo tv">
                      T<span>V</span>
                    </span>
                    <span className="tag">Alerts webhook</span>
                  </div>
                  <h2>TradingView</h2>
                  <p>
                    Bring configured entry and exit alerts into your active
                    session. Alerts are recorded as user-defined events, not
                    verified broker executions.
                  </p>
                  <ol>
                    <li>Sign in and start a real session.</li>
                    <li>Create a session-scoped ingestion token below.</li>
                    <li>In TradingView, set your alert webhook URL.</li>
                    <li>Paste the JSON message and enable the alert.</li>
                  </ol>
                  {!cloudHealth ? (
                    <div className="connection-note">
                      Connections will be available once your account setup is
                      complete.
                    </div>
                  ) : !p.email ? (
                    <button
                      className="button"
                      onClick={() => setTab("Settings")}
                    >
                      Sign in to connect
                    </button>
                  ) : isWorkspace ? (
                    <div className="connection-note">
                      Start a real session to connect your alerts.
                    </div>
                  ) : (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await sync(p.owner);
                          await api({ action: "save", session: s });
                          const result = await api<{ token: string }>({
                            action: "hook",
                            sessionId: s.id,
                          });
                          setHook(result.token);
                        })
                      }
                    >
                      <Link2 size={16} />
                      {hook
                        ? "Rotate ingestion token"
                        : "Generate webhook setup"}
                    </button>
                  )}
                  {hook && (
                    <div className="hook-config">
                      <label>
                        Webhook URL
                        <input
                          readOnly
                          value={`${window.location.origin}/api/tradingview`}
                        />
                      </label>
                      <label>
                        Alert message
                        <textarea
                          rows={9}
                          readOnly
                          value={JSON.stringify(
                            {
                              token: hook,
                              event: {
                                id: "{{ticker}}-{{timenow}}-entry",
                                timestamp: "{{timenow}}",
                                symbol: "{{ticker}}",
                                kind: "entry",
                                side: "long",
                                price: "{{close}}",
                                quantity: 1,
                              },
                            },
                            null,
                            2,
                          )}
                        />
                      </label>
                      <p>
                        Use a different ID and kind for exits. Token expires
                        after 24 hours and can only ingest events into this
                        session. Keep it private. TradingView requires 2FA and a
                        webhook-capable plan.
                      </p>
                      <button
                        className="text-button rose"
                        onClick={() =>
                          act(async () => {
                            await api({ action: "revoke", sessionId: s.id });
                            setHook("");
                            p.setNotice("Ingestion token revoked.");
                          })
                        }
                      >
                        Revoke token
                      </button>
                    </div>
                  )}
                </section>
              </div>
              <section className="glass import-card">
                <Upload size={22} />
                <div>
                  <h3>Already have your trade history?</h3>
                  <p>
                    Import timestamped entries and exits from a CSV. Use
                    explicit timezone offsets and select the matching session.
                  </p>
                </div>
                <button
                  className="button"
                  onClick={() =>
                    download(
                      "trade-pulse-import-template.csv",
                      csvTemplate,
                      "text/csv",
                    )
                  }
                >
                  Download CSV template <Download size={14} />
                </button>
              </section>
            </>
          )}
          {tab === "Settings" && (
            <div className="settings-grid">
              <section className="glass settings-card">
                <h2>Your session preferences</h2>
                <p>
                  Raw data collection always runs independently of these
                  settings.
                </p>
                <label>
                  Insight refresh interval
                  <select
                    value={p.settings.cadence}
                    onChange={(e) =>
                      p.configure({ ...p.settings, cadence: +e.target.value })
                    }
                  >
                    {cadenceOptions.map((c) => (
                      <option key={c} value={c}>
                        {c < 60 ? `${c} seconds` : `${c / 60} minutes`}
                      </option>
                    ))}
                  </select>
                  <small>
                    How often descriptive observations are recalculated while
                    recording.
                  </small>
                </label>
                <label>
                  Opening baseline window
                  <select
                    value={p.settings.baselineSeconds}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        baselineSeconds: +e.target.value,
                      })
                    }
                  >
                    {[60, 180, 300, 600].map((c) => (
                      <option key={c} value={c}>
                        {c / 60} minutes
                      </option>
                    ))}
                  </select>
                  <small>
                    Average of received samples at the beginning of each
                    session.
                  </small>
                </label>
                <label>
                  Before / after event window
                  <select
                    value={p.settings.windowSeconds}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        windowSeconds: +e.target.value,
                      })
                    }
                  >
                    {[15, 30, 60, 300, 600, 1200].map((c) => (
                      <option key={c} value={c}>
                        {c < 60 ? `${c} seconds` : `${c / 60} minutes`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Baseline change notification
                  <select
                    value={p.settings.alerts ? "on" : "off"}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        alerts: e.target.value === "on",
                      })
                    }
                  >
                    <option value="on">On · display a quiet banner</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label>
                  Notification threshold
                  <select
                    value={p.settings.threshold}
                    onChange={(e) =>
                      p.configure({ ...p.settings, threshold: +e.target.value })
                    }
                  >
                    {[10, 15, 20, 25, 30, 40].map((n) => (
                      <option key={n} value={n}>
                        +{n} BPM above baseline
                      </option>
                    ))}
                  </select>
                  <small>
                    A descriptive change threshold, not a medical or trading
                    signal.
                  </small>
                </label>
                <p className="saved-preferences">
                  <Check size={14} />
                  Preferences save automatically on this device.
                </p>
              </section>
              <section className="glass settings-card">
                <h2>Your data, your control</h2>
                <p>
                  {p.email
                    ? `Signed in as ${p.email}`
                    : "Your personal account workspace."}
                </p>
                <div className="settings-callout">
                  <ShieldCheck size={20} />
                  <p>
                    Your recordings belong to this account. A local buffer
                    protects recording during connection interruptions. On
                    shared devices, sign out when finished.
                  </p>
                </div>
                <div className="settings-buttons">
                  <button
                    className="button"
                    disabled={isWorkspace}
                    onClick={exportSession}
                  >
                    <Download size={15} />
                    Export selected session
                  </button>
                  <button
                    className="button"
                    disabled={p.recording}
                    onClick={() =>
                      p.email
                        ? act(async () => {
                            await authClient()?.auth.signOut();
                            p.resetWorkspace();
                          })
                        : setTab("Settings")
                    }
                  >
                    {p.email ? <LogOut size={15} /> : <Cloud size={15} />}
                    {p.email ? "Sign out" : "Sign in to cloud"}
                  </button>
                  <button
                    className="button danger"
                    disabled={isWorkspace || p.recording}
                    onClick={() => setModal("delete")}
                  >
                    <Trash2 size={15} />
                    Delete selected session
                  </button>
                </div>
                <a className="text-button" href="/privacy">
                  Privacy & data details <ExternalLink size={12} />
                </a>
              </section>
            </div>
          )}
          <footer className="app-footer">
            <span>
              <Activity size={13} /> Trade Pulse{" "}
              <span className="footer-dot">·</span> A little more
              self-awareness.
            </span>
            <span>Personal analytics. Your decisions stay yours.</span>
          </footer>
        </main>
      </div>
      {modal === "trade" && (
        <Modal
          error={p.error}
          title="Add a trade event"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                const t = new Date(String(f.get("time"))).getTime();
                const pnlText = String(f.get("pnl"));
                await p.addEvents([
                  {
                    id: crypto.randomUUID(),
                    t,
                    symbol: String(f.get("symbol")).toUpperCase(),
                    kind: f.get("kind") as "entry" | "exit",
                    side: f.get("side") as "long" | "short",
                    price: Number(f.get("price")),
                    quantity: Number(f.get("quantity")),
                    ...(pnlText ? { pnl: Number(pnlText) } : {}),
                    source: "manual",
                  },
                ]);
                setModal(null);
              });
            }}
          >
            <p className="form-intro">
              Record an observation. This does not place a trade.
            </p>
            <div className="form-grid">
              <label>
                Instrument
                <input
                  name="symbol"
                  placeholder="NQ, ES, AAPL…"
                  maxLength={32}
                  required
                  autoFocus
                />
              </label>
              <label>
                Event
                <select name="kind">
                  <option value="entry">Entry</option>
                  <option value="exit">Exit</option>
                </select>
              </label>
              <label>
                Direction
                <select name="side">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                Price
                <input name="price" type="number" min="0" step="any" required />
              </label>
              <label>
                Realized P&L · optional
                <input name="pnl" type="number" step="any" placeholder="USD" />
              </label>
            </div>
            <label>
              Time · your local timezone
              <input
                name="time"
                type="datetime-local"
                step="1"
                defaultValue={new Date(
                  viewEnd - new Date(viewEnd).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 19)}
                required
              />
            </label>
            <button className="button primary full" disabled={busy}>
              Save event
            </button>
          </form>
        </Modal>
      )}
      {modal === "note" && (
        <Modal
          error={p.error}
          title="Give this moment some context"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await p.addNote({
                  id: crypto.randomUUID(),
                  t: selected?.t || viewEnd,
                  label: String(f.get("label")),
                  text: String(f.get("text")),
                });
                setModal(null);
                p.setNotice("Reflection saved.");
              });
            }}
          >
            <p className="form-intro">
              {clock(selected?.t || viewEnd)} ·{" "}
              {nearest(p.samples, selected?.t || viewEnd)?.bpm ?? "—"} BPM. How
              would you describe your experience?
            </p>
            <label>
              Your label
              <select name="label">
                {[
                  "Focused",
                  "Calm",
                  "Confident",
                  "Impatient",
                  "FOMO",
                  "Hesitant",
                  "Frustrated",
                  "Other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Reflection
              <textarea
                name="text"
                placeholder="What was happening? What were you thinking?"
                rows={5}
                maxLength={2000}
                autoFocus
              />
            </label>
            <p className="form-intro">
              This is your own label. Trade Pulse does not infer emotions from
              heart rate.
            </p>
            <button className="button primary full" disabled={busy}>
              Save reflection
            </button>
          </form>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal
          error={p.error}
          title="Delete this session?"
          onClose={() => setModal(null)}
        >
          <p className="form-intro">
            This removes this session, its heart-rate samples, journal, and
            events from this browser and your cloud account if synced. It cannot
            be undone.
          </p>
          <button
            className="button danger full"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await p.deleteSession();
                setModal(null);
              })
            }
          >
            Delete session permanently
          </button>
        </Modal>
      )}
      {selected && !modal && (
        <Modal
          error={p.error}
          title={`${selected.symbol} · ${selected.kind === "entry" ? "Entry" : "Exit"} context`}
          onClose={() => setSelected(null)}
        >
          {(() => {
            const w = eventWindow(shown, selected, p.settings.windowSeconds);
            return (
              <>
                <p className="form-intro">
                  {clock(selected.t)} · {selected.side} · {selected.quantity} at{" "}
                  {selected.price} · Source: {selected.source}
                </p>
                <div className="event-stats">
                  <div>
                    <small>Before · {p.settings.windowSeconds}s</small>
                    <strong>
                      {w.before === null ? "—" : Math.round(w.before)}{" "}
                      <span>BPM</span>
                    </strong>
                  </div>
                  <div>
                    <small>At event</small>
                    <strong>
                      {w.at ?? "—"} <span>BPM</span>
                    </strong>
                  </div>
                  <div>
                    <small>After · {p.settings.windowSeconds}s</small>
                    <strong>
                      {w.after === null ? "—" : Math.round(w.after)}{" "}
                      <span>BPM</span>
                    </strong>
                  </div>
                </div>
                <p className="form-intro">
                  Averages use available samples in your chosen window. Missing
                  readings are left blank; no values are inferred.
                </p>
                <button
                  className="button primary full"
                  disabled={isWorkspace}
                  onClick={() => setModal("note")}
                >
                  Add context to this event <BookOpen size={15} />
                </button>
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
