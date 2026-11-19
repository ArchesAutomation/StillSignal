"use client";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { pullSessions } from "@/lib/cloud";
import { dailyJournalSession } from "@/lib/journal-collection";
import { journalDateValue } from "@/lib/journal-day";
import { dateInZone } from "@/lib/process/model";
import { preparationStatus } from "@/lib/process/preparation-status";
import { isActualExecution } from "@/lib/trade-context";
import { mergeNotes } from "@/lib/smart-journal";
import type { JournalEntry, Session } from "@/lib/model";
import type { CarryChoice } from "@/lib/process/away-days";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AccountMenu from "../account-menu";
import ModuleWorkspace, {
  ModuleScope,
  WorkspaceModule,
} from "../module-workspace";
import PageDashboard from "../page-dashboard";
import PostExitInvitation from "../post-exit-invitation";
import { useProcess } from "../process/use-process";
import ProcessWorkspace from "../process/workspace";
import SavedStillness from "../saved-stillness";
import { StillnessLibrary, type CarrySupport, type StillnessBrowse } from "../stillness-library";
import { ModeSwitch, ThemeController } from "../theme-controls";
import WorkspaceAppearance from "../workspace-appearance";
import { Calendar, weekStart } from "./calendar";
import CapturePanel from "./capture-panel";
import DayAwayReview, { CarriedThoughts, formatAwayDate, useDayAwayReview } from "./day-away-review";
import Journal, { type JournalMode } from "./journal";
import type { BookRequest } from "./journal-book";
import JournalDayPicker from "./journal-day-picker";
import Overview from "./overview";
import ReadingRoomDone from "./reading-room-done";
import ReadingRoomHome from "./reading-room-home";
import ReadingRoomPreparation, {
  preparationSupport,
} from "./reading-room-preparation";
import ReadingRoomReference from "./reading-room-reference";
import ReferenceContext from "./reference-context";
import ReferenceHistory from "./reference-history";
import ReferenceWeek from "./reference-week";
import SessionContext from "./session-context";
import SessionDays from "./session-days";
import SessionReset from "./session-reset";
import { JOURNAL_LINK_EVENT, revealJournalNote, type AssistantLink } from "@/lib/assistant-links";
import { cx, type Page, type Props } from "./shared";
import { reflections } from "./stillness";
import WeeklyReminder from "./weekly-reminder";
function PageBoard({ owner, page, sessions, children, onPresentationChange }: { owner: string; page: Page; sessions: Props["history"]; children: React.ReactNode; onPresentationChange: (readingRoom: boolean) => void }) {
  if (page === "Journal" || page === "Stillness") {
    const dashboard = (
      <PageDashboard key={owner + page} owner={owner} page={page} sessions={sessions} onPresentationChange={onPresentationChange}>
        {children}
      </PageDashboard>
    );
    return dashboard;
  }
  return <ModuleWorkspace owner={owner} page={page} enabled={page !== "Preparation" && page !== "Pre-Market"}>{children}</ModuleWorkspace>;
}
const navigation: [Page, string, string][] = [
  ["Home", "⌂", "Home"],
  ["Preparation", "◒", "Preparation"],
  ["Journal", "▣", "Daily journal"],
  ["Done", "◐", "Done for the day"],
  ["Stillness", "◌", "Stillness"],
  ["Settings", "⚙", "Settings"],
];
const sectionOf: Partial<Record<Page, string>> = {
  Home: "home",
  Preparation: "prep",
  Journal: "journal",
  Done: "done",
  Stillness: "stillness",
  Settings: "settings",
};
export default function ConceptWorkspace(props: Props) {
  const pageRoot = useRef<HTMLElement>(null);
  const { pulse: p, session: s, history, page } = props;
  const process = useProcess(p.owner, [s, ...history]);
  const [supportDay, setSupportDay] = useState<{ date: string; page: Page }>();
  const [stillnessBrowse, setStillnessBrowse] = useState<StillnessBrowse>();
  const [stillnessView, setStillnessView] = useState<"personal" | "library">("personal");
  const [previewRequest, setPreviewRequest] = useState<{ itemId: string; n: number }>();
  const [preparationGuidance, setPreparationGuidance] = useState<string>();
  const previewItem = useCallback((itemId: string) => setPreviewRequest((request) => ({ itemId, n: (request?.n ?? 0) + 1 })), []);
  const [playRequest, setPlayRequest] = useState<{ choice: CarryChoice; n: number }>();
  const playPiece = useCallback((choice: CarryChoice) => setPlayRequest({ choice, n: Date.now() }), []);
  const [readingRoom, setReadingRoom] = useState(true);
  const [journalEntry, setJournalEntry] = useState(0);
  const reading = page === "Journal" && readingRoom;
  const home = page === "Home";
  const preparing = page === "Preparation";
  const closing = page === "Done";
  const stillness = page === "Stillness";
  const [returnToPreparation, setReturnToPreparation] = useState<Page>();
  const [returnToDone, setReturnToDone] = useState(false);
  const quietRoom = reading || home || preparing || closing || stillness;
  const preparationTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const preparationDate = dateInZone(p.now, preparationTimezone);
  const away = useDayAwayReview(p.owner, !!props.dayAwayReview);
  const [awayJournalDate, setAwayJournalDate] = useState<string>();
  const [awayEntry, setAwayEntry] = useState<{ date: string; id: string }>();
  const [awayReflectionRequested, setAwayReflectionRequested] = useState(false);
  const awayDateDialog = useRef<HTMLDialogElement>(null);
  const [awayDateError, setAwayDateError] = useState("");
  const awayToday = !!away.days[preparationDate]?.away;
  const awayDate = (page === "Journal" ? awayJournalDate : undefined) || preparationDate;
  const awayView = !!props.dayAwayReview && page === "Journal" && !!awayJournalDate;
  const awayRecord = away.days[awayDate];
  const awayPreparation = awayView ? preparationStatus(process.records, awayDate, preparationTimezone) : undefined;
  const savedPreparation = awayPreparation && [awayPreparation.intention, awayPreparation.boundary,
    awayPreparation.arrival.join(", "), ...awayPreparation.support.map(item => item.title)].filter(Boolean).join("\n");
  const activitySession = awayView && [s, ...history].find(session => session.events.some(event =>
    isActualExecution(event) && journalDateValue(event.t) === awayDate));
  const awaySession = awayView ? [s, ...history].find(session => session.id !== "workspace" && journalDateValue(session.startedAt) === awayDate) : undefined;
  const useAwayAction = awayView && (awayRecord?.away || !awaySession);
  const journalTimestamp = awayView ? new Date(`${awayDate}T12:00:00`).getTime() : s.startedAt;
  const support = preparing ? preparationSupport(process.records, preparationDate, preparationTimezone) : undefined;
  // Opening Preparation or Done on a trading day fixes "next trading day" support for that stage
  // to today. A day away, the Journal's dates and a session start leave it waiting.
  const sessionLanding = useRef(false);
  useEffect(() => {
    if (page !== "Preparation") sessionLanding.current = false;
  }, [page]);
  useEffect(() => {
    if (!props.dayAwayReview || !away.ready || awayToday || sessionLanding.current) return;
    if (preparing) away.claimCarries(preparationDate, "Preparation");
    if (closing) away.claimCarries(preparationDate, "Done");
  }, [props.dayAwayReview, away.ready, awayToday, preparing, closing, preparationDate, away.carries]);
  useLayoutEffect(() => {
    if (quietRoom) document.documentElement.dataset.journalPresentation = "reading-room";
    else delete document.documentElement.dataset.journalPresentation;
    return () => { delete document.documentElement.dataset.journalPresentation; };
  }, [quietRoom]);
  const daySession = dailyJournalSession(s, history);
  const resetSeen = useRef(new Set<string>());
  const [weekly, setWeekly] = useState(false);
  const [reviewWeek, setReviewWeek] = useState<string>();
  const capturePending = props.capture?.pendingCapture || false;
  const previousActive = useRef(p.active);
  useEffect(() => {
    const close = (e: Event) =>
      document
        .querySelectorAll<HTMLDetailsElement>(".ss-reference-tools[open]")
        .forEach((menu) => {
          if (
            e.type === "keydown"
              ? (e as KeyboardEvent).key === "Escape"
              : !menu.contains(e.target as Node) ||
                (e.type === "click" && (e.target as Element).closest("button"))
          )
            menu.open = false;
        });
    document.addEventListener("pointerdown", close);
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  useEffect(() => {
    if (
      previousActive.current &&
      !p.active &&
      !closing &&
      p.settings.startWithStillness !== false
    )
      props.onPage("Stillness");
    previousActive.current = p.active;
  }, [
    s.id,
    s.endedAt,
    p.active,
    p.settings.startWithStillness,
    closing,
    page,
    props.onPage,
  ]);
  function finishReset(choice: "voice" | "structured" | "journal") {
    resetSeen.current.add(s.id);
    setView(choice === "structured" ? "review" : "story");
    props.onPage("Journal");
    if (choice === "voice")
      props.onReflect({
        t: s.endedAt || s.startedAt,
        eventTime: null,
        origin: "stillness",
        source: "voice",
        autoListen: true,
      });
  }
  const [view, setView] = useState<"story" | "review">("story"),
    [week, setWeek] = useState(0),
    [whisper, setWhisper] = useState(""),
    [openingDay, setOpeningDay] = useState(false),
    [focusTime, setFocusTime] = useState<number | undefined>();
  // Day in Action is the live record; Journal is the free-writing page.
  const [journalMode, setJournalModeState] = useState<JournalMode>(() => {
    try {
      return localStorage.getItem("ss-journal-mode") === "book" ? "book" : "action";
    } catch {
      return "action";
    }
  });
  const setJournalMode = (mode: JournalMode) => {
    setJournalModeState(mode);
    try {
      localStorage.setItem("ss-journal-mode", mode);
    } catch {}
  };
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    setWeek(0);
  }, [s.id]);
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [page]);
  async function act(fn: () => Promise<unknown>, allowDraft = false) {
    if (capturePending && !allowDraft) {
      p.setError(
        "Confirm or discard your capture draft before changing sessions.",
      );
      return;
    }
    try {
      p.setError("");
      await fn();
    } catch (e) {
      p.setError(e instanceof Error ? e.message : "Please try again.");
    }
  }
  async function startPreparedSession() {
    await p.start();
    if (props.dayAwayReview) await away.markStarted(preparationDate);
    // Starting a session is not choosing to open Preparation, so waiting support stays waiting.
    sessionLanding.current = true;
    props.onPage("Preparation");
  }
  const go = (next: Page) => {
    setAwayEntry(undefined);
    setAwayReflectionRequested(false);
    const selectedDate = journalDateValue(s.startedAt);
    const hasDatedBook = !!away.days[selectedDate]?.bookNotes?.length;
    setAwayJournalDate(next === "Journal" ? awayToday ? preparationDate : hasDatedBook ? selectedDate : undefined : undefined);
    if (next === "Journal" && awayToday) setJournalModeState("action");
    setWeekly(false);
    setReturnToPreparation(undefined);
    setReturnToDone(false);
    if (next === "Home") setStillnessBrowse(undefined);
    if (next !== "Journal") setFocusTime(undefined);
    if (next === "Journal" && page === "Journal" && !readingRoom) {
      setJournalEntry((entry) => entry + 1);
    }
    if (next === "Journal" || next === "Live Session") setView("story");
    props.onPage(next);
  };
  const browseFromPreparation = () => {
    if (!support) return;
    setStillnessBrowse(support.browse);
    setStillnessView("library");
    go("Stillness");
    setReturnToPreparation("Stillness");
  };
  const openPreparationSetup = () => {
    setSupportDay({ date: preparationDate, page: "Pre-Market" });
    go("Pre-Market");
    setReturnToPreparation("Pre-Market");
  };
  const browseFromDone = () => {
    setStillnessBrowse({ tags: [], itemId: "release" });
    setStillnessView("library");
    go("Stillness");
    setReturnToDone(true);
  };
  const reflectForToday = async (from: "stillness" | "done", prompt?: string, promptContext?: string[]) => {
    if (capturePending) throw new Error("Confirm or discard your capture draft before opening a reflection.");
    const now = Date.now();
    const date = journalDateValue(now);
    if (awayToday) {
      openAwayJournal(date);
      setAwayReflectionRequested(true);
      return;
    }
    if (journalDateValue(s.startedAt) !== date && !(await p.openJournalDay(date))) {
      throw new Error("Today’s Journal could not open. Try again.");
    }
    go("Journal");
    props.onReflect({ t: now, eventTime: null, ...(from === "stillness" ? { origin: "stillness" } : { section: "day-review" }), ...(prompt ? { prompt } : {}), ...(promptContext?.length ? { promptContext } : {}) });
  };
  // Done for the Day hands its writing step to the Journal: open the book on today's page.
  const [bookRequest, setBookRequest] = useState<BookRequest>();
  const openJournalBook = async (prompt?: string) => {
    if (capturePending) throw new Error("Confirm or discard your capture draft before opening your journal.");
    const date = journalDateValue(Date.now());
    if (awayToday) {
      openAwayJournal(date, "book");
      setBookRequest({ n: Date.now(), prompt });
      return;
    }
    if (journalDateValue(s.startedAt) !== date && !(await p.openJournalDay(date))) {
      throw new Error("Today’s Journal could not open. Try again.");
    }
    setJournalMode("book");
    setView("story");
    go("Journal");
    setBookRequest({ n: Date.now(), prompt });
  };
  const goFromHome = (next: Page) => {
    if (props.dayAwayReview && next === "Preparation" && !awayToday) away.beginPreparation(preparationDate);
    if (next === "Pre-Market") {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      setSupportDay({ date: dateInZone(Date.now(), timezone), page: next });
    }
    go(next);
  };
  const review = () => {
    setView("review");
    props.onPage("Journal");
  };
  const openDay = async (date: string) => {
    if (openingDay) return;
    if (capturePending) {
      p.setError("Confirm or discard your capture draft before changing days.");
      return;
    }
    if (props.dayAwayReview && (away.days[date]?.away || away.days[date]?.reason || away.days[date]?.notes.length || away.days[date]?.bookNotes?.length || away.entries.some(entry => entry.note.followups.some(followup => followup.date === date)))) {
      openAwayJournal(date, page === "Journal" ? journalMode : "action");
      return;
    }
    setOpeningDay(true);
    try {
      await act(async () => {
        if (!(await p.openJournalDay(date))) return;
        setFocusTime(undefined);
        go("Journal");
        setAwayJournalDate(undefined);
        setWeek(0);
      });
    } finally {
      setOpeningDay(false);
    }
  };
  // Ask Still Signal's cards open what they quote. Opening never creates or edits a record.
  const openAssistantLink = useRef<(link: AssistantLink) => void>(() => {});
  openAssistantLink.current = (link) =>
    void act(async () => {
      if ("page" in link) return go(link.page);
      if ("stillness" in link) {
        setStillnessBrowse({ tags: [], itemId: link.stillness });
        setStillnessView("library");
        return go("Stillness");
      }
      const target =
        "date" in link
          ? [s, ...history].find((item) => item.id !== "workspace" && !item.demo && journalDateValue(item.startedAt) === link.date)
          : link.sessionId === s.id
            ? s
            : history.find((item) => item.id === link.sessionId);
      if (!target) throw new Error("date" in link ? `No journal is saved for ${link.date}.` : "That entry isn’t on this device any more.");
      if ("date" in link) {
        if (target.id !== s.id && !(await p.openSession(target))) return;
        setFocusTime(undefined);
        setView("story");
        go("Journal");
        // As below: show the linked day, not today's Away Day.
        setAwayJournalDate(undefined);
        setJournalMode("action");
        return;
      }
      if (target.id !== s.id && !(await p.openSession(target))) return;
      // Selecting the moment also clears any Journal filters that would hide it.
      setFocusTime(link.at);
      setView("story");
      go("Journal");
      // go() reopens today's Away Day; a card link shows the linked entry's own day instead.
      setAwayJournalDate(undefined);
      setJournalMode(link.book ? "book" : "action");
      if (link.book) setBookRequest({ n: Date.now() });
      else if (link.noteId) revealJournalNote(link.noteId);
    });
  useEffect(() => {
    const open = (event: Event) => openAssistantLink.current((event as CustomEvent<AssistantLink>).detail);
    window.addEventListener(JOURNAL_LINK_EVENT, open);
    return () => window.removeEventListener(JOURNAL_LINK_EVENT, open);
  }, []);
  function openAwayJournal(date: string, mode: JournalMode = "action") {
    go("Journal");
    setAwayJournalDate(date);
    setJournalModeState(mode);
    setWeek(0);
  }
  const quiet = () => {
    setWhisper(reflections[Math.floor(Math.random() * reflections.length)]);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setWhisper(""), 5200);
  };
  const journal =
    page === "Journal" || page === "Live Session";
  const ws = weekStart(journalTimestamp, week),
    we = new Date(ws);
  we.setDate(we.getDate() + 6);
  const latest = p.samples.at(-1);
  const captureTime = p.active ? p.now : s.endedAt || s.startedAt;
  const viewProps = { ...props, onPage: go, onOpenJournalDay: openDay };
  const awayDates = useMemo(() => props.dayAwayReview ? Object.keys(away.days).filter(date => away.days[date]?.away) : undefined, [props.dayAwayReview, away.days]);
  const startedDates = useMemo(() => props.dayAwayReview ? Object.keys(away.days).filter(date => away.days[date]?.started) : undefined, [props.dayAwayReview, away.days]);
  // Provide date context to the existing book without opening or saving a trading session.
  const bookContext: Session | undefined = awayView && (!awaySession || awayRecord?.bookNotes?.length) ? {
    id: `dated-book:${awayDate}`, owner: p.owner, name: "Daily journal", source: "journal",
    startedAt: journalTimestamp, timezone: preparationTimezone, sampleCount: 0, events: [],
    journal: mergeNotes(awaySession?.journal ?? [], awayRecord?.bookNotes ?? []),
  } : undefined;
  async function saveDatedBookNotes(notes: JournalEntry[]) {
    if (!(await away.saveBook(awayDate, notes))) throw new Error("Your journal page could not be saved.");
  }
  const carrySupport: CarrySupport | undefined = props.dayAwayReview ? {
    ready: away.ready,
    events: away.events,
    carries: away.carries,
    isAway: (date) => !!away.days[date]?.away,
    save: away.appendCarry,
    onOpenAway: (date) => openAwayJournal(date),
    reflectionText: (carry) => away.entries.find((item) => item.note.id === carry.noteId)?.note.text || undefined,
    onOpenReflection: (carry) => {
      const entry = away.entries.find((item) => item.note.id === carry.noteId);
      if (!entry) return;
      openAwayJournal(entry.date);
      setAwayEntry({ date: entry.date, id: entry.note.id });
    },
  } : undefined;
  const awayContent = awayView && <DayAwayReview
    key={awayDate}
    owner={p.owner} date={awayDate} today={preparationDate}
    onPlay={playPiece} onOpenDay={(date) => openAwayJournal(date)}
    review={away} openEntry={awayEntry}
    reflectionRequested={awayReflectionRequested} onReflectionOpened={() => setAwayReflectionRequested(false)}
    onEntry={entry => setAwayEntry(entry && { date: entry.date, id: entry.note.id })}
    savedPreparation={savedPreparation || undefined}
    onActivity={activitySession ? () => void act(async () => {
      if (await p.openSession(activitySession)) { setAwayJournalDate(undefined); setJournalMode("action"); }
    }) : undefined}
    onReturn={() => void away.setAway(awayDate, false)}
  />;
  const workspaceNotices = (
    <>
      {s.demo && (
        <p className={cx("demo-notice")}>
          DEMO DATA · Simulated heart rate, trades and reflections. No
          broker or wearable is connected to this dataset.
        </p>
      )}
      {p.error && (
        <div className={cx("message", "error")} role="alert">
          <span>{p.error}</span>
          <button aria-label="Dismiss error" onClick={() => p.setError("")}>×</button>
        </div>
      )}
      {p.notice && (
        <div className={cx("message")} role="status">
          <span>{p.notice}</span>
          <button aria-label="Dismiss notification" onClick={() => p.setNotice("")}>×</button>
        </div>
      )}
    </>
  );
  return (
    <div className={cx("app", "reference-app", quietRoom && "reading-room")} data-section={sectionOf[page]}>
      <ThemeController owner={p.owner} />
      <Panel
        role="banner"
        className={cx("reference-topbar")}
      >
        <button
          className={cx("reference-brand")}
          onClick={() => go("Home")}
        >
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="currentColor" />
            <path d="M3 17h7l3-8 6 15 3-7h7" stroke="currentColor" />
          </svg>
          still signal <span>.</span>
        </button>
        <nav className={cx("reference-nav")} aria-label="Main navigation">
          {navigation.map(([name, , label]) => (
            name === "Stillness" ? (
              <span key={name} className="ss-nav-stillness">
                <span className="ss-nav-orbs" aria-hidden="true"><i /><i /><i /></span>
                <button
                  aria-label={label}
                  aria-current={page === name ? "page" : undefined}
                  className={cx(page === name && "active")}
                  data-section={sectionOf[name]}
                  onClick={() => go(name)}
                >
                  {label}
                </button>
              </span>
            ) : (
              <button
                key={name}
                aria-label={label}
                aria-current={page === name ? "page" : undefined}
                className={cx(page === name && "active")}
                data-section={sectionOf[name]}
                onClick={() => go(name)}
              >
                {sectionOf[name] !== "settings" && <i className="ss-nav-dot" aria-hidden="true" />}
                {label}
              </button>
            )
          ))}
        </nav>
        <div className={cx("reference-top-actions")}>

          {quietRoom && <div className="rr-session-status" role="status"><i />{p.recording ? "HR recording" : p.active ? "Journal in progress" : "Journal ready"}</div>}
          <button className="ss-header-connection" onClick={() => go("Connections")}>Connections</button>
          <button className="ss-header-floating" onClick={props.onFloat}>Floating window ↗</button>
          <button className="ss-header-import" disabled={capturePending} onClick={props.onCsv}>Import session ↗</button>
          <details className={cx("reference-tools")}>
            <summary aria-label="Session tools">⋯</summary>
            <Panel className="ss-utilities-panel">
              <button className="ss-overflow-connection" onClick={() => go("Connections")}>Connections</button>
              <button className="ss-overflow-floating" onClick={props.onFloat}>Floating window ↗</button>
              <button className="ss-overflow-import" disabled={capturePending} onClick={props.onCsv}>Import session ↗</button>
              <button onClick={() => go("Sessions")}>Saved sessions</button>
              <button onClick={() => go("Overview")}>Overview</button>
              <button onClick={props.onTrade}>Add trade</button>
              <button onClick={() => props.onAdvanced()}>Chart & replay</button>
              <button onClick={props.onExport}>Export session</button>
            </Panel>
          </details>
          <ModeSwitch owner={p.owner} />
          <WorkspaceAppearance props={viewProps} />
          <AccountMenu email={p.email} blocked={p.active || capturePending} onSettings={() => go("Settings")} onError={p.setError} />
        </div>
      </Panel>
      <aside className={cx("sidebar")}>
        <div className={cx("brand")}>
          <div className={cx("brandmark")}>⌁</div>
          <span>
            still<small>signal.</small>
          </span>
        </div>
        <div className={cx("workspace")}>
          <div className={cx("eyebrow")}>Personal workspace</div>
          <strong>
            {p.email
              ? p.email.split("@")[0].replace(/^./, (c) => c.toUpperCase())
              : "Your"}
            {p.email ? "'s" : ""} journal
          </strong>
          <span>Trading & self-awareness</span>
        </div>
        <nav className={cx("nav")} aria-label="Main navigation">
          {navigation.map(([name, icon, label]) => (
            <button
              key={name}
              className={cx(page === name && "active")}
              aria-current={page === name ? "page" : undefined}
              onClick={() => go(name)}
              aria-label={label}
              title={label}
            >
              <span className={cx("navicon")}>{icon}</span>
              <span>{label}</span>
              {name === "Sessions" && (
                <span className={cx("badge")}>{history.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className={cx("sidefoot")}>
          <div className={cx("live")}>
            <i
              className={cx("dot")}
              style={
                p.recording
                  ? undefined
                  : { background: "var(--muted)", boxShadow: "none" }
              }
            />
            {p.recording
              ? "WHOOP recording"
              : p.active
                ? "Journal in progress"
                : "Journal ready"}
          </div>
          <small>
            {p.recording && latest
              ? `Last sample ${Math.max(0, Math.round((p.now - latest.t) / 1000))} seconds ago`
              : p.syncState}
          </small>
          <button className={cx("sensitivity")} onClick={() => go("Settings")}>
            <span>HR sensitivity</span>
            <b>+{props.threshold}</b>
          </button>
        </div>
      </aside>
      <main ref={pageRoot}>
        {props.dayAwayReview && <dialog ref={awayDateDialog} className="rr-away-date-dialog" aria-labelledby="rr-away-date-title">
          <form onSubmit={async event => {
            event.preventDefault();
            const date = String(new FormData(event.currentTarget).get("date"));
            if (away.days[date]?.started) { setAwayDateError("A trading session was started on this date. Open its session review instead."); return; }
            if (!p.active && !capturePending && await away.setAway(date, true)) {
              awayDateDialog.current?.close();
              openAwayJournal(date);
            } else setAwayDateError("This date could not be saved. Try again.");
          }}>
            <h2 id="rr-away-date-title">Mark a day away</h2>
            <label>Journal date <input name="date" type="date" defaultValue={preparationDate} max={preparationDate} required /></label>
            {awayDateError && <p role="alert">{awayDateError}</p>}
            <div className="rr-home-actions"><Button className="ss-primary" type="submit" disabled={!away.ready || p.active || capturePending}>Mark as day away</Button><Button onClick={() => awayDateDialog.current?.close()}>Cancel</Button></div>
          </form>
        </dialog>}
        {home ? (
          <ReadingRoomHome
            key={p.owner}
            owner={p.owner}
            now={p.now}
            store={process}
            onPage={goFromHome}
            onBrowse={(browse) => { setStillnessBrowse(browse); setStillnessView("library"); go("Stillness"); }}
            onWeek={() => { go("Journal"); setReviewWeek(undefined); setWeekly(true); }}
            dayAwayChoice={props.dayAwayReview && !p.active && !capturePending && !awayRecord?.started && <div className="rr-away-choice">
              {awayToday ? <>
                <p><strong>Day away from charts</strong> <span>· Saved for today</span></p>
                <Button onClick={() => openAwayJournal(preparationDate)}>Open in Daily journal</Button>
                <Button onClick={() => away.setAway(preparationDate, false)}>Return to trading day</Button>
              </> : <Button disabled={!away.ready} onClick={() => away.setAway(preparationDate, true)}>Day away from charts</Button>}
              {away.message && <span className="sr-only" role="status">{away.message}</span>}
            </div>}
          />
        ) : (
        <>
        {!preparing && !closing && <header className={cx("topbar")}>
          <div className={cx("crumb")}>
            {!quietRoom && "Workspace "}
            <b>
              {!quietRoom && "/ "}
              {page === "Overview"
                ? "Performance"
                : page === "Journal"
                  ? "Daily journal"
                  : page}
            </b>
            {page === "Journal" && view === "story" && (
              <div className="ss-journal-mode" role="group" aria-label="Journal view">
                <button aria-pressed={journalMode === "action"} onClick={() => setJournalMode("action")}>
                  Day in Action
                </button>
                <button aria-pressed={journalMode === "book"} onClick={() => setJournalMode("book")}>
                  Journal
                </button>
              </div>
            )}
            {stillness && (
              <div className="ss-journal-mode" role="group" aria-label="Stillness view">
                <button aria-pressed={stillnessView === "personal"} onClick={() => setStillnessView("personal")}>Personal routine</button>
                <button aria-pressed={stillnessView === "library"} onClick={() => setStillnessView("library")}>Support library</button>
              </div>
            )}
          </div>
          <div className={cx("topactions")}>
            {reading && !useAwayAction && <button className="rr-session-action" disabled={capturePending && !p.active} onClick={() => {
              if (p.active) go("Done");
              else void act(startPreparedSession);
            }}>{p.active ? "Go to Done for the day →" : "Start session"}</button>}
            {props.dayAwayReview && page === "Journal" && <Button disabled={!away.ready || p.active || capturePending} onClick={() => {
              setAwayDateError("");
              if (awayDateDialog.current) {
                const input = awayDateDialog.current.querySelector<HTMLInputElement>('input[name="date"]');
                if (input) input.value = journalDateValue(journalTimestamp);
                awayDateDialog.current.showModal();
              }
            }}>Mark another date</Button>}
            {page === "Journal" && !reading && p.active && <button onClick={() => go("Done")}>Go to Done for the day →</button>}
            {!useAwayAction && <details className={cx("tools")}>
              <summary className={cx("iconbtn")} aria-label="Session tools">
                ⋯
              </summary>
              <div
                className={cx("tool-menu")}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button"))
                    event.currentTarget.parentElement?.removeAttribute("open");
                }}
              >
                <button onClick={props.onFloat}>Floating journal</button>
                <button onClick={props.onTrade}>Add trade</button>
                <button
                  onClick={() =>
                    capturePending
                      ? p.setError(
                          "Confirm or discard your capture draft before importing.",
                        )
                      : props.onCsv()
                  }
                >
                  Import market data
                </button>
                <button onClick={() => go("Connections")}>Connections</button>
                <button onClick={() => go("Settings")}>Settings</button>
                <button onClick={props.onExport}>Export session</button>
                <button onClick={() => props.onAdvanced()}>
                  Chart & replay
                </button>
              </div>
            </details>}
            {useAwayAction ? awayRecord?.away && <button className={cx("primary")} onClick={() => {
              setAwayEntry(undefined);
              setJournalMode("action");
              setAwayReflectionRequested(true);
            }}>+ Add reflection</button> : journal ? (
              <>
                <button
                  className={cx("iconbtn")}
                  onClick={() =>
                    props.onReflect({
                      t: captureTime,
                      source: "voice",
                      autoListen: true,
                    })
                  }
                >
                  ● Dictate a moment
                </button>
                <button
                  className={cx("primary")}
                  onClick={() => props.onReflect({ t: captureTime })}
                >
                  + Add reflection
                </button>
              </>
            ) : page === "Overview" ? (
              <>

                <button className={cx("primary")} onClick={() => go("Journal")}>
                  Open today’s journal
                </button>
              </>
            ) : page === "Sessions" ? (
              <>
                <button
                  className={cx("ghost")}
                  onClick={() =>
                    capturePending
                      ? p.setError(
                          "Confirm or discard your capture draft before importing.",
                        )
                      : props.onCsv()
                  }
                >
                  Import CSV
                </button>
                <button
                  className={cx("primary")}
                  disabled={p.connectingWhoop}
                  onClick={() => void act(p.active ? p.stop : p.attachWhoop)}
                >
                  {p.connectingWhoop
                    ? "Connecting WHOOP…"
                    : p.active
                      ? "End session"
                      : "Start HR recording"}
                </button>
              </>
            ) : page === "Stillness" ? (
              <>
                <button className={cx("ghost")} onClick={quiet}>
                  A quiet signal
                </button>
                <button
                  className={cx("primary")}
                  onClick={() => finishReset("journal")}
                >
                  Return to choice
                </button>
              </>
            ) : (
              <button className={cx("ghost")} onClick={() => go("Journal")}>
                Back to journal
              </button>
            )}
          </div>
          {page === "Journal" && !useAwayAction && (
            <div className="ss-journal-history" role="group" aria-label="Journal history">
              <button
                disabled={!p.canUndoJournal || p.journalHistoryBusy}
                onClick={() =>
                  void p
                    .undoJournal()
                    .catch((e) => p.setError((e as Error).message))
                }
              >
                ↶ Undo
              </button>
              <button
                disabled={!p.canRedoJournal || p.journalHistoryBusy}
                onClick={() =>
                  void p
                    .redoJournal()
                    .catch((e) => p.setError((e as Error).message))
                }
              >
                ↷ Redo
              </button>
            </div>
          )}
        </header>}
        {reading && <div className="rr-journal-heading"><div className="ss-eyebrow">Journal / connected moments</div><h1>{awayView && awayRecord?.away ? "Space between sessions." : "Your day, in your words."}</h1><p>{awayView ? formatAwayDate(awayDate) : new Date(s.startedAt).toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: s.timezone})} · {awayView && awayRecord?.away ? "Day away from charts" : "Your reflections, recordings and available evidence, together."}</p></div>}
        {returnToPreparation === page && <div className="rr-preparation-back"><button className="ss-ghost" onClick={() => go("Preparation")}>← Back to Preparation</button></div>}
        {page === "Stillness" && returnToDone && <div className="rr-preparation-back"><button className="ss-ghost" onClick={() => go("Done")}>← Back to Done for the day</button></div>}
        {stillness && workspaceNotices}
        <ReadingRoomPreparation
          key={p.owner}
          active={preparing}
          owner={p.owner}
          now={p.now}
          store={process}
          sessionActive={p.active}
          capturePending={capturePending}
          onSetup={openPreparationSetup}
          onStart={async () => {
            await p.start();
            if (props.dayAwayReview) await away.markStarted(preparationDate);
            go("Journal");
            if (awayToday) setJournalModeState("action");
          }}
          carriedThoughts={props.dayAwayReview && preparing && <CarriedThoughts
            entries={away.entries.filter(entry => entry.note.reminder?.preparation === preparationDate)}
            onOpen={entry => { openAwayJournal(entry.date); setAwayEntry({ date: entry.date, id: entry.note.id }); }}
            onSeen={entry => void away.setReminder(entry, null)}
          />}
          onJournal={() => go("Journal")}
          onPreview={previewItem}
          onGuidance={setPreparationGuidance}
        >
        <ReadingRoomDone
          active={closing}
          store={process}
          props={viewProps}
          onEnd={p.stop}
          onReflect={(prompt) => openJournalBook(prompt)}
          onPreview={previewItem}
        >
          <div hidden={stillness && stillnessView !== "library"}>
          <StillnessLibrary
            owner={p.owner}
            store={process}
            page={page}
            active={!stillness || stillnessView === "library"}
            browse={stillnessBrowse}
            // One suggestion per screen: an answer-based suggestion takes the place of the Home-topic preview link.
            preparation={support && { tags: support.tags, suggestion: preparationGuidance ? undefined : support.suggestion, onBrowse: browseFromPreparation }}
            previewRequest={preparing || closing ? previewRequest : undefined}
            closing={closing ? { onBrowse: browseFromDone } : undefined}
            closingBrowse={returnToDone}
            onPage={go}
            onOpenDay={(destination) => go(destination === "Preparation" ? "Preparation" : "Done")}
            onReflect={() => reflectForToday("stillness")}
            playRequest={playRequest}
            onPlayed={() => setPlayRequest(undefined)}
            carry={carrySupport}
          />
          </div>
        </ReadingRoomDone>
        </ReadingRoomPreparation>
        {!preparing && !closing && <div hidden={stillness && stillnessView !== "personal"}><PageBoard key={page === "Journal" ? journalEntry : undefined} owner={p.owner} page={page} sessions={[s, ...history]} onPresentationChange={setReadingRoom}>
          {!stillness && workspaceNotices}
          {<WorkspaceModule id="post-exit-review" title="A moment to review" order={40} width={6} initiallyHidden={page === "Journal"}>
            <PostExitInvitation props={viewProps} />
          </WorkspaceModule>}
          <ProcessWorkspace
            key={p.owner}
            {...viewProps}
            store={process}
            supportDay={supportDay}
            onSupportDayOpened={() => setSupportDay(undefined)}
          />
          {(page === "Overview" || page === "Journal") && (
            <WorkspaceModule id="weekly-reflection" title="Weekly reflection" order={41} width={6} initiallyHidden={page === "Journal"}>
              <WeeklyReminder
                sessions={[s, ...history]}
                owner={s.owner}
                active={p.active || capturePending}
                enabled={p.settings.weeklyReminders !== false}
                onOpen={(key) => {
                  setReviewWeek(key);
                  setWeekly(true);
                  props.onPage("Journal");
                }}
                onPreference={(enabled) =>
                  p.configure({ ...p.settings, weeklyReminders: enabled })
                }
              />
            </WorkspaceModule>
          )}
          {page === "Overview" && (
            <WorkspaceModule
              id="performance"
              title="Performance overview"
              parts={[
                {
                  id: "metrics",
                  title: "Summary numbers",
                  selector: ".ss-metrics",
                },
                {
                  id: "stories",
                  title: "Session stories",
                  selector: ".ss-storygrid",
                },
              ]}
            >
              <Overview {...viewProps} onReview={review} />
            </WorkspaceModule>
          )}
          {page === "Overview" && (
            <WorkspaceModule
              id="session-environment"
              title="Session environment"
            >
              <SessionContext
                key={s.id}
                session={s}
                history={history}
                onSave={p.updateBlueprint}
              />
            </WorkspaceModule>
          )}
          {page === "Prepare" && (
            <>
              <section className={cx("hero")}>
                <div>
                  <div className={cx("eyebrow")}>Before the market</div>
                  <h1>Prepare with intention.</h1>
                  <p>A few commitments to come back to. Yours to define.</p>
                </div>
                <button
                  className={cx("primary")}
                  onClick={() => props.onPage("Pre-Market")}
                >
                  Open guided routine →
                </button>
                <button
                  className={cx("primary")}
                  onClick={() =>
                    void act(p.active ? p.stop : startPreparedSession)
                  }
                >
                  {p.active ? "End session" : "Start session"}
                </button>
              </section>
              <WorkspaceModule
                id="preparation-context"
                title="Preparation and intentions"
              >
                <ReferenceContext key={s.id} {...viewProps} />
              </WorkspaceModule>
            </>
          )}
          <ModuleScope active={journal}>
            <div hidden={!journal} className={cx("reference-journal-grid")}>
              <WorkspaceModule id="daily-reference" title="Daily reference" section="side" initiallyHidden>
                <ReadingRoomReference props={viewProps} week={week} onWeek={setWeek} onOpen={openDay}
                  selectedDate={awayView ? journalTimestamp : undefined} awayDates={awayDates} startedDates={startedDates} />
              </WorkspaceModule>
              <WorkspaceModule
                id="dates"
                title="Date overview"
                section="top"
                order={30}
                initiallyHidden
                parts={[
                  { id: "week", title: "Week strip", selector: ".ss-week" },
                  {
                    id: "picker",
                    title: "Date picker",
                    selector: ".ss-journal-day-picker",
                  },
                  {
                    id: "navigation",
                    title: "Week navigation",
                    selector: ".ss-datecontrols",
                  },
                ]}
              >
                <div
                  className={cx("journal-date-overview")}
                  data-layout-id="journal-date-overview"
                  data-layout-title="Date overview"
                  data-layout-span="12"
                >
                  <div className={cx("journal-date-heading")}>
                    <div>
                      <div className={cx("eyebrow")}>Daily journal</div>
                      <h1>
                        {new Date(journalTimestamp).toLocaleDateString("en-GB", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </h1>
                    </div>
                    <JournalDayPicker
                      key={awayJournalDate || s.id}
                      date={journalTimestamp}
                      disabled={p.active || openingDay || capturePending}
                      onOpen={openDay}
                    />
                  </div>
                  <div className={cx("datecontrols")}>
                    <button
                      className={cx("iconbtn")}
                      aria-label="Previous week"
                      onClick={() => setWeek((n) => n - 1)}
                    >
                      ‹
                    </button>
                    <span>
                      {ws.getDate()}–{we.getDate()}{" "}
                      {we.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <button
                      className={cx("iconbtn")}
                      aria-label="Next week"
                      onClick={() => setWeek((n) => n + 1)}
                    >
                      ›
                    </button>
                  </div>
                  <Calendar
                    weekdaysOnly
                    sessions={history}
                    selected={s}
                    selectedDate={awayView ? journalTimestamp : undefined}
                    awayDates={awayDates}
                    offset={week}
                    disabled={p.active || openingDay || capturePending}
                    onOpen={(target) => props.dayAwayReview ? void openDay(journalDateValue(target.startedAt)) : void act(() => p.openSession(target))}
                    onEmptyDay={(date) => void openDay(date)}
                  />
                </div>
              </WorkspaceModule>
              <div
                className={cx("reference-day")}
                data-layout-panel
                data-layout-id="journal-content"
                data-layout-title="Daily journal"
                data-layout-span="9"
              >
                {weekly ? (
                  <>
                    <button onClick={() => setWeekly(false)}>
                      Back to journal
                    </button>
                    <WorkspaceModule
                      id="weekly-review"
                      title="Weekly intentions and review"
                    >
                      <ReferenceWeek
                        key={s.id + reviewWeek}
                        {...viewProps}
                        week={reviewWeek}
                      />
                    </WorkspaceModule>
                  </>
                ) : (
                  <>
                    {!useAwayAction && <WorkspaceModule
                      id="session-controls"
                      title="Session controls"
                      order={4}
                    >
                      <section
                        className={cx(
                          "session-controls",
                          "v4-sessionbar",
                          !p.active && "idle",
                        )}
                        aria-label="Session controls"
                      >
                        <div className={cx("session-state")}>
                          <i />
                          <div>
                            <strong>
                              {p.active
                                ? "Recording"
                                : s.endedAt
                                  ? "Session ended"
                                  : "Session not started"}
                            </strong>
                            <small>
                              {p.active
                                ? p.recording
                                  ? "Heart rate and journal"
                                  : "Journal only · wearable optional"
                                : p.syncState}
                            </small>
                          </div>
                        </div>
                        <button
                          disabled={capturePending && !p.active}
                          className={cx(
                            p.active ? "ghost end-session" : "primary",
                          )}
                          onClick={() =>
                            void act(async () => {
                              if (p.active) {
                                await p.stop();
                                if (p.settings.startWithStillness !== false)
                                  go("Stillness");
                              } else await startPreparedSession();
                            }, p.active)
                          }
                        >
                          {p.active ? "End Session" : "Start Session"}
                        </button>
                        {p.active && !p.recording && (
                          <button
                            className={cx("ghost")}
                            disabled={p.connectingWhoop}
                            onClick={() => void act(p.attachWhoop)}
                          >
                            {p.connectingWhoop
                              ? "Connecting WHOOP…"
                              : "Connect heart rate"}
                          </button>
                        )}
                        <button
                          className={cx("ghost")}
                          onClick={() =>
                            capturePending
                              ? p.setError(
                                  "Confirm or discard your capture draft before importing.",
                                )
                              : props.onCsv()
                          }
                        >
                          Import market data
                        </button>
                        <span role="status">
                          {s.events.some(
                            (e) => e.provenance !== "alert" && !e.voided,
                          )
                            ? "Executions matched"
                            : "No trades recorded · journal ready"}
                        </span>
                      </section>
                    </WorkspaceModule>}
                    <Journal
                      {...viewProps}
                      session={awaySession || activitySession || s}
                      awayPage={awayView ? {
                        content: awayContent, showInAction: useAwayAction,
                        book: bookContext ? { session: bookContext, save: saveDatedBookNotes } : undefined,
                      } : undefined}
                      focusTime={focusTime}
                      mode={journalMode}
                      bookRequest={bookRequest}
                      view={view}
                      setView={(v) => {
                        setView(v);
                        props.onPage("Journal");
                      }}
                    />
                  </>
                )}
              </div>
              <WorkspaceModule
                id="calendar"
                title="Calendar & previous entries"
                section="side"
                order={0}
                parts={[
                  {
                    id: "calendar",
                    title: "Month calendar",
                    selector: ".ss-mini-month",
                  },
                  {
                    id: "search",
                    title: "Search your words",
                    selector: "input[type=search],.ss-search-results",
                  },
                  {
                    id: "weekly",
                    title: "Weekly review",
                    selector: ".ss-reference-card:nth-child(2)",
                  },
                  {
                    id: "record",
                    title: "Saved record summary",
                    selector: ".ss-reference-card:nth-child(3)",
                  },
                ]}
              >
                <div
                  className={cx("journal-calendar-side")}
                  data-layout-panel
                  data-layout-id="journal-calendar"
                  data-layout-title="Calendar & previous entries"
                  data-layout-span="3"
                >
                  <ReferenceHistory
                    session={s}
                    sessions={history}
                    disabled={p.active || openingDay || capturePending}
                    onDay={(date) => void openDay(date)}
                    onWeek={() => setWeekly((v) => !v)}
                    onNote={(source, n) =>
                      void act(async () => {
                        if (
                          source.id !== s.id &&
                          !(await p.openSession(source))
                        )
                          return;
                        go("Journal");
                        props.onReflect({ t: n.t, entry: n });
                      })
                    }
                  />
                </div>
              </WorkspaceModule>
            </div>
          </ModuleScope>
          {page === "Sessions" && (
            <>
              <section className={cx("hero")}>
                <div>
                  <div className={cx("eyebrow")}>Recorded data sources</div>
                  <h1>Sessions</h1>
                  <p>
                    Your recordings and reflections, organised by day. Expand a
                    day to see its story, then open any recording or entry.
                  </p>
                </div>
              </section>
              <div className={cx("analysisexplainer")}>
                <strong>One day at a time.</strong>
                <p>
                  Each day gathers your own reflection labels, heart-rate
                  recordings and trades. Open a recording to see the details.
                </p>
              </div>
              <div className={cx("sectiontitle")}>
                <div>
                  <h2>Your days</h2>
                  <p>
                    {history.length} recordings ·{" "}
                    {history.filter((h) => h.endedAt).length} completed
                  </p>
                </div>
                <div className={cx("topactions")}>
                  <JournalDayPicker
                    key={s.id}
                    date={s.startedAt}
                    disabled={p.active || openingDay || capturePending}
                    onOpen={openDay}
                  />
                  <button
                    className={cx("ghost")}
                    onClick={() =>
                      void act(async () => {
                        await pullSessions(p.owner);
                        await p.refreshHistory();
                        p.setNotice("Cloud sessions refreshed.");
                      })
                    }
                  >
                    Refresh cloud
                  </button>
                  <button
                    className={cx("ghost")}
                    onClick={() =>
                      void act(p.active ? p.stop : startPreparedSession)
                    }
                  >
                    {p.active ? "End session" : "Start session"}
                  </button>
                </div>
              </div>
              <WorkspaceModule id="session-history" title="Your saved days">
                <SessionDays
                  history={history}
                  selected={s}
                  selectedSamples={p.samples}
                  owner={p.owner}
                  baselineSeconds={p.settings.baselineSeconds}
                  active={p.active}
                  onOpen={(item) =>
                    void act(async () => {
                      if (item.id !== s.id) await p.openSession(item);
                      setFocusTime(undefined);
                      go("Journal");
                    })
                  }
                  onManage={(item) =>
                    void act(async () => {
                      if (item.id !== s.id) await p.openSession(item);
                      go("Settings");
                    })
                  }
                  onEntry={(item, entry) =>
                    void act(async () => {
                      if (item.id !== s.id) await p.openSession(item);
                      setFocusTime(entry.t);
                      go("Journal");
                    })
                  }
                />
              </WorkspaceModule>
              {!history.length && (
                <p className={cx("empty-note")}>
                  Choose a journal date to begin. Trades and CSV uploads are
                  optional.
                </p>
              )}
            </>
          )}
          <ModuleScope active={page === "Stillness"}>
            <div hidden={page !== "Stillness"}>
              <WorkspaceModule
                id="personal-stillness"
                title="My stillness routine"
              >
                {page === "Stillness" && <>
                  <button onClick={() => setStillnessView("library")}>Browse support library</button>
                  <SavedStillness props={viewProps} store={process} active={stillnessView === "personal"} />
                </>}
              </WorkspaceModule>
              <WorkspaceModule
                id="stillness"
                title="Stillness practice"
                parts={[
                  {
                    id: "breathing",
                    title: "Breathing guide",
                    selector: ".ss-breathing-square",
                  },
                  {
                    id: "presets",
                    title: "Practice choices",
                    selector: ".ss-reset-modules",
                  },
                ]}
              >
                <SessionReset
                  key={s.id}
                  active={page === "Stillness" && stillnessView === "personal"}
                  onChoice={finishReset}
                />
              </WorkspaceModule>
            </div>
          </ModuleScope>
        </PageBoard></div>}
        </>
        )}
      </main>
      <nav className={cx("mobilebar")} aria-label="Mobile navigation">
        {navigation.map(([name, , label]) => (
          <button
            className={cx(page === name && "active")}
            key={name}
            onClick={() => go(name)}
          >
            {name === "Journal"
                ? "Journal"
                : label}
          </button>
        ))}
      </nav>
      <div className={cx("whisper", "pos1", !!whisper && "show")}>
        {whisper}
      </div>
      {(!awayToday && !useAwayAction || p.active) && <aside
        className={cx("compact-widget-host")}
        aria-label="Still Signal live widget"
      >
        <CapturePanel
          key={s.id}
          controller={props.capture}
          session={daySession}
          samples={p.samples}
          baselineSeconds={p.settings.baselineSeconds}
          now={p.now}
          active={p.active}
          recording={p.recording}
          shortcut={p.settings.shortcutKey}
          onReflect={props.onReflect}
          onSave={p.addNote}
          onSaveBlueprint={p.updateBlueprint}
        />
      </aside>}
    </div>
  );
}
