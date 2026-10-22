"use client";
import { useEffect, useRef, useState } from "react";
import { pullSessions } from "@/lib/cloud";
import { summary } from "@/lib/analytics";
import CapturePanel from "./capture-panel";
import { cx, type Page, type Props } from "./shared";
import { Calendar, weekStart } from "./calendar";
import Journal from "./journal";
import SessionDays from "./session-days";
import Overview from "./overview";
import Stillness, { reflections } from "./stillness";
const navigation: [Page, string, string][] = [
  ["Overview", "⌂", "Overview"],
  ["Journal", "▣", "Daily journal"],
  ["Patterns", "⌁", "Heart-rate analytics"],
  ["Sessions", "◴", "Sessions"],
  ["Stillness", "◌", "Stillness"],
  ["Connections", "↗", "Connections"],
];
export default function ConceptWorkspace(props: Props) {
  const { pulse: p, session: s, history, page } = props;
  const [view, setView] = useState<"story" | "patterns" | "review">("story"),
    [week, setWeek] = useState(0),
    [welcome, setWelcome] = useState(false),
    [startSignal, setStartSignal] = useState(0),
    [whisper, setWhisper] = useState(""),
    [widget, setWidget] = useState(false),
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
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setWidget(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    setWeek(0);
  }, [s.id]);
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [page]);
  async function act(fn: () => Promise<unknown>) {
    try {
      p.setError("");
      await fn();
    } catch (e) {
      p.setError(e instanceof Error ? e.message : "Please try again.");
    }
  }
  const go = (next: Page) => {
    if (next !== "Journal") setFocusTime(undefined);
    if (next === "Stillness" && page !== "Stillness") setWelcome(true);
    if (next === "Journal") setView("story");
    if (next === "Patterns") setView("patterns");
    props.onPage(next);
  };
  const review = () => {
    setView("review");
    props.onPage("Journal");
  };
  const quiet = () => {
    setWhisper(reflections[Math.floor(Math.random() * reflections.length)]);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setWhisper(""), 5200);
  };
  const journal = page === "Journal" || page === "Patterns";
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
    <div className={cx("app")}>
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
      <main>
        <header className={cx("topbar")}>
          <div className={cx("crumb")}>
            Workspace <b>/ {journal ? "Daily journal" : page}</b>
          </div>
          <div className={cx("topactions")}>
            <details className={cx("tools")}><summary className={cx("iconbtn")} aria-label="Session tools">⋯</summary>
              <div className={cx("tool-menu")} onClick={event => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.parentElement?.removeAttribute("open"); }}>
                <button onClick={props.onFloat}>Floating journal</button>
                <button onClick={props.onTrade}>Add trade</button>
                <button onClick={props.onCsv}>Import market data</button>
                <button onClick={() => go("Connections")}>Connections</button>
                <button onClick={() => go("Settings")}>Settings</button>
                <button onClick={props.onExport}>Export session</button>
                <button onClick={() => props.onAdvanced()}>Chart & replay</button>
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
                <button className={cx("ghost")} onClick={props.onCsv}>
                  Import CSV
                </button>
                <button
                  className={cx("primary")}
                  onClick={() => void act(p.active ? p.stop : p.attachWhoop)}
                >
                  {p.active ? "End session" : "Start HR recording"}
                </button>
              </>
            ) : page === "Stillness" ? (
              <>
                <button className={cx("ghost")} onClick={quiet}>
                  A quiet signal
                </button>
                <button
                  className={cx("primary")}
                  onClick={() => setStartSignal((n) => n + 1)}
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
        {s.demo && <p className={cx("demo-notice")}>DEMO DATA · Simulated heart rate, trades and reflections. No broker or wearable is connected to this dataset.</p>}
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
        {page === "Overview" && <Overview {...viewProps} onReview={review} />}
        <div hidden={!journal}>
          {journal && (
            <section className={cx("hero")}>
              <div>
                <div className={cx("eyebrow")}>
                  Daily journal ·{" "}
                  {p.syncState.toLowerCase().includes("connected")
                    ? "synced automatically"
                    : p.syncState}
                </div>
                <h1>
                  {new Date(s.startedAt).toLocaleDateString("en-GB", {
                    weekday: "long",
                  }) +
                    ", " +
                    new Date(s.startedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                    })}
                </h1>
                <p>
                  One trading day. Heart rate, execution and reflection in
                  context.
                </p>
              </div>
              <div className={cx("datecontrols")}>
                <button
                  className={cx("iconbtn")}
                  aria-label="Previous week"
                  onClick={() => setWeek((n) => n - 1)}
                >
                  ‹
                </button>
                <div className={cx("currentdate")}>
                  {ws.getDate()}–{we.getDate()}{" "}
                  {we.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <button
                  className={cx("iconbtn")}
                  aria-label="Next week"
                  onClick={() => setWeek((n) => n + 1)}
                >
                  ›
                </button>
              </div>
            </section>
          )}
          {journal && (
            <Calendar
              sessions={history}
              selected={s}
              offset={week}
              disabled={p.active}
              onOpen={(target) => void act(() => p.openSession(target))}
            />
          )}
        <section className={cx("session-controls", "v4-sessionbar", !p.active && "idle")} aria-label="Session controls">
          <div className={cx("session-state")}><i /><div><strong>{p.active ? "Recording" : s.endedAt ? "Session ended" : "Session not started"}</strong>
            <small>{p.active ? p.recording ? "Heart rate and journal" : "Journal only · wearable optional" : p.syncState}</small></div></div>
          <button className={cx(p.active ? "ghost end-session" : "primary")} onClick={() => void act(async () => {
            if (p.active) { await p.stop(); review(); } else await p.start();
          })}>{p.active ? "End Session" : "Start Session"}</button>
          {p.active && !p.recording && <button className={cx("ghost")} onClick={() => void act(p.attachWhoop)}>Connect heart rate</button>}
          <button className={cx("ghost")} onClick={props.onCsv}>Import market data</button>
          <span role="status">{s.events.some(e => e.provenance !== "alert" && !e.voided) ? "Executions matched" : "Market data missing"}</span>
        </section>
          <Journal
            {...viewProps}
            focusTime={focusTime}
            view={page === "Patterns" ? "patterns" : view}
            setView={(v) => {
              setView(v);
              props.onPage(v === "patterns" ? "Patterns" : "Journal");
            }}
          />
        </div>
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
            {!history.length && (
              <p className={cx("empty-note")}>
                Start a session or import your trades to begin.
              </p>
            )}
          </>
        )}
        <div hidden={page !== "Stillness"}>
          <Stillness
            key={s.id}
            session={s}
            time={captureTime}
            onSave={p.addNote}
            onReflect={props.onReflect}
            startSignal={startSignal}
          />
        </div>
      </main>
      <nav className={cx("mobilebar")} aria-label="Mobile navigation">
        {navigation.slice(0, 5).map(([name, , label]) => (
          <button
            className={cx(page === name && "active")}
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
        className={cx(
          "livewidget",
          delta !== null && delta >= props.threshold && "elevated",
          widget && "expanded",
        )}
        aria-label="Still Signal live widget"
      >
        <CapturePanel key={s.id} session={s} samples={p.samples} baselineSeconds={p.settings.baselineSeconds} now={p.now} active={p.active} recording={p.recording} shortcut={p.settings.shortcutKey} onClose={() => setWidget(false)} onReflect={props.onReflect} onSave={p.addNote} />
        <div className={cx("widgetpill")} title="Drag the widget anywhere"
          onPointerDown={event => {
            if ((event.target as HTMLElement).closest("button")) return;
            const element = widgetRef.current!;
            const rect = element.getBoundingClientRect();
            dragRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            element.style.right = "auto"; element.style.bottom = "auto";
            element.style.left = rect.left + "px"; element.style.top = rect.top + "px";
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            if (!dragRef.current || !widgetRef.current) return;
            const element = widgetRef.current;
            element.style.left = Math.max(8, Math.min(innerWidth - element.offsetWidth - 8, event.clientX - dragRef.current.x)) + "px";
            element.style.top = Math.max(widget ? 360 : 8, Math.min(innerHeight - element.offsetHeight - 8, event.clientY - dragRef.current.y)) + "px";
          }}
          onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
          <span className={cx("widgetlogo")}>⌁</span>
          <i
            className={cx("widgetstatus")}
            style={p.recording ? undefined : { background: "var(--muted)" }}
          />
          <span className={cx("widgetreading")}>
            {latest?.bpm ?? "—"} BPM{" "}
            <small>
              {delta === null ? "" : `${delta >= 0 ? "+" : ""}${delta}`}
            </small>
          </span>
          <button
            className={cx("roundbtn")}
            aria-label="Capture voice reflection"
            onClick={() =>
              props.onReflect({
                t: captureTime,
                source: "voice",
                autoListen: true,
              })
            }
          >
            ●
          </button>
          <button
            className={cx("widgetexpand")}
            aria-label={widget ? "Collapse widget" : "Expand widget"}
            onClick={() => setWidget((v) => !v)}
          >
            ⌃
          </button>
        </div>
      </aside>
    </div>
  );
}
