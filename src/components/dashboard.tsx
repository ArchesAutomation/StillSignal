"use client";
import { useCaptureBaseline } from "./use-capture-baseline";
import { useMomentCapture } from "./use-moment-capture";
import { dailyJournalSession } from "@/lib/journal-collection";
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
  Sparkles,
  Circle,
  Menu,
} from "lucide-react";
import ConceptWorkspace from "./concept/workspace";
import { PhaseLabelsContext } from "./phase-label-context";
import ModuleWorkspace, { WorkspaceModule } from "./module-workspace";
import BlueprintPreferences from "./blueprint-preferences";
import PhaseLabelPreferences from "./phase-label-preferences";
import SignalCalendar from "./signal-calendar";
import SignalOverview from "./signal-overview";
import Stillness from "./stillness";
import SessionReview from "./session-review";
import JournalWriting from "./journal-writing";
import { usePulse } from "./use-pulse";
import { createPortal } from "react-dom";
import { useFloatingJournal } from "./use-floating-journal";
import FloatingJournal from "./floating-journal";
import { Timeline } from "./timeline";
import WorkspaceToolbar from "./workspace-toolbar";
import TradeContextPanel, { PositionHeartRate } from "./trade-context-panel";
import BrokerConnections from "./broker-connections";
import {
  executionAction,
  eventOrigin,
  isActualExecution,
  pnlByCurrency,
} from "@/lib/trade-context";
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
import ExtensionConnection from "./extension-connection";
import TodayReview from "./today-review";
import JournalInsights from "./journal-insights";
import { removeScreenshot } from "@/lib/screenshots";
import type { CsvDestination } from "@/lib/csv-session";
import type { ImportSource } from "@/lib/import-selection";
import { keepPrivateFile } from "@/lib/private-files";
type Tab = import("./concept/shared").Page;
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
  initialSession,
}: {
  user: import("@/lib/workspace").WorkspaceUser;
  initialSession?: import("@/lib/model").Session;
}) {
  const [legacyOpen, setLegacyOpen] = useState(false);
  const legacyDialog = useRef<HTMLDialogElement>(null);
  const floatingJournal = useFloatingJournal();
  const p = usePulse(user, () => {
    void floatingJournal.open();
  });
  useEffect(() => {
    if (legacyOpen && p.session && !legacyDialog.current?.open) {
      if (typeof legacyDialog.current?.showModal === "function")
        legacyDialog.current.showModal();
      else legacyDialog.current?.setAttribute("open", "");
    } else if (!legacyOpen) legacyDialog.current?.close?.();
  }, [legacyOpen, p.session?.id]);
  useEffect(() => {
    if (!p.active) floatingJournal.close();
  }, [p.active, floatingJournal.close]);
  useEffect(() => {
    if (initialSession) void p.openSession(initialSession);
  }, [initialSession]);
  const [accountFilter, setAccountFilter] = useState("");
  const [todayReview, setTodayReview] = useState(false);
  const [instrumentFilter, setInstrumentFilter] = useState("");
  const [contextEvent, setContextEvent] = useState<TradeEvent | undefined>();
  const [journalView, setJournalView] = useState<"Timeline" | "Review">(
    "Timeline",
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [tab, setTab] = useState<Tab>(initialSession ? "Journal" : "Command Center"),
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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("broker_return") || params.has("broker_error")) {
      setTab("Connections");
      setLegacyOpen(true);
    } else if (params.get("review") === "today") {
      setTab("Journal");
      setTodayReview(true);
      setLegacyOpen(true);
    }
  }, []);
  const historicalBaseline = useCaptureBaseline(
    p.session,
    p.history,
    p.settings.baselineSeconds,
  );
  const capture = useMomentCapture({
    session: p.session,
    active: p.active,
    shortcut: p.settings.shortcutKey,
    onSave: p.addNote,
    onSaveBlueprint: p.updateBlueprint,
  });
  const s = p.session,
    isWorkspace = s?.id === "workspace";
  const history = useMemo(
    () =>
      s && !isWorkspace
        ? [s, ...p.history.filter((h) => h.id !== s.id)]
        : p.history,
    [s, p.history, isWorkspace],
  );
  const tabLabel = tab === "Journal" ? "Daily journal" : tab;
  const navigate = (next: Tab) => {
    setTab(next);
    setMobileNav(false);
  };
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [tab]);
  useEffect(() => {
    if (!mobileNav) return;
    const sidebar = document.getElementById("workspace-navigation");
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled)",
        ) || [],
      );
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusables(),
        first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [mobileNav]);
  const fullStart = Math.min(
    s?.startedAt || p.now,
    p.samples[0]?.t ?? Infinity,
    s?.events[0]?.t ?? Infinity,
  );
  const fullEnd = p.active
    ? Math.max(p.now, s?.startedAt || 0)
    : Math.min(
        p.now,
        Math.max(
          s?.endedAt || 0,
          s?.startedAt || p.now,
          p.samples.at(-1)?.t || 0,
          s?.events.at(-1)?.t || 0,
          s?.journal.at(-1)?.t || 0,
        ),
      );
  const viewEnd =
    replayPosition < 100 && s
      ? fullStart + ((fullEnd - fullStart) * replayPosition) / 100
      : fullEnd;
  const viewStart = s
    ? Math.max(fullStart, range ? viewEnd - range * 60000 : fullStart)
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
  const visibleJournal =
    s?.journal.filter(
      (n) =>
        n.t <= viewEnd &&
        (replayPosition >= 100 || (n.updatedAt || n.t) <= viewEnd),
    ) || [];
  const visibleEvents =
    s?.events.filter(
      (e) =>
        !e.voided &&
        e.t <= viewEnd &&
        (!accountFilter ||
          (e.broker?.accountId || e.account || "manual") === accountFilter) &&
        (!instrumentFilter ||
          (e.instrument?.id || e.symbol) === instrumentFilter),
    ) || [];
  const chartInstruments = new Map(
    visibleEvents.map((e) => [e.instrument?.id || e.symbol, e.instrument]),
  );
  const chartInstrument = instrumentFilter
    ? chartInstruments.get(instrumentFilter)
    : chartInstruments.size === 1
      ? chartInstruments.values().next().value
      : undefined;
  const totals = pnlByCurrency(visibleEvents);
  const closed = visibleEvents.filter(
      (e) => e.kind === "exit" && isActualExecution(e),
    ),
    wins = closed.filter((e) => (e.pnl ?? 0) > 0).length;
  const stale = p.recording && (!latest || p.now - latest.t > 10000);
  const profile = useMemo(
    () =>
      personalProfile(
        (s && !isWorkspace
          ? [s, ...p.history.filter((h) => h.id !== s.id)]
          : p.history
        )
          .filter(
            (h) =>
              (h.demo || h.blueprint?.combine?.transcript) &&
              (replayPosition >= 100 || h.startedAt <= viewEnd),
          )
          .map((h) =>
            replayPosition >= 100
              ? {
                  ...h,
                  journal: h.journal.map((n) =>
                    h.demo || h.blueprint?.combine?.hr
                      ? n
                      : { ...n, context: undefined },
                  ),
                }
              : {
                  ...h,
                  events: h.events.filter((e) => e.t <= viewEnd),
                  journal: h.journal.filter(
                    (n) => n.t <= viewEnd && (n.updatedAt || n.t) <= viewEnd,
                  ),
                },
          ),
        p.owner,
      ),
    [s, p.history, p.owner, isWorkspace, viewEnd],
  );
  const threshold = p.settings.personalize
    ? (profile.suggestedThreshold ?? p.settings.threshold)
    : p.settings.threshold;
  const moments = useMemo(
    () =>
      detectHrMoments(shown, {
        baselineSeconds: p.settings.baselineSeconds,
        threshold,
      }),
    [shown, p.settings.baselineSeconds, threshold],
  );
  function openReflection(draft: ReflectionDraft) {
    setNoteDraft({
      ...draft,
      captureMode:
        draft.entry?.captureMode ??
        draft.captureMode ??
        (p.active &&
        new Date(s!.startedAt).toDateString() === new Date().toDateString()
          ? "live"
          : "post-session"),
    });
    setModal("note");
  }
  async function importCsv(
    events: TradeEvent[],
    name: string,
    destination: CsvDestination,
    timezone: string,
    source?: { csv: string; provenance: ImportSource },
  ) {
    if (source)
      await keepPrivateFile(
        p.owner,
        source.provenance.id,
        "csv",
        new Blob([source.csv], { type: "text/csv" }),
      );
    await p.importEvents(
      events,
      name,
      destination,
      timezone,
      source?.provenance,
    );
    setAccountFilter("");
    setInstrumentFilter("");
    setRange(0);
    setReplay(false);
    setReplayPosition(100);
    setContextEvent(undefined);
    setSelected(null);
    p.setNotice(
      `${events.length} trade events imported by timestamp. Your recorded heart rate is preserved. Other dates are available in Sessions.`,
    );
    if (tab !== "Journal" && tab !== "Patterns") setTab("Journal");
  }
  async function openLiveReflection(draft: ReflectionDraft) {
    if (!p.active && !isWorkspace) await p.start();
    openReflection(draft);
  }
  function inspectMoment(t: number) {
    if (!s || t < fullStart || t > viewEnd) {
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
    setJournalView("Timeline");
    setReplayPosition(100);
    setSelected(null);
    setAccountFilter("");
    setInstrumentFilter(
      s?.id === initialSession?.id
        ? initialSession?.events[0]?.instrument?.id || ""
        : "",
    );
    setContextEvent(undefined);
  }, [s?.id]);
  useEffect(() => {
    if (selected && selected.t > viewEnd) setSelected(null);
    if (contextEvent && contextEvent.t > viewEnd) setContextEvent(undefined);
  }, [viewEnd, selected, contextEvent]);
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
        `still-signal-${s.id}.json`,
        JSON.stringify(
          {
            version: 2,
            mediaIncluded: false,
            mediaNotice:
              "Original images and audio are stored separately on the capturing device. Download them from their journal entries.",
            session: s,
            samples: p.samples,
            settings: p.settings,
          },
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
        <span>Opening Still Signal…</span>
      </div>
    );
  return (
    <PhaseLabelsContext.Provider value={p.settings.phaseLabels}><div className="dashboard-shell">
      <ConceptWorkspace
        capture={capture}
        pulse={p}
        session={s}
        history={history}
        page={tab}
        threshold={threshold}
        onPage={(next) => {
          setTab(next);
          setLegacyOpen(next === "Connections" || next === "Settings");
        }}
        onReflect={openReflection}
        onTrade={() => setModal("trade")}
        onCsv={() => setModal("csv")}
        onAdvanced={(event) => {
          setTab("Journal");
          setTodayReview(false);
          setJournalView("Timeline");
          setContextEvent(event);
          setInstrumentFilter(event?.instrument?.id || event?.symbol || "");
          setLegacyOpen(true);
        }}
        onFloat={() => void floatingJournal.open()}
        onExport={exportSession}
        onDelete={() => setModal("delete")}
        onSelectTrade={setSelected}
        onToday={() => {
          setTodayReview(true);
          setTab("Journal");
          setLegacyOpen(true);
        }}
      />
      <dialog
        ref={legacyDialog}
        className="legacy-workspace"
        onCancel={() => {
          setLegacyOpen(false);
          setTab("Journal");
        }}
      >
        <div className="legacy-tool-heading">
          <strong>
            {tab === "Journal" ? "Chart, replay & journal tools" : tab}
          </strong>
          <button
            className="icon-button"
            aria-label="Close workspace tools"
            onClick={() => {
              setLegacyOpen(false);
              setTab("Journal");
            }}
          >
            <X size={20} />
          </button>
        </div>
        <ModuleWorkspace owner={p.owner} page={tab + (todayReview ? " review" : " tools")} enabled={legacyOpen}>
        <div className="app-shell">
          {mobileNav && (
            <button
              className="nav-backdrop"
              aria-label="Close navigation"
              onClick={() => setMobileNav(false)}
            />
          )}
          <aside
            className={`sidebar${mobileNav ? " mobile-open" : ""}`}
            id="workspace-navigation"
          >
            <a className="brand" href="/" aria-label="Still Signal home">
              <span className="brand-icon">
                <Activity size={23} />
              </span>
              <span>
                still<span className="brand-light">signal.</span>
              </span>
            </a>
            <div className="workspace">
              <div>
                <span className="eyebrow">PERSONAL WORKSPACE</span>
                <strong>{p.email?.split("@")[0] || "Your"}’s journal</strong>
                <small>Trading & self-awareness</small>
              </div>
            </div>
            <div className="nav-label">WORKSPACE</div>
            <nav aria-label="Main navigation">
              {(
                [
                  { name: "Overview", icon: LayoutDashboard },
                  { name: "Journal", icon: BookOpen },
                  { name: "Patterns", icon: Activity },
                  { name: "Sessions", icon: History },
                  { name: "Stillness", icon: Circle },
                  { name: "Connections", icon: Link2 },
                  { name: "Settings", icon: SlidersHorizontal },
                ] as const
              ).map((n) => (
                <button
                  key={n.name}
                  aria-current={tab === n.name ? "page" : undefined}
                  className={tab === n.name ? "nav active" : "nav"}
                  onClick={() => navigate(n.name)}
                >
                  <n.icon size={18} />
                  {n.name === "Journal" ? "Daily journal" : n.name}
                  {n.name === "Sessions" && (
                    <span className="nav-count">{p.history.length}</span>
                  )}
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
                {p.recording && <Bluetooth size={16} />}
              </div>
              <button
                className="sensitivity-control"
                onClick={() => navigate("Settings")}
              >
                <span>HR sensitivity</span>
                <strong>
                  +{threshold} <small>BPM</small>
                </strong>
              </button>
              <button
                className="user-button"
                onClick={() => setTab("Settings")}
              >
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
              <button
                className="icon-button mobile-menu"
                aria-label="Toggle navigation"
                aria-controls="workspace-navigation"
                aria-expanded={mobileNav}
                onClick={() => setMobileNav((v) => !v)}
              >
                <Menu size={20} />
              </button>
              <div className="breadcrumbs">
                Workspace
                <ChevronRight size={13} />
                <strong>{tabLabel}</strong>
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
            <main data-tab={tab}>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {tab === "Journal"
                      ? "YOUR PHYSIOLOGY · YOUR INTERPRETATION"
                      : tab === "Stillness"
                        ? "A LITTLE SPACE TO NOTICE"
                        : "STILL SIGNAL · PERSONAL WORKSPACE"}
                  </div>
                  <h1>
                    {tab === "Overview"
                      ? "Your perspective, in focus."
                      : tab === "Sessions"
                        ? "Session archive"
                        : tab === "Journal"
                          ? new Date(s.startedAt).toLocaleDateString([], {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })
                          : tab === "Patterns"
                            ? "The patterns in your signal."
                            : tab === "Stillness"
                              ? "Arrive before you analyse."
                              : tab === "Connections"
                                ? "Connections"
                                : "Workspace settings"}
                  </h1>
                  <p>
                    {tab === "Overview"
                      ? "A clearer view of the days, decisions, and moments behind your trading."
                      : tab === "Sessions"
                        ? "Revisit your heart rate, trade events, and personal context."
                        : tab === "Journal"
                          ? "Heart rate, execution, and reflection. One shared timeline."
                          : tab === "Patterns"
                            ? "Your history is evidence. What it means is yours to explore."
                            : tab === "Stillness"
                              ? "There is nothing you need to prove in this moment."
                              : tab === "Connections"
                                ? "Automatic broker history, chart observations, and optional wearable context."
                                : "Choose the rhythm that fits the way you trade."}
                  </p>
                </div>
                <div className="page-actions floating-session-controls">
                  <button className="button" onClick={() => setModal("csv")}>
                    <Upload size={16} /> Import CSV
                  </button>
                  {p.active && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        void floatingJournal.open();
                      }}
                    >
                      <ExternalLink size={15} /> Session dashboard
                    </button>
                  )}
                  <button
                    className={p.active ? "button stop" : "button primary"}
                    disabled={busy}
                    onClick={() => act(p.active ? p.stop : p.start)}
                  >
                    {p.active ? <Square size={14} /> : <Radio size={16} />}{" "}
                    {p.active ? "End session" : "Start session"}
                  </button>
                </div>
              </div>
              {p.error && (
                <div role="alert" className="banner error">
                  <span>{p.error}</span>
                  <button
                    onClick={() => p.setError("")}
                    aria-label="Dismiss error"
                  >
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
                      {Math.round(
                        insightSamples.at(-1)!.bpm - insight.baseline,
                      )}{" "}
                      BPM above your opening baseline at the last insight
                      refresh. Add your own context if useful.
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
                <SignalOverview
                  sessions={history}
                  session={s}
                  profile={profile}
                  recording={p.active}
                  onJournal={() => {
                    setJournalView("Timeline");
                    setTab("Journal");
                  }}
                  onPatterns={() => setTab("Patterns")}
                  onReflect={() => openReflection({ t: viewEnd })}
                  onOpen={(item) => {
                    void act(async () => {
                      if (item.id !== s.id) await p.openSession(item);
                      setTab("Journal");
                    });
                  }}
                />
              )}
              <div hidden={tab !== "Stillness"}>
                <Stillness time={viewEnd} onReflect={openReflection} />
              </div>
              {tab === "Journal" && !todayReview && (
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
                  <button
                    className="button"
                    onClick={() => openReflection({ t: viewEnd })}
                  >
                    <Plus size={15} /> Add reflection
                  </button>
                  <span>Your words. Your patterns.</span>
                </div>
              )}
              {tab === "Journal" && !todayReview && (
                <>
                  <SignalCalendar
                    key={s.id}
                    sessions={history}
                    selected={s}
                    recording={p.active}
                    onOpen={(item) => {
                      if (item.id !== s.id) void act(() => p.openSession(item));
                    }}
                  />
                  <WorkspaceToolbar
                    session={s}
                    sessions={p.history}
                    events={s.events}
                    account={accountFilter}
                    instrument={instrumentFilter}
                    recording={p.active}
                    onAccount={(id) => {
                      setAccountFilter(id);
                      setContextEvent(undefined);
                    }}
                    onInstrument={(id) => {
                      setInstrumentFilter(id);
                      setContextEvent(undefined);
                    }}
                    onSession={(item) => void act(() => p.openSession(item))}
                  />
                  <div className="session-bar">
                    <div>
                      <span
                        className={"status-dot " + (p.active ? "green" : "")}
                      />
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
                            p.recording
                              ? "Current heart rate"
                              : "Latest heart rate"
                          }
                          value={stale ? "—" : (latest?.bpm ?? "—")}
                          unit="BPM"
                          detail={
                            <>
                              <span
                                className={
                                  delta !== null && delta > 0
                                    ? "orange"
                                    : "muted"
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
                          value={liveNotes(visibleJournal).length}
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
                        totals.length ? (
                          <span className="currency-total">
                            {totals.map(([currency, value], i) => (
                              <span
                                key={currency}
                                className={value >= 0 ? "mint" : "rose"}
                              >
                                {i ? " / " : ""}
                                {money(value, currency)}
                              </span>
                            ))}
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
                        .filter((e) => isActualExecution(e))
                        .length.toString()
                        .padStart(2, "0")}
                      detail={
                        <>
                          <span className="mint">
                            {
                              visibleEvents.filter(
                                (e) =>
                                  e.kind === "entry" && isActualExecution(e),
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
                  <div className="journal-tabs" aria-label="Journal views">
                    <button
                      className={journalView === "Timeline" ? "active" : ""}
                      aria-pressed={journalView === "Timeline"}
                      onClick={() => setJournalView("Timeline")}
                    >
                      Daily timeline
                    </button>
                    <button onClick={() => setTab("Patterns")}>
                      Patterns & insights
                    </button>
                    <button
                      className={journalView === "Review" ? "active" : ""}
                      aria-pressed={journalView === "Review"}
                      onClick={() => setJournalView("Review")}
                    >
                      Mindful trade review
                    </button>
                    <button
                      className="today-notes"
                      onClick={() => setTodayReview(true)}
                    >
                      Today’s reflections
                    </button>
                  </div>
                  <div hidden={journalView !== "Timeline"}>
                    <div className="trading-grid">
                      <WorkspaceModule id="tools-the-rhythm-of-your-session" title="The rhythm of your session" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass timeline-panel">
                        <div className="panel-heading">
                          <div>
                            <h2>
                              The rhythm of your session{" "}
                              <span
                                className={
                                  p.active ? "live-badge" : "subtle-badge"
                                }
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
                              Trades, reflections, and any heart-rate data share
                              one timeline.
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
                            Buy
                          </span>
                          <span>
                            <i className="circle rose-bg" />
                            Sell
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
                          owner={p.owner}
                          selectedTime={contextEvent?.t}
                          viewportKey={s.id + ":" + range}
                          instrumentScope={JSON.stringify([
                            p.owner,
                            s.id,
                            accountFilter,
                            instrumentFilter,
                          ])}
                          sessionStart={fullStart}
                          sessionEnd={fullEnd}
                          instrument={chartInstrument}
                          accountId={
                            accountFilter &&
                            s.events.find(
                              (e) => e.broker?.accountId === accountFilter,
                            )?.broker?.accountId
                          }
                          cutoff={viewEnd}
                          replay={replayPosition < 100}
                          samples={shown}
                          events={visibleEvents}
                          journal={visibleJournal}
                          baseline={stats.baseline}
                          start={viewStart}
                          end={Math.max(viewEnd, viewStart + 60000)}
                          onSelect={(e) => {
                            setContextEvent(e);
                            setSelected(e);
                          }}
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
                                  !liveNotes(visibleJournal).length)
                              }
                            >
                              {replay ? (
                                <Pause size={14} />
                              ) : (
                                <Play size={14} />
                              )}
                              {replay
                                ? "Pause replay"
                                : replayPosition < 100
                                  ? "Resume replay"
                                  : "Replay session"}
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
                              onChange={(e) =>
                                setReplayPosition(+e.target.value)
                              }
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
                      </section></WorkspaceModule>
                      <TradeContextPanel
                        event={contextEvent || visibleEvents.at(-1)}
                        samples={shown}
                        events={visibleEvents}
                        end={viewEnd}
                        seconds={p.settings.windowSeconds}
                        onSelect={setSelected}
                        onReflect={(t) => openReflection({ t })}
                      />
                    </div>
                    <div className="lower-grid">
                      <WorkspaceModule id="tools-trade-activity" title="Trade activity" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass events-panel">
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
                              className="button small-button"
                              title="Import CSV"
                              aria-label="Import trade CSV"
                              onClick={() => setModal("csv")}
                            >
                              <Upload size={16} />
                              Import CSV
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
                                            {e.side === "long"
                                              ? "Long"
                                              : "Short"}{" "}
                                            · {e.quantity} qty
                                          </small>
                                        </span>
                                      </button>
                                    </td>
                                    <td>
                                      <span className={"event-tag " + e.kind}>
                                        {e.provenance === "alert" ? (
                                          <Radio size={12} />
                                        ) : executionAction(e) === "buy" ? (
                                          <ArrowUpRight size={12} />
                                        ) : (
                                          <ArrowDownLeft size={12} />
                                        )}{" "}
                                        {e.provenance === "alert"
                                          ? "Price alert"
                                          : executionAction(e) +
                                            " · " +
                                            e.kind +
                                            " " +
                                            (e.side === "unknown"
                                              ? ""
                                              : e.side)}
                                      </span>
                                      <small className="event-origin">
                                        {eventOrigin(e)}
                                      </small>
                                    </td>
                                    <td className="tabular">
                                      {clock(e.t).replace(/\s?(AM|PM)$/, "")}
                                    </td>
                                    {(shown.length > 0 || p.recording) && (
                                      <td className="tabular">
                                        {nearest(shown, e.t)?.bpm ?? "—"}
                                        <small className="inline-muted">
                                          {" "}
                                          BPM
                                        </small>
                                      </td>
                                    )}
                                    <td
                                      className={
                                        (e.pnl ?? 0) >= 0
                                          ? "mint tabular"
                                          : "rose tabular"
                                      }
                                    >
                                      {e.pnl === undefined
                                        ? "—"
                                        : money(
                                            e.pnl,
                                            e.currency ||
                                              e.instrument?.currency ||
                                              "USD",
                                          )}
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
                                Add an entry, import a CSV, or connect
                                TradingView.
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
                      </section></WorkspaceModule>
                      <WorkspaceModule id="tools-session-observations" title="Session observations" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass insights-panel">
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
                              {liveNotes(visibleJournal).length
                                ? `${liveNotes(visibleJournal).length} moments with personal context`
                                : "Numbers tell part of the story"}
                            </h3>
                            <p>
                              {liveNotes(visibleJournal).length
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
                            Descriptive statistics. No emotion detection or
                            trading recommendations.
                          </span>
                        </div>
                      </section></WorkspaceModule>
                    </div>
                  </div>
                </>
              )}
              {tab === "Sessions" && (
                <WorkspaceModule id="tools-saved-sessions" title="Saved sessions" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass content-panel">
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
                              if (!p.active) setTab("Journal");
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
                            {item.endedAt
                              ? "Completed"
                              : "Interrupted / active"}
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      ))}
                    </div>
                  )}
                </section></WorkspaceModule>
              )}
              {tab === "Journal" && todayReview && (
                <TodayReview
                  sessions={history}
                  owner={user.id}
                  onClose={() => setTodayReview(false)}
                  onOpen={(item) => {
                    void act(async () => {
                      if (item.id !== s.id) await p.openSession(item);
                      setTodayReview(false);
                    });
                  }}
                />
              )}
              {tab === "Journal" &&
                !todayReview &&
                journalView === "Timeline" && (
                  <WorkspaceModule id="tools-the-moments-behind-the-numbers" title="The moments behind the numbers" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass content-panel journal-flow">
                    <div className="panel-heading">
                      <div>
                        <h2>The moments behind the numbers</h2>
                        <p>
                          {s.name} · Reflections belong to the selected session.
                        </p>
                      </div>
                      <button
                        className="button primary"
                        onClick={() =>
                          openReflection({ t: selected?.t || viewEnd })
                        }
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
                        "Frustrated",
                        "Other",
                      ].map((f) => (
                        <button
                          key={f}
                          onClick={() => setJournalFilter(f)}
                          className={
                            journalFilter === f ? "filter active" : "filter"
                          }
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="journal-grid">
                      {liveNotes(visibleJournal)
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
                              {nearest(shown, j.t)
                                ? `${nearest(shown, j.t)!.bpm} BPM at this moment · Self-reported`
                                : "Self-reported reflection"}
                            </small>
                            {j.screenshot && <Screenshot {...j.screenshot} />}
                            <div className="inline-actions">
                              <button
                                className="text-button"
                                onClick={() =>
                                  openReflection({ t: j.t, entry: j })
                                }
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
                    {liveNotes(visibleJournal).filter(
                      (j) =>
                        journalFilter === "All entries" ||
                        j.label === journalFilter,
                    ).length === 0 && (
                      <div className="empty-state tall">
                        <BookOpen />
                        <h3>A moment worth remembering?</h3>
                        <p>
                          Describe your own experience. Heart rate alone does
                          not tell us how you felt.
                        </p>
                      </div>
                    )}
                  </section></WorkspaceModule>
                )}
              <div
                hidden={
                  tab !== "Journal" || todayReview || journalView !== "Review"
                }
              >
                <SessionReview
                  key={s.id}
                  session={s}
                  time={viewEnd}
                  onSave={p.addNote}
                  onJournal={() => setJournalView("Timeline")}
                />
              </div>
              <div
                hidden={
                  tab !== "Journal" || todayReview || journalView !== "Timeline"
                }
              >
                <JournalWriting
                  key={s.id}
                  time={viewEnd}
                  question={personalQuestion(profile, visibleEvents, viewEnd)}
                  onSave={p.addNote}
                  onOpen={openReflection}
                />
              </div>
              {tab === "Connections" && (
                <>
                  <WorkspaceModule id="tools-manual-csv-import" title="Manual CSV import" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section
                    id="trade-csv"
                    className="glass import-card csv-import-panel"
                  >
                    <div>
                      <h2>Manual CSV import</h2>
                      <p>
                        Add your exported trades to the matching day's session
                        and recorded heart rate. No broker setup.
                      </p>
                    </div>
                    <button className="button" onClick={() => setModal("csv")}>
                      <Upload size={16} /> Import CSV
                    </button>
                  </section></WorkspaceModule>
                  <BrokerConnections
                    owner={p.owner}
                    onChanged={() => void p.refreshHistory()}
                    onViewJournal={() => setTab("Journal")}
                    onImportCsv={() => setModal("csv")}
                  />
                  <div className="connections-grid">
                    <WorkspaceModule id="tools-whoop" title="WHOOP" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass connection-card">
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
                        Live heart rate, directly from your wearable. Every
                        received sample is preserved independently of your
                        insight interval.
                      </p>
                      <ol>
                        <li>Open WHOOP → Device Settings.</li>
                        <li>
                          Enable <strong>Heart Rate Broadcast</strong>.
                        </li>
                        <li>
                          Use Chrome or Edge on a supported desktop, or Chrome
                          on Android.
                        </li>
                        <li>
                          Attach WHOOP and choose your sensor. Journaling works
                          without it.
                        </li>
                      </ol>
                      <div className="connection-note">
                        Keep this tab open and your device awake. Bluetooth
                        recording is unavailable in Safari and iPhone browsers.
                        No WHOOP login is needed.
                      </div>
                      <button
                        className="button primary"
                        disabled={busy || p.recording || p.connectingWhoop}
                        onClick={() => act(p.attachWhoop)}
                      >
                        <Bluetooth size={16} />
                        {p.recording
                          ? "Recording with " + p.device
                          : p.connectingWhoop
                            ? "Connecting WHOOP…"
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
                    </section></WorkspaceModule>
                    <TradingViewConnection
                      onChanged={() =>
                        p.setNotice("TradingView connection updated.")
                      }
                    />
                  </div>
                  <WorkspaceModule id="tools-optional-wearable-context" title="Optional wearable context" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass connection-note">
                    <h3>Optional wearable context</h3>
                    <p>
                      Your journal and trading integrations work without a
                      sensor. WHOOP Bluetooth is available now. Apple Health,
                      Oura, and Garmin are planned connectors; they are not
                      connected or simulated in this release.
                    </p>
                  </section></WorkspaceModule>
                </>
              )}
              {tab === "Settings" && (
                <div className="settings-grid">
                  <WorkspaceModule id="stage-label-preferences" title="Your stage labels" section="main"><PhaseLabelPreferences
                    settings={p.settings}
                    onChange={p.configure}
                  /></WorkspaceModule>
                  <WorkspaceModule id="review-reminders" title="Weekly review reminders" section="side" order={20}><section className="glass settings-card"><h2>Weekly review reminders</h2><label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={p.settings.weeklyReminders !== false}
                      onChange={(e) =>
                        p.configure({
                          ...p.settings,
                          weeklyReminders: e.target.checked,
                        })
                      }
                    />
                    Gentle weekly review reminders
                  </label></section></WorkspaceModule>
                  <WorkspaceModule id="blueprint-preferences" title="Session blueprint preferences" section="side"><BlueprintPreferences
                    session={s}
                    history={history}
                    onSave={p.updateBlueprint}
                  /></WorkspaceModule>
                  <WorkspaceModule id="tools-your-session-preferences" title="Your session preferences" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass settings-card">
                    <h2>Your session preferences</h2>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={p.settings.startWithStillness !== false}
                        onChange={(e) =>
                          p.configure({
                            ...p.settings,
                            startWithStillness: e.target.checked,
                          })
                        }
                      />
                      Start sessions with Stillness
                    </label>
                    <small>
                      Completed sessions open with a short reset. You can skip
                      it for any session.
                    </small>
                    <p>
                      Raw data collection always runs independently of these
                      settings.
                    </p>
                    <label>
                      Insight refresh interval
                      <select
                        value={p.settings.cadence}
                        onChange={(e) =>
                          p.configure({
                            ...p.settings,
                            cadence: +e.target.value,
                          })
                        }
                      >
                        {cadenceOptions.map((c) => (
                          <option key={c} value={c}>
                            {c < 60 ? `${c} seconds` : `${c / 60} minutes`}
                          </option>
                        ))}
                      </select>
                      <small>
                        How often descriptive observations are recalculated
                        while recording.
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
                          p.configure({
                            ...p.settings,
                            threshold: +e.target.value,
                          })
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
                        Works while Still Signal is focused. Dictation requests
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
                        <option value="off">
                          Off · use my chosen threshold
                        </option>
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
                  </section></WorkspaceModule>
                  <WorkspaceModule id="tools-your-data-your-control" title="Your data, your control" parts={[{id:"description",title:"Supporting description",selector:".ss-module-content > section > p"}]} ><section className="glass settings-card">
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
                  </section></WorkspaceModule>
                </div>
              )}
              {tab === "Patterns" && (
                <>
                  <div className="analysis-explainer">
                    <Sparkles size={20} />
                    <div>
                      <h2>
                        Observe the connection. Keep the interpretation yours.
                      </h2>
                      <p>
                        These observations use your confirmed labels, recorded
                        heart rate, and execution history. Open the supporting
                        moments before drawing a conclusion.
                      </p>
                    </div>
                  </div>
                  <div className="pattern-summary">
                    <div>
                      <span>Confirmed reflections</span>
                      <strong>{profile.count}</strong>
                    </div>
                    <div>
                      <span>Saved sessions</span>
                      <strong>{profile.sessionCount}</strong>
                    </div>
                    <div>
                      <span>HR-linked reflections</span>
                      <strong>
                        {history.reduce(
                          (count, session) =>
                            count +
                            liveNotes(session.journal).filter(
                              (n) => n.context?.bpm !== undefined,
                            ).length,
                          0,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Learned sensitivity</span>
                      <strong>
                        {profile.suggestedThreshold === null
                          ? "Building"
                          : `+${profile.suggestedThreshold} BPM`}
                      </strong>
                    </div>
                  </div>
                  <JournalInsights
                    session={{
                      ...s,
                      events: visibleEvents,
                      journal: visibleJournal,
                    }}
                    moments={moments.filter((m) => m.t <= viewEnd)}
                    profile={profile}
                    hasSamples={shown.length > 0}
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
                </>
              )}
              <footer className="app-footer">
                <span>
                  <Activity size={13} /> Still Signal{" "}
                  <span className="footer-dot">·</span> A little more
                  self-awareness.
                </span>
                <span>Personal analytics. Your decisions stay yours.</span>
              </footer>
            </main>
          </div>
        </div>
        </ModuleWorkspace>
      </dialog>
      <ExtensionConnection
        user={user}
        sessionId={s.id === "workspace" ? undefined : s.id}
        manage={tab === "Settings"}
        scope={{
          instrumentId: instrumentFilter || undefined,
          accountId: accountFilter || undefined,
          baselineSeconds: p.settings.baselineSeconds,
          windowSeconds: p.settings.windowSeconds,
        }}
      />
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

      {modal === "csv" && (
        <Modal title="Import CSV" onClose={() => setModal(null)}>
          <CsvImporter
            history={p.history}
            active={p.active}
            hasSession={!isWorkspace}
            onImport={importCsv}
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
      {floatingJournal.host &&
        createPortal(
          <FloatingJournal
            capture={capture}
            historicalBaseline={historicalBaseline}
            labels={p.settings.phaseLabels}
            key={s.id}
            session={dailyJournalSession(s, p.history)}
            samples={p.samples}
            now={p.now}
            baselineSeconds={p.settings.baselineSeconds}
            recording={p.recording}
            active={p.active}
            syncState={p.syncState}
            floating={floatingJournal.floating}
            message={floatingJournal.message}
            onClose={() => {
              if (floatingJournal.floating) floatingJournal.close();
              else if (floatingJournal.host) floatingJournal.host.hidden = true;
            }}
            onReopen={() => {
              void floatingJournal.open();
            }}
            onPopup={floatingJournal.openPopup}
            prepareScreenshot={p.prepareScreenshot}
            onSave={p.addNote}
          />,
          floatingJournal.host,
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
            labels={p.settings.phaseLabels}
            session={dailyJournalSession(s, p.history)}
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
              shown,
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
            const w =
              selected.timePrecision === "day"
                ? { before: null, at: null, after: null }
                : eventWindow(shown, selected, p.settings.windowSeconds);
            return (
              <>
                <p className="form-intro">
                  {clock(selected.t)} · {selected.side} · {selected.quantity} at{" "}
                  {selected.price} · Source: {selected.source}
                </p>
                {selected.timestampSource === "order-update" && (
                  <p className="form-intro">
                    Order update time, not an exact fill time. Heart-rate
                    alignment uses this recorded timestamp.
                  </p>
                )}
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
                <PositionHeartRate
                  event={selected}
                  samples={shown}
                  events={visibleEvents}
                  seconds={p.settings.windowSeconds}
                  end={viewEnd}
                />
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
    </div></PhaseLabelsContext.Provider>
  );
}
