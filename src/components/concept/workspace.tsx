"use client";
import { useEffect, useRef, useState } from "react";
import { pullSessions } from "@/lib/cloud";
import { summary } from "@/lib/analytics";
import CapturePanel from "./capture-panel";
import { dailyJournalSession } from "@/lib/journal-collection";
import { cx, type Page, type Props } from "./shared";
import { Calendar, weekStart } from "./calendar";
import Journal from "./journal";
import SessionDays from "./session-days";
import JournalDayPicker from "./journal-day-picker";
import ModuleWorkspace, { WorkspaceModule, ModuleScope } from "../module-workspace";
import Overview from "./overview";
import ProcessWorkspace from "../command-center/workspace";
import Stillness, { reflections } from "./stillness";
import SessionReset from "./session-reset";
import SessionContext from "./session-context";
import ReferenceContext from "./reference-context";
import ReferenceHistory from "./reference-history";
import ReferenceWeek from "./reference-week";
import WeeklyReminder from "./weekly-reminder";
const navigation: [Page, string, string][] = [
  ["Command Center", "⌂", "Command Center"],
  ["Journal", "▣", "Daily journal"],
  ["Patterns", "⌁", "Patterns"],
  ["Stillness", "◌", "Stillness"],
  ["Settings", "⚙", "Settings"],
];
const commandPages: Page[] = [
  "Command Center",
  "Pre-Market",
  "Trading Thesis",
  "Trade Quality",
  "Rule Violations",
  "Audits",
  "Missions",
  "Settings & Variables",
  "Prepare",
];
export default function ConceptWorkspace(props: Props) {
  const pageRoot = useRef<HTMLElement>(null);
  const { pulse: p, session: s, history, page } = props;
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
      p.settings.startWithStillness !== false
    )
      props.onPage("Stillness");
    previousActive.current = p.active;
  }, [
    s.id,
    s.endedAt,
    p.active,
    p.settings.startWithStillness,
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
  const [view, setView] = useState<"story" | "patterns" | "review">("story"),
    [week, setWeek] = useState(0),
    [welcome, setWelcome] = useState(false),
    [startSignal, setStartSignal] = useState(0),
    [whisper, setWhisper] = useState(""),
    [widget, setWidget] = useState(false),
    [openingDay, setOpeningDay] = useState(false),
    [focusTime, setFocusTime] = useState<number | undefined>();
  const welcomeRef = useRef<HTMLDialogElement>(null),
    widgetRef = useRef<HTMLElement>(null),
    dragRef = useRef<{ x: number; y: number } | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (welcome) welcomeRef.current?.showModal();
  }, [welcome]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !capturePending) setWidget(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [capturePending]);
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
  const go = (next: Page) => {
    setWeekly(false);
    if (next !== "Journal") setFocusTime(undefined);
    if (next === "Stillness" && page !== "Stillness") setWelcome(true);
    if (next === "Journal" || next === "Live Session") setView("story");
    if (next === "Patterns") setView("patterns");
    props.onPage(next);
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
    setOpeningDay(true);
    try {
      await act(async () => {
        if (!(await p.openJournalDay(date))) return;
        setFocusTime(undefined);
        go("Journal");
      });
    } finally {
      setOpeningDay(false);
    }
  };
  const quiet = () => {
    setWhisper(reflections[Math.floor(Math.random() * reflections.length)]);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setWhisper(""), 5200);
  };
  const journal =
    page === "Journal" || page === "Patterns" || page === "Live Session";
  const ws = weekStart(s.startedAt, week),
    we = new Date(ws);
  we.setDate(we.getDate() + 6);
  const latest = p.samples.at(-1),
    stats = summary(
      p.samples,
      p.samples[0]?.t || s.startedAt,
      p.settings.baselineSeconds,
    ),
    delta =
      latest && stats.baseline !== null
        ? Math.round(latest.bpm - stats.baseline)
        : null;
  const captureTime = p.active ? p.now : s.endedAt || s.startedAt;
  const viewProps = { ...props, onPage: go };
  return (
    <div className={cx("app", "reference-app")}>
      <header className={cx("reference-topbar")}>
        <button
          className={cx("reference-brand")}
          onClick={() => go("Command Center")}
        >
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="currentColor" />
            <path d="M3 17h7l3-8 6 15 3-7h7" stroke="currentColor" />
          </svg>
          still signal <span>.</span>
        </button>
        <nav className={cx("reference-nav")} aria-label="Main navigation">
          {navigation.map(([name, , label]) => (
            <button
              key={name}
              aria-label={name === "Patterns" ? "Heart-rate analytics" : label}
              aria-current={
                page === name ||
                (name === "Command Center" && commandPages.includes(page))
                  ? "page"
                  : undefined
              }
              className={cx(
                (page === name ||
                  (name === "Command Center" && commandPages.includes(page))) &&
                  "active",
              )}
              onClick={() => go(name)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={cx("reference-top-actions")}>
          <button
            className={cx("connection-shortcut")}
            onClick={() => go("Connections")}
          >
            Connections
          </button>
          <button className={cx("floating-shortcut")} onClick={props.onFloat}>
            Floating window ↗
          </button>
          <button
            disabled={capturePending}
            onClick={() =>
              capturePending
                ? p.setError(
                    "Confirm or discard your capture draft before importing.",
                  )
                : props.onCsv()
            }
          >
            Import session ↗
          </button>
          <details className={cx("reference-tools")}>
            <summary aria-label="Session tools">⋯</summary>
            <div>
              <button onClick={() => go("Sessions")}>Saved sessions</button>
              <button onClick={() => go("Overview")}>Overview</button>
              <button onClick={() => go("Connections")}>Connections</button>
              <button onClick={props.onTrade}>Add trade</button>
              <button onClick={() => props.onAdvanced()}>Chart & replay</button>
              <button onClick={props.onFloat}>Floating journal window</button>
              <button onClick={props.onExport}>Export session</button>
            </div>
          </details>
          <span className={cx("reference-avatar")} title={p.email}>
            {(p.email || "You").slice(0, 2).toUpperCase()}
          </span>
        </div>
      </header>
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
              className={cx(
                (page === name ||
                  (name === "Command Center" && commandPages.includes(page))) &&
                  "active",
              )}
              aria-current={
                page === name ||
                (name === "Command Center" && commandPages.includes(page))
                  ? "page"
                  : undefined
              }
              onClick={() => go(name)}
              aria-label={
                name === "Overview"
                  ? "Overview"
                  : name === "Patterns"
                    ? "Heart-rate analytics"
                    : label
              }
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
        <header className={cx("topbar")}>
          <div className={cx("crumb")}>
            Workspace{" "}
            <b>
              /{" "}
              {page === "Overview"
                ? "Performance"
                : page === "Journal"
                  ? "Daily journal"
                  : page}
            </b>
          </div>
          <div className={cx("topactions")}>
            <details className={cx("tools")}>
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
            </details>
            {journal ? (
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
            ) : page === "Command Center" ? (
              <button
                className={cx("primary")}
                onClick={() => void act(p.active ? p.stop : p.start)}
              >
                {p.active ? "End session" : "Start session"}
              </button>
            ) : page === "Overview" ? (
              <>
                <button className={cx("ghost")} onClick={() => go("Patterns")}>
                  Explore patterns
                </button>
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
        </header>
        <ModuleWorkspace owner={p.owner} page={page} enabled={page !== "Command Center"}>
        {s.demo && (
          <p className={cx("demo-notice")}>
            DEMO DATA · Simulated heart rate, trades and reflections. No broker
            or wearable is connected to this dataset.
          </p>
        )}
        {p.error && (
          <div className={cx("message", "error")} role="alert">
            <span>{p.error}</span>
            <button aria-label="Dismiss error" onClick={() => p.setError("")}>
              ×
            </button>
          </div>
        )}
        {p.notice && (
          <div className={cx("message")} role="status">
            <span>{p.notice}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => p.setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {<ProcessWorkspace key={p.owner} {...viewProps} />}
        {(page === "Overview" || page === "Journal") && (
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
        )}
        {page === "Overview" && <WorkspaceModule id="performance" title="Performance overview" parts={[{id:"metrics",title:"Summary numbers",selector:".ss-metrics"},{id:"stories",title:"Session stories",selector:".ss-storygrid"}]}><Overview {...viewProps} onReview={review} /></WorkspaceModule>}
        {page === "Overview" && (
          <WorkspaceModule id="session-environment" title="Session environment"><SessionContext
            key={s.id}
            session={s}
            history={history}
            onSave={p.updateBlueprint}
          /></WorkspaceModule>
        )}
        {page === "Prepare" && (
          <>
            <section className={cx("hero")}>
              <div>
                <div className={cx("eyebrow")}>Before the market</div>
                <h1>Choose your intentions.</h1>
                <p>A few commitments to come back to. Yours to define.</p>
              </div>
              <button
                className={cx("primary")}
                onClick={() => void act(p.active ? p.stop : p.start)}
              >
                {p.active ? "End session" : "Start session"}
              </button>
            </section>
            <WorkspaceModule id="preparation-context" title="Preparation and intentions"><ReferenceContext key={s.id} {...viewProps} /></WorkspaceModule>
          </>
        )}
        <ModuleScope active={journal}><div hidden={!journal} className={cx("reference-journal-grid")}>
          <WorkspaceModule id="dates" title="Date overview" section="top" order={0} parts={[{id:"week",title:"Week strip",selector:".ss-week"},{id:"picker",title:"Date picker",selector:".ss-journal-day-picker"},{id:"navigation",title:"Week navigation",selector:".ss-datecontrols"}]}><section className={cx("journal-date-overview")} data-layout-id="journal-date-overview" data-layout-title="Date overview" data-layout-span="12">
            <div className={cx("journal-date-heading")}>
              <div>
                <div className={cx("eyebrow")}>Daily journal</div>
                <h1>{new Date(s.startedAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
              </div>
              <JournalDayPicker key={s.id} date={s.startedAt} disabled={p.active || openingDay || capturePending} onOpen={openDay} />
            </div>
            <div className={cx("datecontrols")}>
              <button className={cx("iconbtn")} aria-label="Previous week" onClick={() => setWeek(n => n - 1)}>‹</button>
              <span>{ws.getDate()}–{we.getDate()} {we.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              <button className={cx("iconbtn")} aria-label="Next week" onClick={() => setWeek(n => n + 1)}>›</button>
            </div>
            <Calendar weekdaysOnly sessions={history} selected={s} offset={week} disabled={p.active || openingDay || capturePending}
              onOpen={target => void act(() => p.openSession(target))} onEmptyDay={date => void openDay(date)} />
          </section></WorkspaceModule>
          <div className={cx("reference-day")} data-layout-panel data-layout-id="journal-content" data-layout-title="Daily journal" data-layout-span="9">
            {weekly ? (
              <>
                <button onClick={() => setWeekly(false)}>
                  Back to journal
                </button>
                <WorkspaceModule id="weekly-review" title="Weekly intentions and review"><ReferenceWeek
                  key={s.id + reviewWeek}
                  {...viewProps}
                  week={reviewWeek}
                /></WorkspaceModule>
              </>
            ) : (
              <>
                <WorkspaceModule id="session-controls" title="Session controls" section="top" order={1}><section
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
                    className={cx(p.active ? "ghost end-session" : "primary")}
                    onClick={() =>
                      void act(async () => {
                        if (p.active) {
                          await p.stop();
                          if (p.settings.startWithStillness !== false)
                            go("Stillness");
                        } else await p.start();
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
                    {s.events.some((e) => e.provenance !== "alert" && !e.voided)
                      ? "Executions matched"
                      : "No trades recorded · journal ready"}
                  </span>
                </section></WorkspaceModule>
                <Journal
                  {...viewProps}
                  focusTime={focusTime}
                  view={page === "Patterns" ? "patterns" : view}
                  setView={(v) => {
                    setView(v);
                    props.onPage(v === "patterns" ? "Patterns" : "Journal");
                  }}
                />
              </>
            )}
          </div>
          <WorkspaceModule id="calendar" title="Calendar & previous entries" section="side" order={0} parts={[{id:"calendar",title:"Month calendar",selector:".ss-mini-month"},{id:"search",title:"Search your words",selector:"input[type=search],.ss-search-results"},{id:"weekly",title:"Weekly review",selector:".ss-reference-card:nth-child(2)"},{id:"record",title:"Saved record summary",selector:".ss-reference-card:nth-child(3)"}]}><div className={cx("journal-calendar-side")} data-layout-panel data-layout-id="journal-calendar" data-layout-title="Calendar & previous entries" data-layout-span="3">
            <ReferenceHistory
              session={s}
              sessions={history}
              disabled={p.active || openingDay || capturePending}
              onDay={(date) => void openDay(date)}
              onWeek={() => setWeekly((v) => !v)}
              onNote={(source, n) =>
                void act(async () => {
                  if (source.id !== s.id && !(await p.openSession(source)))
                    return;
                  go("Journal");
                  props.onReflect({ t: n.t, entry: n });
                })
              }
            />
          </div></WorkspaceModule>
        </div></ModuleScope>
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
                  onClick={() => void act(p.active ? p.stop : p.start)}
                >
                  {p.active ? "End session" : "Start session"}
                </button>
              </div>
            </div>
            <WorkspaceModule id="session-history" title="Your saved days"><SessionDays
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
            /></WorkspaceModule>
            {!history.length && (
              <p className={cx("empty-note")}>
                Choose a journal date to begin. Trades and CSV uploads are
                optional.
              </p>
            )}
          </>
        )}
        <ModuleScope active={page === "Stillness"}><div hidden={page !== "Stillness"}>
          <WorkspaceModule id="stillness" title="Stillness practice" parts={[{id:"breathing",title:"Breathing guide",selector:".ss-breathing-square"},{id:"presets",title:"Practice choices",selector:".ss-reset-modules"}]}><SessionReset
            key={s.id}
            active={page === "Stillness"}
            onChoice={finishReset}
          /></WorkspaceModule>
        </div></ModuleScope>
        </ModuleWorkspace>
      </main>
      <nav className={cx("mobilebar")} aria-label="Mobile navigation">
        {navigation.map(([name, , label]) => (
          <button
            className={cx(
              (page === name ||
                (name === "Command Center" && commandPages.includes(page))) &&
                "active",
            )}
            key={name}
            onClick={() => go(name)}
          >
            {name === "Patterns"
              ? "Patterns"
              : name === "Journal"
                ? "Journal"
                : label}
          </button>
        ))}
      </nav>
      {welcome && (
        <dialog
          ref={welcomeRef}
          className={cx("stillnesswelcome", "show")}
          onCancel={() => setWelcome(false)}
        >
          <div className={cx("arrive")}>
            <div className={cx("breathorb")} />
            <div className={cx("eyebrow")}>Still Signal</div>
            <h2>Arrive before you analyse.</h2>
            <p>
              Nothing needs to be fixed in this second. Let yourself notice
              where you are.
            </p>
            <button className={cx("primary")} onClick={() => setWelcome(false)}>
              I’m here
            </button>
          </div>
        </dialog>
      )}
      <div className={cx("whisper", "pos1", !!whisper && "show")}>
        {whisper}
      </div>
      <aside
        ref={widgetRef}
        className={cx("compact-widget-host")}
        aria-label="Still Signal live widget"
      >
        <CapturePanel
          labels={p.settings.phaseLabels}
          key={s.id}
          controller={props.capture}
          session={daySession}
          samples={p.samples}
          baselineSeconds={p.settings.baselineSeconds}
          now={p.now}
          active={p.active}
          recording={p.recording}
          shortcut={p.settings.shortcutKey}
          onClose={() => setWidget(false)}
          onReflect={props.onReflect}
          onSave={p.addNote}
          onSaveBlueprint={p.updateBlueprint}
        />
      </aside>
    </div>
  );
}
