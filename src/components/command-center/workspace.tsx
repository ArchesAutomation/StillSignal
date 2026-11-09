"use client";
import { GlassPanel } from "../glassyui/glass-panel";
import DashboardPnl from "./dashboard-pnl";
import WorkflowNavigation from "./workflow-navigation";
import { useSavedGuide } from "../use-saved-guide";
import { dateSchema } from "@/lib/process/model";
import { useEffect, useState, type ReactNode } from "react";
import PostExitInvitation from "../post-exit-invitation";
import { WorkspaceModule, ModuleScope } from "../module-workspace";
import type { Props } from "../concept/shared";
import { useProcess } from "./use-process";
import JournalContext from "./journal-context";
import DashboardBoard, {
  useDashboardEditor,
  type DashboardEditor,
} from "./dashboard-board";
import VariablesPanel from "./variables-panel";
import {
  createRecord,
  dateInZone,
  type BodyOf,
  latest,
  type RecordOf,
} from "@/lib/process/model";
import {
  preparation,
  processScore,
  sessionsForDay,
} from "@/lib/process/engine";
import {
  analyticalSamples,
  validBaseline,
} from "@/lib/pattern-engine/physiology";
import { isActualExecution } from "@/lib/trade-context";
import SessionReviewGuide from "../session-review-guide";
import PreparationSummary from "../pre-market/preparation-summary";
import PreMarket, { PreparationPanel } from "../pre-market/workspace";
import ArchivedTools from "./archived-tools";
import Variables from "../variable-builder/workspace";
import Temperature from "../variable-builder/temperature";
import TradeQuality, { Violations } from "../trade-quality/workspace";
import Audits from "../audits/workspace";
import PatternExplorer from "./pattern-explorer";
import {
  Empty,
  Field,
  History,
  Input,
  Panel,
  Save,
  string,
  type Context,
} from "./shared";
const processPages = new Set([
  "Command Center",
  "Pre-Market",
  "Trading Thesis",
  "Trade Quality",
  "Rule Violations",
  "Audits",
  "Missions",
  "Settings & Variables",
  "Patterns",
  "Journal",
  "Live Session",
]);
function ProcessPanel({ store, day, props }: Context) {
  const prep = preparation(store.records, day.rootId),
    assessments = latest(store.records, "assessment").filter(
      (a) => a.body.dayId === day.rootId,
    );
  let known = 0,
    unknown = 0,
    broken = 0,
    numerator = 0,
    scored = 0;
  for (const a of assessments) {
    const book = store.records.find(
      (r): r is RecordOf<"playbook"> =>
        r.kind === "playbook" && r.id === a.body.playbookId,
    );
    if (!book) continue;
    const score = processScore(
      latest(store.records, "evaluation").filter(
        (e) => e.body.assessmentId === a.id,
      ),
      book.body.rules,
    );
    known += score.known;
    unknown += score.unknown;
    broken += score.broken;
    if (score.score !== null) {
      numerator += score.score;
      scored++;
    }
  }
  const executions = sessionsForDay(props.history, day).flatMap((s) =>
      s.events.filter(isActualExecution),
    ),
    reviewed = new Set(assessments.map((a) => a.body.tradeId).filter(Boolean)),
    unreviewed = executions.filter((e) => !reviewed.has(e.id)).length;
  return (
    <Panel
      title="Trade quality"
      detail="Your rules. Your execution. Review the process."
      action={
        <button onClick={() => props.onPage("Trade Quality")}>Review</button>
      }
    >
      <div className="cc-readiness">
        <div>
          <small>Preparation</small>
          <strong>
            {prep.percent === null
              ? "Not recorded"
              : Math.round(prep.percent) + "%"}
          </strong>
        </div>
        <div>
          <small>Mean reviewed process score</small>
          <strong>
            {scored ? Math.round(numerator / scored) + "%" : "Unreviewed"}
          </strong>
        </div>
        <div>
          <small>Confirmed rule reviews</small>
          <strong>{known}</strong>
        </div>
        <div>
          <small>Unknown rules</small>
          <strong>{unknown}</strong>
        </div>
        <div>
          <small>Recorded violations</small>
          <strong>{broken}</strong>
        </div>
        <div>
          <small>Executions without a review</small>
          <strong>{unreviewed}</strong>
        </div>
      </div>
      <p className="cc-muted">
        A profitable trade can break your process. A losing trade can follow it.
        A planned no-trade day can be successful.
      </p>
    </Panel>
  );
}
function PhysiologyPanel({ props, day }: Context) {
  const p = props.pulse,
    points =
      !props.session.demo && sessionsForDay([props.session], day).length
        ? analyticalSamples(props.session, p.samples)
        : [],
    last = points.at(-1),
    fresh =
      !!last &&
      last.quality !== "artifact" &&
      p.recording &&
      p.now - last.t <= 10000 &&
      p.now >= last.t,
    baseline = last
      ? validBaseline(points, p.now, p.settings.baselineSeconds)
      : null;
  const latestExecution = (
      points.length ||
      (!props.session.demo && sessionsForDay([props.session], day).length)
        ? props.session.events
        : []
    )
      .filter(isActualExecution)
      .sort((a, b) => b.t - a.t)[0],
    recent = points.filter(
      (s) => last && s.quality !== "artifact" && s.t >= last.t - 120000,
    ),
    minimum = recent.length ? Math.min(...recent.map((s) => s.bpm)) - 5 : 0,
    maximum = recent.length ? Math.max(...recent.map((s) => s.bpm)) + 5 : 1;
  return (
    <Panel
      title="Live physiological context"
      detail={
        p.recording
          ? fresh
            ? "WHOOP recording · fresh sample"
            : "Recording · HR data stale or unavailable"
          : "Wearable optional · no live HR recording"
      }
      action={
        <button onClick={() => props.onPage("Live Session")}>
          Open timeline
        </button>
      }
    >
      <div className="cc-hr">
        <strong>
          {fresh ? last!.bpm : "—"}
          <small>BPM</small>
        </strong>
        <div>
          <span>
            {fresh && baseline !== null
              ? `${last!.bpm - baseline >= 0 ? "+" : ""}${(last!.bpm - baseline).toFixed(1)} vs baseline`
              : "No valid live baseline comparison"}
          </span>
          <small>
            {last
              ? `Last recorded sample ${new Date(last.t).toLocaleTimeString()}`
              : "No samples recorded"}
          </small>
        </div>
      </div>
      {recent.length > 1 && (
        <svg
          role="img"
          aria-label="Recent recorded heart rate"
          viewBox="0 0 500 90"
          className="cc-sparkline"
        >
          <polyline
            fill="none"
            stroke="#ed9a68"
            strokeWidth="2"
            points={recent
              .map(
                (s) =>
                  `${((s.t - recent[0].t) / (last!.t - recent[0].t || 1)) * 500},${80 - ((s.bpm - minimum) / (maximum - minimum)) * 70}`,
              )
              .join(" ")}
          />
        </svg>
      )}
      <p>
        {latestExecution
          ? `Latest execution: ${latestExecution.symbol} · ${latestExecution.kind} · ${new Date(latestExecution.t).toLocaleTimeString()}`
          : "No recorded executions in this session."}
      </p>
      <div className="cc-actions">
        <button
          onClick={() =>
            props.onReflect({
              t: p.active
                ? p.now
                : props.session.endedAt || props.session.startedAt,
              source: "voice",
              autoListen: true,
            })
          }
        >
          Capture a voice reflection
        </button>
        <button onClick={() => props.onPage("Settings & Variables")}>
          Quick check-in
        </button>
      </div>
    </Panel>
  );
}
function DailyDashboard(
  context: Context & { editor: DashboardEditor; before?: ReactNode },
) {
  const { day, store, props } = context;
  const prep = preparation(store.records, day.rootId),
    checkin = latest(store.records, "checkin")
      .filter((c) => c.body.dayId === day.rootId)
      .sort((a, b) => b.createdAt - a.createdAt)[0],
    audits = latest(store.records, "audit").filter(
      (a) => a.body.start <= day.body.date && a.body.end >= day.body.date,
    ),
    sessions = sessionsForDay(props.history, day),
    active =
      props.pulse.active && sessions.some((s) => s.id === props.session.id);
  const status = {
    session: [
      "Session & instrument",
      `${active ? "Active" : day.body.status.replaceAll("-", " ")} · ${day.body.instrument || "Choose instrument"}`,
    ],
    preparation: [
      "Preparation",
      prep.runs.length
        ? `${prep.resolved}/${prep.sections} sections resolved · ${prep.omissions} with omissions`
        : "No preparation run",
    ],
    readiness: [
      "Self-reported readiness",
      checkin
        ? checkin.body.answers
            .slice(0, 2)
            .map(
              (a) =>
                `${a.question} ${a.value ?? "missing"}${a.value === null ? "" : "/10"}`,
            )
            .join(" · ")
        : "No check-in recorded",
    ],
    review: [
      "Journal & review",
      `${sessions.length} sessions · ${audits.length ? "Review recorded" : "Review pending"}`,
    ],
    goal: ["Daily process goal", day.body.goal || "No goal selected"],
  };
  const panels = {
    preparation: null,
    pnl: (
      <DashboardPnl
        props={props}
        date={day.body.date}
        zone={day.body.timezone}
      />
    ),
    thesis: null,
    temperature: <Temperature {...context} />,
    missions: null,
    physiology: <PhysiologyPanel {...context} />,
    process: <ProcessPanel {...context} />,
    variables: <VariablesPanel {...context} />,
  };
  return (
    <DashboardBoard
      before={
        <>
          {" "}
          {context.before}
          <WorkspaceModule
            id="dashboard-greeting"
            title="Command Center introduction"
            section="top"
            order={1}
          >
            <ModuleScope active={false}>
              <GlassPanel preset="standard" className="cc-greeting">
                <div>
                  <span className="cc-eyebrow">
                    A little space for your trading day
                  </span>
                  <h1>
                    {props.pulse.email
                      ? `Welcome, ${props.pulse.email.split("@")[0]}`
                      : "Your Command Center"}
                  </h1>
                  <p>
                    {day.body.date} · {day.body.timezone} ·{" "}
                    {props.pulse.recording
                      ? "Wearable recording"
                      : "No live HR recording"}
                  </p>
                </div>
                <button
                  className="cc-primary"
                  onClick={() => props.onPage("Pre-Market")}
                >
                  Start / resume preparation
                </button>
                <button onClick={() => props.onPage("Trade Quality")}>
                  Finish session / review today
                </button>
              </GlassPanel>
            </ModuleScope>
          </WorkspaceModule>
          <WorkspaceModule
            id="workflow-navigation"
            title="Workflow navigation"
            section="top"
            order={2}
          >
            {" "}
            <WorkflowNavigation owner={props.pulse.owner} open={props.onPage} />
          </WorkspaceModule>
          <WorkspaceModule
            id="preparation-summary"
            title="Preparation summary"
            section="top"
            order={3}
          >
            <ModuleScope active={false}>
              <PreparationSummary {...context} />
            </ModuleScope>
          </WorkspaceModule>
        </>
      }
      editor={context.editor}
      store={store}
      owner={props.pulse.owner}
      panels={panels}
      variables={latest(store.records, "variable").filter(
        (v) => !v.body.archived,
      )}
      renderVariables={(ids) => (
        <VariablesPanel {...context} variableIds={ids} />
      )}
      status={
        Object.fromEntries(
          Object.entries(status).map(([id, value]) => [
            id,
            <>
              <small>{value[0]}</small>
              <strong>{value[1]}</strong>
            </>,
          ]),
        ) as Parameters<typeof DashboardBoard>[0]["status"]
      }
      market={null}
    />
  );
}
function StartDashboard({
  before,
  editor,
  store,
  props,
  date,
  zone,
  onSettings,
}: {
  before?: ReactNode;
  editor: DashboardEditor;
  store: Context["store"];
  props: Props;
  date: string;
  zone: string;
  onSettings: () => void;
}) {
  const open = async (page: Parameters<Props["onPage"]>[0]) => {
    if (page === "Trading Thesis" || page === "Missions") {
      props.onPage(page);
      return;
    }
    const record = createRecord("day", {
      date,
      timezone: zone,
      status: "preparing",
      instrument: "",
      account: "",
      timeframes: ["15M", "1H", "4H", "Daily"],
      sessionIds: [],
      goal: "",
    });
    if (await store.save([record])) props.onPage(page);
  };
  const entries = [
    [
      "preparation",
      "Pre-Market",
      "Pre-market non-negotiables",
      "Start with your routine",
      "Your checklist, ready to work through before the session.",
      "Prepare",
    ],
    [
      "process",
      "Trade Quality",
      "Trade quality",
      "Define a good trade",
      "Review setups against your own playbook and rules.",
      "Open trade quality",
    ],
    [
      "temperature",
      "Command Center",
      "Temperature check",
      "How are you arriving today?",
      "Record focus, energy and stress in your own words.",
      "Start today",
    ],
    [
      "physiology",
      "Live Session",
      "Live physiological context",
      "Your body, in context",
      "Connect your wearable when you want to record heart rate alongside trades.",
      "Open live session",
    ],
    [
      "variables",
      "Settings & Variables",
      "Personal variables",
      "Measure what matters to you",
      "Choose your own conditions and measurements.",
      "Record variables",
    ],
  ] as const;
  const starterPanels = Object.fromEntries(
    entries.map(([id, page, title, headline, description, label]) => [
      id,
      <Panel key={id} title={title}>
        <h3>{headline}</h3>
        <p className="cc-muted">{description}</p>
        <button disabled={store.busy} onClick={() => void open(page)}>
          {label}
        </button>
      </Panel>,
    ]),
  ) as Omit<
    Parameters<typeof DashboardBoard>[0]["panels"],
    "pnl" | "preparation"
  >;
  const panels = {
    ...starterPanels,
    preparation: null,
    pnl: <DashboardPnl props={props} date={date} zone={zone} />,
  };
  return (
    <DashboardBoard
      before={
        <>
          {" "}
          {before}
          <WorkspaceModule
            id="dashboard-greeting"
            title="Command Center introduction"
            section="top"
            order={1}
          >
            <ModuleScope active={false}>
              <GlassPanel preset="standard" className="cc-greeting">
                <div>
                  <span className="cc-eyebrow">Prepare. Execute. Reflect.</span>
                  <h1>Your Command Center</h1>
                  <p>Check in, record what matters, and return to your own perspective.</p>
                </div>
                <div className="cc-actions">
                  <button
                    className="cc-primary"
                    disabled={store.busy}
                    onClick={() => void open("Pre-Market")}
                  >
                    Start today's preparation
                  </button>
                  <button onClick={onSettings}>Day settings</button>
                </div>
              </GlassPanel>
            </ModuleScope>
          </WorkspaceModule>
          <WorkspaceModule
            id="workflow-navigation"
            title="Workflow navigation"
            section="top"
            order={2}
          >
            {" "}
            <WorkflowNavigation
              owner={props.pulse.owner}
              open={(page) => void open(page)}
            />
          </WorkspaceModule>
        </>
      }
      editor={editor}
      store={store}
      owner={props.pulse.owner}
      panels={panels}
      variables={latest(store.records, "variable").filter(
        (v) => !v.body.archived,
      )}
      market={null}
      status={{
        session: (
          <>
            <small>Session & instrument</small>
            <strong>No trading day opened</strong>
          </>
        ),
        preparation: (
          <>
            <small>Preparation</small>
            <strong>Not started</strong>
          </>
        ),
        readiness: (
          <>
            <small>Readiness</small>
            <strong>No check-in recorded</strong>
          </>
        ),
        review: (
          <>
            <small>Journal & review</small>
            <strong>No review recorded</strong>
          </>
        ),
        goal: (
          <>
            <small>Daily goal</small>
            <strong>No goal selected</strong>
          </>
        ),
      }}
    />
  );
}
export default function ProcessWorkspace(props: Props) {
  const dashboardEditor = useDashboardEditor();
  const dateDraft = useSavedGuide(
    `ss-trading-date:${props.pulse.owner}`,
    () =>
      dateInZone(
        Date.now(),
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ),
    (value) => dateSchema.parse(value),
  );
  const date = dateDraft.value,
    setDate = dateDraft.update;
  const store = useProcess(props.pulse.owner, props.history),
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [editDay, setEditDay] = useState(false),
    days = latest(store.records, "day"),
    selectedDate =
      props.page === "Journal" || props.page === "Live Session"
        ? dateInZone(props.session.startedAt, zone)
        : date,
    day =
      days.find(
        (d) => d.body.date === selectedDate && d.body.timezone === zone,
      ) ?? days.find((d) => d.body.date === selectedDate);
  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<string>).detail;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) return;
      setDate(requested);
      if (!days.some((d) => d.body.date === requested))
        void store.save([
          createRecord("day", {
            date: requested,
            timezone: zone,
            status: "reviewing",
            instrument: "",
            account: "",
            timeframes: [],
            sessionIds: [],
            goal: "",
          }),
        ]);
    };
    window.addEventListener("ss-review-day", open);
    return () => window.removeEventListener("ss-review-day", open);
  }, [store.records, zone]);
  if (!processPages.has(props.page)) return null;
  if (!store.loaded || !dateDraft.loaded)
    return (
      <div className="cc-workspace">
        <p role="status">Loading your process records…</p>
        {store.error && <p role="alert">{store.error}</p>}
      </div>
    );
  const context = day ? { store, day, props } : undefined;
  if (props.page === "Trading Thesis" || props.page === "Missions") return <ArchivedTools store={store} onBack={() => props.onPage("Command Center")} />;
  if (props.page === "Journal" || props.page === "Live Session")
    return (
      <>
        <WorkspaceModule
          id="process-context"
          title="Trading day context"
          section="side"
          order={3}
        >
          <div className="cc-workspace cc-context-strip">
            {context ? (
              <JournalContext key={props.session.id} {...context} />
            ) : (
              <details className="cc-journal-context">
                <summary>
                  Trading process context · no linked trading day
                </summary>
                <p>
                  Preparation and personal variables can be linked
                  without changing this journal.
                </p>
                <button
                  onClick={() => {
                    setDate(selectedDate);
                    props.onPage("Command Center");
                  }}
                >
                  Open this day in Command Center
                </button>
              </details>
            )}
          </div>
        </WorkspaceModule>
        {(
          [
            ["preparation", "Pre-market non-negotiables", PreparationPanel],
            ["variables", "Personal variables", VariablesPanel],
            ["quality", "Trade quality", ProcessPanel],
          ] as const
        ).map(([id, title, Component]) => (
          <WorkspaceModule
            key={id}
            id={"linked-" + id}
            title={title}
            initiallyHidden
            section="side"
          >
            <ModuleScope active={false}>
              {context ? (
                <Component {...context} />
              ) : (
                <section className="cc-panel">
                  <h2>{title}</h2>
                  <p>
                    Link this journal date to a trading day to show the same
                    records used in Command Center.
                  </p>
                  <button
                    onClick={() => {
                      setDate(selectedDate);
                      props.onPage("Command Center");
                    }}
                  >
                    Open Command Center
                  </button>
                </section>
              )}
            </ModuleScope>
          </WorkspaceModule>
        ))}
      </>
    );

  const daybar = (
    <GlassPanel preset="standard" className="cc-daybar">
      {props.page !== "Command Center" && (
        <button onClick={() => props.onPage("Command Center")}>
          ← Command Center
        </button>
      )}
      <Field label="Trading date">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setEditDay(false);
          }}
        />
      </Field>
      <button onClick={() => setDate(dateInZone(Date.now(), zone))}>
        Today
      </button>
      <span role="status">{store.syncState}</span>
      {store.syncState.includes("awaiting") ||
      store.syncState.includes("Saved locally ·") ? (
        <button onClick={() => void store.refresh()}>Retry sync</button>
      ) : null}
      {store.error && (
        <button onClick={() => void store.refresh()}>Retry sync</button>
      )}
      {day && (
        <button onClick={() => setEditDay((v) => !v)}>
          Edit trading-day context
        </button>
      )}
    </GlassPanel>
  );
  const dashboardBefore = (
    <>
      <WorkspaceModule
        id="trading-date"
        title="Trading date"
        section="top"
        order={0}
      >
        {daybar}
      </WorkspaceModule>
      <WorkspaceModule
        id="post-exit-review"
        title="A moment to review"
        section="top"
        order={4}
      >
        <PostExitInvitation props={props} />
      </WorkspaceModule>
    </>
  );
  return (
    <div className="cc-workspace">
      {(props.page !== "Command Center" || editDay) && daybar}
      {store.error && (
        <div className="cc-error" role="alert">
          <p>{store.error}</p>
          <button onClick={() => store.setError("")}>Dismiss</button>
        </div>
      )}
      {!day && !editDay && props.page === "Pre-Market" && (
        <Panel
          title="Your pre-trading routine"
          detail="Set up your workflow once. Follow it each session."
        >
          <p>Open today's preparation to build or follow your saved routine.</p>
          <button
            className="cc-primary"
            disabled={store.busy}
            onClick={() =>
              void store.save([
                createRecord("day", {
                  date: selectedDate,
                  timezone: zone,
                  status: "preparing",
                  instrument: "",
                  account: "",
                  timeframes: [],
                  sessionIds: [],
                  goal: "",
                }),
              ])
            }
          >
            Open today's preparation →
          </button>
        </Panel>
      )}
      {!day && !editDay && props.page === "Command Center" && (
        <StartDashboard
          before={dashboardBefore}
          editor={dashboardEditor}
          store={store}
          props={props}
          date={date}
          zone={zone}
          onSettings={() => setEditDay(true)}
        />
      )}
      {editDay && (
        <Panel
          title={day ? "Trading-day context" : "Open a trading day"}
          detail="Instrument, account and session details"
          action={
            <button onClick={() => setEditDay(false)}>
              Close day settings
            </button>
          }
        >
          <form
            key={day?.id ?? date}
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body: BodyOf<"day"> = {
                date,
                timezone: string(f, "timezone"),
                status: string(f, "status") as BodyOf<"day">["status"],
                instrument: string(f, "instrument"),
                account: string(f, "account"),
                timeframes: string(f, "timeframes")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                sessionIds: f.getAll("sessionId").map(String),
                goal: string(f, "goal"),
              };
              if (await store.save([createRecord("day", body, day)]))
                setEditDay(false);
            }}
          >
            <div className="cc-grid">
              <Input
                label="Trading timezone (IANA name)"
                name="timezone"
                value={day?.body.timezone ?? zone}
                required
              />
              <Input
                name="instrument"
                label="Selected instrument"
                value={day?.body.instrument}
              />
              <Input
                name="account"
                label="Selected trading account"
                value={day?.body.account}
              />
              <Field label="Day status">
                <select
                  name="status"
                  defaultValue={day?.body.status ?? "preparing"}
                >
                  {[
                    "preparing",
                    "active",
                    "reviewing",
                    "complete",
                    "no-trade",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Input
                name="timeframes"
                label="Timeframes (comma separated)"
                value={day?.body.timeframes.join(", ") ?? "15M, 1H, 4H, Daily"}
              />
              <Input
                name="goal"
                label="Daily process goal"
                value={day?.body.goal}
              />
            </div>
            <Field label="Linked sessions (optional; multiple allowed)">
              <select
                multiple
                name="sessionId"
                defaultValue={day?.body.sessionIds ?? []}
              >
                {props.history
                  .filter((s) => !s.demo)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {new Date(s.startedAt).toLocaleDateString()}
                    </option>
                  ))}
              </select>
            </Field>
            <Save store={store}>
              {day ? "Save day revision" : "Open trading day"}
            </Save>
            {day && <History records={store.records} rootId={day.rootId} />}
          </form>
        </Panel>
      )}
      {context && (
        <>
          {editDay && (
            <p className="cc-saved">
              Last saved day state: {new Date(day!.createdAt).toLocaleString()}{" "}
              · {day!.body.status} ·{" "}
              {sessionsForDay(props.history, day!).length} recording sessions
            </p>
          )}
          {props.page === "Command Center" && (
            <DailyDashboard
              before={dashboardBefore}
              key={day!.rootId}
              {...context}
              editor={dashboardEditor}
            />
          )}
          {props.page === "Pre-Market" && (
            <PreMarket key={day!.rootId} {...context} />
          )}
          {props.page === "Trade Quality" && (
            <>
              <SessionReviewGuide key={"review-" + day!.rootId} {...context} />
              <TradeQuality key={day!.rootId} {...context} />
            </>
          )}
          {props.page === "Rule Violations" && <Violations {...context} />}
          {props.page === "Settings & Variables" && (
            <Variables key={day!.rootId} {...context} />
          )}
          {props.page === "Audits" && <Audits key={day!.rootId} {...context} />}
          {props.page === "Patterns" && <PatternExplorer {...context} />}
        </>
      )}
    </div>
  );
}
