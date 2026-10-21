"use client";
import { useEffect, useRef, useState } from "react";
import { pullSessions } from "@/lib/cloud";
import { liveNotes, reconstructTrades } from "@/lib/smart-journal";
import { summary } from "@/lib/analytics";
import { cx, time, type Page, type Props } from "./shared";
import { Calendar, weekStart } from "./calendar";
import Journal from "./journal";
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
    [widget, setWidget] = useState(false);
  const welcomeRef = useRef<HTMLDialogElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (welcome) welcomeRef.current?.showModal();
  }, [welcome]);
  useEffect(() => () => clearTimeout(timer.current), []);
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
          <Journal
            {...viewProps}
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
                  Sessions hold wearable samples and executions. Open a
                  recording to see its heart rate, trades and reflections.
                </p>
              </div>
            </section>
            <div className={cx("analysisexplainer")}>
              <strong>Your recordings, in context.</strong>
              <p>
                Trade CSV timestamps connect entries and exits to the matching
                session. Open a journal to inspect the timeline.
              </p>
            </div>
            <div className={cx("sectiontitle")}>
              <div>
                <h2>Recent recordings</h2>
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
            <div className={cx("sessionlist")}>
              {history.map((item) => (
                <div className={cx("sessionrow")} key={item.id}>
                  <time>
                    {new Date(item.startedAt)
                      .toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })
                      .toUpperCase()}
                    <br />
                    {time(item.startedAt, false)}–
                    {item.endedAt ? time(item.endedAt, false) : "Active"}
                  </time>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.sampleCount.toLocaleString()} HR samples ·{" "}
                      {Array.from(
                        new Set(item.events.map((e) => e.symbol)),
                      ).join(", ") || "no trades"}{" "}
                      ·{" "}
                      {
                        reconstructTrades(item.events).filter((t) => t.exit)
                          .length
                      }{" "}
                      reconstructed trades
                    </p>
                  </div>
                  <span className={cx("sessionstat")}>
                    {liveNotes(item.journal).length} reflections
                  </span>
                  <span
                    className={cx(item.endedAt ? "attached" : "unattached")}
                  >
                    ● {item.endedAt ? "Completed" : "Active / interrupted"}
                  </span>
                  <div className={cx("sessionactions")}>
                    <button
                      className={cx("ghost")}
                      disabled={p.active && item.id !== s.id}
                      onClick={() =>
                        void act(async () => {
                          await p.openSession(item);
                          go("Journal");
                        })
                      }
                    >
                      Open journal
                    </button>
                    <button
                      className={cx("iconbtn")}
                      aria-label={`Manage ${item.name}`}
                      disabled={p.active && item.id !== s.id}
                      onClick={() =>
                        void act(async () => {
                          if (item.id !== s.id) await p.openSession(item);
                          go("Settings");
                        })
                      }
                    >
                      •••
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!history.length && (
              <p className={cx("empty-note")}>
                Start a session or import your trades to begin.
              </p>
            )}
          </>
        )}
        <div hidden={page !== "Stillness"}>
          <Stillness
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
        className={cx(
          "livewidget",
          delta !== null && delta >= props.threshold && "elevated",
          widget && "expanded",
        )}
        aria-label="Still Signal live widget"
      >
        <div className={cx("widgetpanel")}>
          <div className={cx("widgetpanelhead")}>
            <div>
              <div className={cx("eyebrow")}>
                {p.active ? "Session live" : "Session tools"} · silent nudge
              </div>
              <h3>Capture this moment</h3>
              <p>Context is attached to the selected timestamp.</p>
            </div>
            <button
              className={cx("widgetexpand")}
              aria-label="Close widget"
              onClick={() => setWidget(false)}
            >
              ×
            </button>
          </div>
          <div className={cx("widgetsignal")}>
            <div>
              <span>{p.recording ? "CURRENT HR" : "LAST RECORDED HR"}</span>
              <strong>{latest?.bpm ?? "—"} BPM</strong>
            </div>
            <div>
              <span>BASELINE CHANGE</span>
              <strong style={{ color: "var(--orange)" }}>
                {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta}`}
              </strong>
            </div>
          </div>
          <div className={cx("widgetactions")}>
            <button
              className={cx("primary")}
              onClick={() =>
                props.onReflect({
                  t: captureTime,
                  source: "voice",
                  autoListen: true,
                })
              }
            >
              ● Speak
            </button>
            <button
              className={cx("ghost")}
              onClick={() => props.onReflect({ t: captureTime })}
            >
              ▣ Paste screenshot
            </button>
            <button className={cx("ghost")} onClick={props.onTrade}>
              Add trade
            </button>
            <button className={cx("ghost")} onClick={props.onCsv}>
              Import CSV
            </button>
            <button
              className={cx("ghost")}
              onClick={() => void act(p.active ? p.stop : p.start)}
            >
              {p.active ? "End session" : "Start session"}
            </button>
            <button className={cx("ghost")} onClick={props.onFloat}>
              Floating journal
            </button>
            <button className={cx("ghost")} onClick={() => go("Connections")}>
              Connections
            </button>
            <button className={cx("ghost")} onClick={() => go("Settings")}>
              Settings
            </button>
            <button className={cx("ghost")} onClick={props.onExport}>
              Export session
            </button>
            <button className={cx("ghost")} onClick={() => props.onAdvanced()}>
              Chart & replay
            </button>
          </div>
          <div className={cx("widgetprompt")}>
            <b>What are you noticing right now?</b>
            <br />
            Your words give the recorded signal its context.
          </div>
          <div className={cx("shortcut")}>
            ALT + {p.settings.shortcutKey.toUpperCase()} · VOICE NOTE
          </div>
        </div>
        <div className={cx("widgetpill")}>
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
