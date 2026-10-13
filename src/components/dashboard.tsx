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
  Mic,
  Pencil,
} from "lucide-react";
import { usePulse } from "./use-pulse";
import { Timeline } from "./timeline";
import { summary, eventWindow, nearest, downsample } from "@/lib/analytics";
import { cadenceOptions, clock, money, type TradeEvent } from "@/lib/model";
import dynamic from "next/dynamic";
const CsvImporter = dynamic(() => import("./csv-importer"));
const TradingViewConnection = dynamic(() => import("./tradingview-connection"));
import { authClient, cloudConfigured, pullSessions, sync } from "@/lib/cloud";
import {
  detectHrMoments,
  liveNotes,
  personalProfile,
  personalQuestion,
} from "@/lib/smart-journal";
import ReflectionEditor, {
  Screenshot,
  type ReflectionDraft,
} from "./reflection-editor";
import SmartCheckins from "./smart-checkins";
import JournalInsights from "./journal-insights";
import { removeScreenshot } from "@/lib/screenshots";
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
    [modal, setModal] = useState<
      "trade" | "note" | "delete" | "csv" | "moment" | null
    >(null),
    [selected, setSelected] = useState<TradeEvent | null>(null),
    [range, setRange] = useState(0),
    [replay, setReplay] = useState(false),
    [replayPosition, setReplayPosition] = useState(100),
    [busy, setBusy] = useState(false),
    [journalFilter, setJournalFilter] = useState("All entries"),
    [tradePair, setTradePair] = useState(false);
  const [noteDraft, setNoteDraft] = useState<ReflectionDraft | null>(null),
    [momentTime, setMomentTime] = useState(0);
  const s = p.session,
    isWorkspace = s?.id === "workspace";
  const fullEnd = s?.endedAt
    ? Math.min(s.endedAt, p.now)
    : p.active
      ? Math.max(p.now, s?.startedAt || 0)
      : Math.max(
          s?.startedAt || p.now,
          p.samples.at(-1)?.t || 0,
          s?.events.at(-1)?.t || 0,
          s?.journal.at(-1)?.t || 0,
        );
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
    () =>
      summary(
        shown,
        p.samples[0]?.t || s?.startedAt || 0,
        p.settings.baselineSeconds,
      ),
    [shown, s?.startedAt, p.settings.baselineSeconds],
  );
  const insightSamples = useMemo(
    () => shown.filter((x) => x.t <= p.insightTime),
    [shown, p.insightTime],
  );
  const insight = useMemo(
    () =>
      summary(
        insightSamples,
        p.samples[0]?.t || s?.startedAt || 0,
        p.settings.baselineSeconds,
      ),
    [insightSamples, s?.startedAt, p.settings.baselineSeconds],
  );
  const latest = shown.at(-1);
  const delta =
    latest && stats.baseline !== null
      ? Math.round(latest.bpm - stats.baseline)
      : null;
  const visibleEvents = s?.events.filter((e) => e.t <= viewEnd) || [];
  const pnl = visibleEvents.reduce(
      (v, e) =>
        v + (e.kind === "exit" && e.provenance !== "alert" ? (e.pnl ?? 0) : 0),
      0,
    ),
    closed = visibleEvents.filter(
      (e) => e.kind === "exit" && e.provenance !== "alert",
    ),
    wins = closed.filter((e) => (e.pnl ?? 0) > 0).length;
  const hasPnl = closed.some((e) => e.pnl !== undefined);
  const stale = p.recording && (!latest || p.now - latest.t > 10000);
  const profile = useMemo(
    () =>
      personalProfile(
        s && !isWorkspace
          ? [s, ...p.history.filter((h) => h.id !== s.id)]
          : p.history,
        p.owner,
      ),
    [s, p.history, p.owner, isWorkspace],
  );
  const threshold = p.settings.personalize
    ? (profile.suggestedThreshold ?? p.settings.threshold)
    : p.settings.threshold;
  const moments = useMemo(
    () =>
      detectHrMoments(p.samples, {
        baselineSeconds: p.settings.baselineSeconds,
        threshold,
      }),
    [p.samples, p.settings.baselineSeconds, threshold],
  );
  function openReflection(draft: ReflectionDraft) {
    setNoteDraft(draft);
    setModal("note");
  }
  async function openLiveReflection(draft: ReflectionDraft) {
    if (!p.active && !isWorkspace) await p.start();
    openReflection(draft);
  }
  function inspectMoment(t: number) {
    if (!s || t < s.startedAt || t > (p.active ? Date.now() : fullEnd)) {
      p.setError("Choose a moment inside this journal's time range.");
      return;
    }
    setMomentTime(t);
    setModal("moment");
  }
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
    if (p.active) return;
    if (!replay && replayPosition === 100) setReplayPosition(0);
    setReplay(!replay);
  }
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
            Personal workspace<small>0.4 · Smart journal</small>
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
            <span className={"status-dot " + (p.active ? "green" : "")} />
            <div>
              {p.recording ? "Wearable connected" : "Journal ready"}
              <small>
                {p.recording
                  ? "Recording heart-rate samples"
                  : "Wearables are optional"}
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
                        ? "Bring TradingView alerts, CSV trades, and optional wearables into your journal."
                        : "Choose the rhythm that fits the way you trade."}
              </p>
            </div>
            <button
              className={p.active ? "button stop" : "button primary"}
              disabled={busy}
              onClick={() => act(p.active ? p.stop : p.start)}
            >
              {p.active ? <Square size={14} /> : <Radio size={16} />}{" "}
              {p.active ? "End session" : "Start session"}
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
          <SmartCheckins
            owner={p.owner}
            sessionId={s.id}
            settings={p.settings}
            recording={p.recording}
            now={p.now}
            latestSampleTime={p.samples.at(-1)?.t}
            moments={moments}
            blocked={!!modal || !!selected}
            onOpen={(draft) => void act(() => openLiveReflection(draft))}
          />
          {(tab === "Overview" || tab === "Journal") && (
            <div className="smart-journal-toolbar">
              <button
                className="button"
                onClick={() =>
                  void act(() =>
                    openLiveReflection({
                      t: Date.now(),
                      source: "voice",
                      autoListen: true,
                    }),
                  )
                }
              >
                <Mic size={16} /> Voice check-in{" "}
                <kbd>Alt + {p.settings.shortcutKey.toUpperCase()}</kbd>
              </button>
              <span>Your words. Your patterns.</span>
            </div>
          )}
          {(tab === "Overview" || tab === "Journal") && (
            <JournalInsights
              session={s}
              moments={moments.filter((m) => m.t <= viewEnd)}
              profile={profile}
              hasSamples={p.samples.length > 0}
              onMoment={(t, hrEventId) =>
                openReflection({ t, source: "hr-checkin", hrEventId })
              }
              onEvidence={(id) => {
                const target = p.history.find((h) => h.id === id);
                if (id === s.id) setTab("Journal");
                else if (target)
                  void act(async () => {
                    await p.openSession(target);
                    setTab("Journal");
                  });
              }}
            />
          )}
          {tab === "Overview" && (
            <>
              <div className="session-bar">
                <div>
                  <span className={"status-dot " + (p.active ? "green" : "")} />
                  <strong>
                    {p.active
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
                {p.samples.length > 0 || p.recording ? (
                  <>
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
                        stats.baseline === null
                          ? "—"
                          : Math.round(stats.baseline)
                      }
                      unit="BPM"
                      detail={`First ${p.settings.baselineSeconds / 60} minutes · ${shown.length && shown.at(-1)!.t < s.startedAt + p.settings.baselineSeconds * 1000 ? "building" : "sample average"}`}
                      icon={<Target size={17} />}
                    />
                  </>
                ) : (
                  <>
                    <Stat
                      label="Reflections"
                      value={liveNotes(s.journal).length}
                      detail="Your notes and observations"
                      icon={<BookOpen size={17} />}
                    />
                    <Stat
                      label="Journal source"
                      value={
                        isWorkspace
                          ? "Ready"
                          : s.source === "csv"
                            ? "CSV"
                            : s.source === "tradingview"
                              ? "TradingView"
                              : "Journal"
                      }
                      detail="A wearable is optional"
                      icon={<BookOpen size={17} />}
                    />
                  </>
                )}
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
                  value={visibleEvents
                    .filter((e) => e.provenance !== "alert")
                    .length.toString()
                    .padStart(2, "0")}
                  detail={
                    <>
                      <span className="mint">
                        {
                          visibleEvents.filter(
                            (e) =>
                              e.kind === "entry" && e.provenance !== "alert",
                          ).length
                        }{" "}
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
                        className={p.active ? "live-badge" : "subtle-badge"}
                      >
                        {p.active
                          ? stale
                            ? "NO SIGNAL"
                            : "LIVE"
                          : replay
                            ? "REPLAY"
                            : "TIMELINE"}
                      </span>
                    </h2>
                    <p>
                      Trades, reflections, and any heart-rate data share one
                      timeline.
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
                  {p.samples.length > 0 && (
                    <span>
                      <i className="line orange-bg" />
                      Heart rate
                    </span>
                  )}
                  <span>
                    <i className="circle mint-bg" />
                    Entry
                  </span>
                  <span>
                    <i className="circle purple-bg" />
                    Exit
                  </span>
                  {stats.baseline !== null && (
                    <span>
                      <i className="dashed" />
                      Baseline
                    </span>
                  )}
                  <span className="legend-unit">
                    {p.samples.length > 0 ? "BPM · " : ""}
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}
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
                  onMoment={inspectMoment}
                  moments={moments.filter((m) => m.t <= viewEnd)}
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
                      onClick={() =>
                        openReflection({ t: selected?.t || viewEnd })
                      }
                    >
                      <Plus size={14} />
                      Add moment
                    </button>
                    <span className="divider" />
                    <button
                      className="text-button"
                      onClick={toggleReplay}
                      disabled={
                        p.active ||
                        (!p.samples.length &&
                          !s.events.length &&
                          !liveNotes(s.journal).length)
                      }
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
                      <button
                        className="icon-button"
                        title="Import CSV"
                        aria-label="Import trade CSV"
                        onClick={() => setModal("csv")}
                      >
                        <Upload size={16} />
                      </button>
                      <button
                        className="button small-button"
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
                          {(shown.length > 0 || p.recording) && (
                            <th>Heart rate</th>
                          )}
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
                                  {e.provenance === "alert" ? (
                                    <Radio size={12} />
                                  ) : e.kind === "entry" ? (
                                    <ArrowUpRight size={12} />
                                  ) : (
                                    <ArrowDownLeft size={12} />
                                  )}{" "}
                                  {e.provenance === "alert"
                                    ? "Price alert"
                                    : e.kind}
                                </span>
                                <small className="event-origin">
                                  {e.provenance === "backtest"
                                    ? "CSV · Backtest"
                                    : e.source === "tradingview"
                                      ? e.provenance === "strategy"
                                        ? "TradingView · Strategy"
                                        : "TradingView · Alert"
                                      : e.source === "csv"
                                        ? "CSV"
                                        : "Manual"}
                                </small>
                              </td>
                              <td className="tabular">
                                {clock(e.t).replace(/\s?(AM|PM)$/, "")}
                              </td>
                              {(shown.length > 0 || p.recording) && (
                                <td className="tabular">
                                  {nearest(shown, e.t)?.bpm ?? "—"}
                                  <small className="inline-muted"> BPM</small>
                                </td>
                              )}
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
                          ? "Your journal works on its own"
                          : `Your session peaked at ${insight.peak} BPM`}
                      </h3>
                      <p>
                        {insight.baseline === null
                          ? "Add trades and reflections now. Attach a wearable whenever you want heart-rate context."
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
                        {liveNotes(s.journal).length
                          ? `${liveNotes(s.journal).length} moments with personal context`
                          : "Numbers tell part of the story"}
                      </h3>
                      <p>
                        {liveNotes(s.journal).length
                          ? "Your journal adds what a sensor cannot: what you were thinking and feeling."
                          : "Add a moment to describe what this session felt like to you."}
                      </p>
                      <button
                        className="text-button orange"
                        onClick={() =>
                          openReflection({ t: selected?.t || viewEnd })
                        }
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
                  onClick={() => openReflection({ t: selected?.t || viewEnd })}
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
                    Start a journal, drop a CSV, or connect TradingView. No
                    wearable needed.
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
                          if (!p.active) setTab("Overview");
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
                  onClick={() => openReflection({ t: selected?.t || viewEnd })}
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
                {liveNotes(s.journal)
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
                        {nearest(p.samples, j.t)
                          ? `${nearest(p.samples, j.t)!.bpm} BPM at this moment · Self-reported`
                          : "Self-reported reflection"}
                      </small>
                      {j.screenshot && <Screenshot {...j.screenshot} />}
                      <div className="inline-actions">
                        <button
                          className="text-button"
                          onClick={() => openReflection({ t: j.t, entry: j })}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            void act(async () => {
                              await p.removeNote(j.id);
                              if (j.screenshot)
                                await removeScreenshot(j.screenshot.path);
                              p.setNotice(
                                "Reflection removed from your journal and personal insights.",
                              );
                            })
                          }
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {liveNotes(s.journal).filter(
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
                      {p.recording ? "Connected" : "Optional Bluetooth"}
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
                    <li>
                      Attach WHOOP and choose your sensor. Journaling works
                      without it.
                    </li>
                  </ol>
                  <div className="connection-note">
                    Keep this tab open and your device awake. Bluetooth
                    recording is unavailable in Safari and iPhone browsers. No
                    WHOOP login is needed.
                  </div>
                  <button
                    className="button primary"
                    disabled={busy || p.recording}
                    onClick={() => act(p.attachWhoop)}
                  >
                    <Bluetooth size={16} />
                    {p.recording
                      ? "Recording with " + p.device
                      : "Attach WHOOP to journal"}
                  </button>
                  {p.recording && (
                    <button
                      className="text-button"
                      onClick={() => act(p.detachWearable)}
                    >
                      Disconnect wearable
                    </button>
                  )}
                </section>
                <TradingViewConnection
                  onChanged={() =>
                    p.setNotice("TradingView connection updated.")
                  }
                />
              </div>
              <section className="glass import-card csv-import-panel">
                <h2>CSV trade history</h2>
                <CsvImporter
                  active={p.active}
                  hasSession={!isWorkspace}
                  onImport={async (events, name, destination) => {
                    await p.importEvents(events, name, destination);
                    p.setNotice(
                      `${events.length} events imported. Re-importing identical executions does not duplicate them.`,
                    );
                    setTab("Overview");
                  }}
                />
              </section>
              <section className="glass connection-note">
                <h3>Optional wearable context</h3>
                <p>
                  Your journal and trading integrations work without a sensor.
                  WHOOP Bluetooth is available now. Apple Health, Oura, and
                  Garmin are planned connectors; they are not connected or
                  simulated in this release.
                </p>
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
                    <option value="on">On · offer a check-in</option>
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
                <label>
                  Check-in beep
                  <select
                    aria-label="Check-in beep"
                    value={p.settings.sound ? "on" : "off"}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        sound: e.target.value === "on",
                      })
                    }
                  >
                    <option value="off">Off</option>
                    <option value="on">On · short beep</option>
                  </select>
                </label>
                <label>
                  Spoken check-in question
                  <select
                    aria-label="Spoken check-in question"
                    value={p.settings.spokenPrompt ? "on" : "off"}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        spokenPrompt: e.target.value === "on",
                      })
                    }
                  >
                    <option value="off">Off</option>
                    <option value="on">On · ask what I am feeling</option>
                  </select>
                </label>
                <label>
                  Check-in cooldown
                  <select
                    aria-label="Check-in cooldown"
                    value={p.settings.cooldownSeconds}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        cooldownSeconds: +e.target.value,
                      })
                    }
                  >
                    {[60, 120, 300, 600].map((n) => (
                      <option key={n} value={n}>
                        {n / 60} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Dictation shortcut
                  <select
                    aria-label="Dictation shortcut"
                    value={p.settings.shortcutKey}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        shortcutKey: e.target.value,
                      })
                    }
                  >
                    {["j", "k", "m"].map((k) => (
                      <option key={k} value={k}>
                        Alt + {k.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <small>
                    Works while Trade Pulse is focused. Dictation requests
                    microphone permission.
                  </small>
                </label>
                <label>
                  Learned sensitivity
                  <select
                    aria-label="Learned sensitivity"
                    value={p.settings.personalize ? "on" : "off"}
                    onChange={(e) =>
                      p.configure({
                        ...p.settings,
                        personalize: e.target.value === "on",
                      })
                    }
                  >
                    <option value="on">
                      On · use my confirmed HR-linked check-ins
                    </option>
                    <option value="off">Off · use my chosen threshold</option>
                  </select>
                  <small>
                    Current threshold: +{threshold} BPM. Uses your chosen
                    threshold until enough personal evidence exists.
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
                    disabled={p.active}
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
                    disabled={isWorkspace || p.active}
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
      {modal === "csv" && (
        <Modal title="Import trade CSV" onClose={() => setModal(null)}>
          <CsvImporter
            active={p.active}
            hasSession={!isWorkspace}
            onImport={async (events, name, destination) => {
              await p.importEvents(events, name, destination);
              p.setNotice(`${events.length} events imported.`);
              setTab("Overview");
            }}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}
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
                if (
                  tradePair &&
                  new Date(String(f.get("exitTime"))).getTime() < t
                )
                  throw new Error("Exit time must be at or after entry time.");
                await p.addEvents([
                  {
                    id: crypto.randomUUID(),
                    t,
                    symbol: String(f.get("symbol")).toUpperCase(),
                    kind: tradePair
                      ? "entry"
                      : (f.get("kind") as "entry" | "exit"),
                    side: f.get("side") as "long" | "short",
                    price: Number(f.get("price")),
                    quantity: Number(f.get("quantity")),
                    ...(!tradePair && pnlText ? { pnl: Number(pnlText) } : {}),
                    source: "manual",
                  },
                  ...(tradePair
                    ? [
                        {
                          id: crypto.randomUUID(),
                          t: new Date(String(f.get("exitTime"))).getTime(),
                          symbol: String(f.get("symbol")).toUpperCase(),
                          kind: "exit" as const,
                          side: f.get("side") as "long" | "short",
                          price: Number(f.get("exitPrice")),
                          quantity: Number(f.get("quantity")),
                          ...(pnlText ? { pnl: Number(pnlText) } : {}),
                          source: "manual" as const,
                        },
                      ]
                    : []),
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
                <select
                  name="kind"
                  onChange={() => setTradePair(false)}
                  disabled={tradePair}
                >
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
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={tradePair}
                onChange={(e) => setTradePair(e.target.checked)}
              />{" "}
              Record the matching exit too
            </label>
            {tradePair && (
              <div className="form-grid">
                <label>
                  Exit time · your local timezone
                  <input
                    name="exitTime"
                    type="datetime-local"
                    step="1"
                    required
                  />
                </label>
                <label>
                  Exit price
                  <input
                    name="exitPrice"
                    type="number"
                    min="0"
                    step="any"
                    required
                  />
                </label>
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              Save event
            </button>
          </form>
        </Modal>
      )}
      {modal === "note" && (
        <Modal
          title={
            noteDraft?.entry
              ? "Edit your reflection"
              : "Give this moment some context"
          }
          onClose={() => {
            setModal(null);
            setNoteDraft(null);
          }}
        >
          <ReflectionEditor
            draft={noteDraft || { t: selected?.t || viewEnd }}
            owner={p.owner}
            prepareScreenshot={p.prepareScreenshot}
            question={
              p.settings.personalize
                ? personalQuestion(
                    profile,
                    s.events,
                    noteDraft?.t || selected?.t || viewEnd,
                  )
                : "What is happening? What are you feeling?"
            }
            onSave={p.addNote}
            onDone={() => {
              setModal(null);
              setNoteDraft(null);
              p.setNotice(
                "Reflection saved. Your personal insights have been updated.",
              );
            }}
          />
        </Modal>
      )}
      {modal === "moment" && (
        <Modal title="Investigate this moment" onClose={() => setModal(null)}>
          <p>
            {clock(momentTime)} · {p.settings.windowSeconds} seconds before and
            after
          </p>
          {(() => {
            const w = eventWindow(
              p.samples,
              { t: momentTime },
              p.settings.windowSeconds,
            );
            return (
              <div className="form-grid">
                <div>
                  Before
                  <strong className="moment-stat">
                    {w.before === null
                      ? "No HR data"
                      : `${Math.round(w.before)} BPM`}
                  </strong>
                </div>
                <div>
                  At this moment
                  <strong className="moment-stat">
                    {w.at === null ? "No HR data" : `${w.at} BPM`}
                  </strong>
                </div>
                <div>
                  After
                  <strong className="moment-stat">
                    {w.after === null
                      ? "No HR data"
                      : `${Math.round(w.after)} BPM`}
                  </strong>
                </div>
              </div>
            );
          })()}
          <p className="form-intro">
            No trade is required. Add a reflection and an optional chart
            screenshot to explain the market context.
          </p>
          <button
            className="button primary full"
            onClick={() => openReflection({ t: momentTime })}
          >
            Add reflection and screenshot
          </button>
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
                  onClick={() => openReflection({ t: selected?.t || viewEnd })}
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
