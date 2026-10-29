"use client";
import { useMemo, useState } from "react";
import type { Props } from "../concept/shared";
import { useProcess } from "./use-process";
import JournalContext from "./journal-context";
import {
  createRecord,
  dateInZone,
  latest,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import {
  defaultLayout,
  preparation,
  processScore,
  sessionsForDay,
} from "@/lib/process/engine";
import { validBaseline } from "@/lib/pattern-engine/physiology";
import { isActualExecution } from "@/lib/trade-context";
import PreMarket, { PreparationPanel } from "../pre-market/workspace";
import TradingThesis, {
  relevantTheses,
  ThesisPanel,
} from "../trading-thesis/workspace";
import Variables from "../variable-builder/workspace";
import Temperature from "../variable-builder/temperature";
import TradeQuality, { Violations } from "../trade-quality/workspace";
import Missions, { MissionsPanel } from "../process-goals/workspace";
import Audits from "../audits/workspace";
import PatternExplorer from "./pattern-explorer";
import {
  Badge,
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
      title="Process performance"
      detail="Adherence and evidence coverage, separate from trading results"
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
        ? p.samples
        : [],
    last = points.at(-1),
    fresh = !!last && p.recording && p.now - last.t <= 10000 && p.now >= last.t,
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
    recent = points.filter((s) => last && s.t >= last.t - 120000),
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
function LayoutEditor({
  context,
  draft,
  setDraft,
  selected,
  select,
  presets,
  fallback,
}: {
  context: Context;
  draft: BodyOf<"layout">;
  setDraft: (body: BodyOf<"layout">) => void;
  selected?: RecordOf<"layout">;
  select: (r: RecordOf<"layout">) => void;
  presets: RecordOf<"layout">[];
  fallback: RecordOf<"layout">;
}) {
  const { store } = context;
  const move = (from: number, to: number) => {
    const copy = [...draft.panels];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    setDraft({ ...draft, panels: copy });
  };
  return (
    <details className="cc-layout-editor">
      <summary>Customize workspace</summary>
      <div className="cc-grid">
        <Field label="Workspace preset">
          <select
            value={selected?.rootId ?? "original"}
            onChange={(e) =>
              select(
                presets.find((p) => p.rootId === e.target.value) ?? fallback,
              )
            }
          >
            <option value="original">Original layout</option>
            {presets.map((p) => (
              <option key={p.id} value={p.rootId}>
                {p.body.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preset name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
          />
        </Field>
      </div>
      <div className="cc-actions">
        <label>
          <input
            type="checkbox"
            checked={draft.showMarket}
            onChange={(e) =>
              setDraft({ ...draft, showMarket: e.target.checked })
            }
          />{" "}
          Show market context
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(e) =>
              setDraft({ ...draft, isDefault: e.target.checked })
            }
          />{" "}
          Use as default
        </label>
      </div>
      {draft.panels.map((p, i) => (
        <div
          className="cc-layout-row"
          key={p.id}
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (
              Number.isInteger(from) &&
              from >= 0 &&
              from < draft.panels.length
            )
              move(from, i);
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={p.visible}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  panels: draft.panels.map((v, n) =>
                    n === i ? { ...v, visible: e.target.checked } : v,
                  ),
                })
              }
            />{" "}
            {p.id}
          </label>
          <Field label={p.id + " width"}>
            <select
              value={p.width}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  panels: draft.panels.map((v, n) =>
                    n === i
                      ? { ...v, width: e.target.value as "normal" | "wide" }
                      : v,
                  ),
                })
              }
            >
              <option value="normal">Single column</option>
              <option value="wide">Full width</option>
            </select>
          </Field>
          <button disabled={!i} onClick={() => move(i, i - 1)}>
            Move up
          </button>
          <button
            disabled={i === draft.panels.length - 1}
            onClick={() => move(i, i + 1)}
          >
            Move down
          </button>
        </div>
      ))}
      <fieldset>
        <legend>Status widgets</legend>
        <div className="cc-actions">
          {(
            [
              "session",
              "preparation",
              "readiness",
              "thesis",
              "review",
              "goal",
            ] as const
          ).map((id) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={draft.statusWidgets.includes(id)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    statusWidgets: e.target.checked
                      ? [...draft.statusWidgets, id]
                      : draft.statusWidgets.filter((v) => v !== id),
                  })
                }
              />{" "}
              {id}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="cc-actions">
        <button
          disabled={store.busy}
          onClick={async () => {
            const r = createRecord("layout", draft, selected);
            if (await store.save([r])) select(r);
          }}
        >
          Save layout
        </button>
        <button
          disabled={store.busy}
          onClick={async () => {
            const r = createRecord("layout", {
              ...draft,
              name: draft.name + " copy",
            });
            if (await store.save([r])) select(r);
          }}
        >
          Save as new preset
        </button>
        <button onClick={() => select(fallback)}>Reset to original</button>
      </div>
    </details>
  );
}
function DailyDashboard(context: Context) {
  const { day, store, props } = context,
    fallback = useMemo(defaultLayout, []),
    presets = latest(store.records, "layout"),
    defaultPreset = [...presets]
      .filter((l) => l.body.isDefault)
      .sort((a, b) => b.createdAt - a.createdAt)[0],
    [selectedId, setSelectedId] = useState<string | undefined>(),
    [custom, setCustom] = useState<BodyOf<"layout">>();
  const selected =
      selectedId === "original"
        ? undefined
        : (presets.find((p) => p.rootId === selectedId) ?? defaultPreset),
    layout = custom ?? selected?.body ?? fallback.body;
  const select = (r: RecordOf<"layout">) => {
    setSelectedId(r.id === fallback.id ? "original" : r.rootId);
    setCustom(r.body);
  };
  const prep = preparation(store.records, day.rootId),
    thesis = relevantTheses(store.records, day),
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
      prep.total
        ? `${prep.complete}/${prep.total} required · ${prep.unknown} unverified`
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
    thesis: [
      "Active trading thesis",
      thesis.filter((t) => t.body.scope !== "weekly").at(-1)?.body.bias ??
        "No daily thesis",
    ],
    review: [
      "Journal & review",
      `${sessions.length} sessions · ${audits.length ? "Review recorded" : "Review pending"}`,
    ],
    goal: ["Daily process goal", day.body.goal || "No goal selected"],
  };
  const panels = {
    preparation: <PreparationPanel {...context} compact />,
    thesis: <ThesisPanel {...context} />,
    temperature: <Temperature {...context} />,
    missions: <MissionsPanel {...context} />,
    physiology: <PhysiologyPanel {...context} />,
    process: <ProcessPanel {...context} />,
  };
  return (
    <>
      <div className="cc-greeting">
        <div>
          <span className="cc-eyebrow">Your trading process, in context</span>
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
          onClick={() => props.onPage("Live Session")}
        >
          Open live session
        </button>
      </div>
      {layout.showMarket && (
        <Panel
          title="Market context"
          detail="User-entered outlook · no market predictions"
        >
          <div className="cc-grid">
            {thesis.map((t) => (
              <div key={t.id}>
                <small>
                  {t.body.scope} · {t.body.instrument}
                </small>
                <h3>{t.body.bias}</h3>
                <p>{t.body.primary || "No scenario recorded"}</p>
              </div>
            ))}
            {!thesis.length && <Empty>No market thesis saved.</Empty>}
          </div>
          <div className="cc-actions">
            {day.body.timeframes.map((timeframe) => {
              const daily = thesis
                .filter(
                  (t) =>
                    t.body.scope !== "weekly" &&
                    t.body.instrument === day.body.instrument,
                )
                .sort((a, b) => b.createdAt - a.createdAt)[0];
              return (
                <Badge key={timeframe}>
                  {timeframe} ·{" "}
                  {daily?.body.timeframes.find((f) => f.timeframe === timeframe)
                    ?.bias ?? "unrecorded"}
                </Badge>
              );
            })}
          </div>
        </Panel>
      )}
      <div className="cc-status-grid">
        {layout.statusWidgets.map((id) => (
          <div key={id}>
            <small>{status[id][0]}</small>
            <strong>{status[id][1]}</strong>
          </div>
        ))}
      </div>
      <LayoutEditor
        context={context}
        draft={layout}
        setDraft={setCustom}
        selected={selected}
        select={select}
        presets={presets}
        fallback={fallback}
      />
      <div className="cc-dashboard-grid">
        {layout.panels
          .filter((p) => p.visible)
          .map((p) => (
            <div key={p.id} className={p.width === "wide" ? "cc-span-all" : ""}>
              {panels[p.id]}
            </div>
          ))}
      </div>
    </>
  );
}
export default function ProcessWorkspace(props: Props) {
  const store = useProcess(props.pulse.owner, props.history),
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [date, setDate] = useState(() => dateInZone(Date.now(), zone)),
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
  if (!processPages.has(props.page)) return null;
  if (!store.loaded)
    return (
      <div className="cc-workspace">
        <p role="status">Loading your process records…</p>
        {store.error && <p role="alert">{store.error}</p>}
      </div>
    );
  const context = day ? { store, day, props } : undefined;
  if (props.page === "Journal" || props.page === "Live Session")
    return (
      <div className="cc-workspace cc-context-strip">
        {context ? (
          <JournalContext key={props.session.id} {...context} />
        ) : (
          <details className="cc-journal-context">
            <summary>Trading process context · no linked trading day</summary>
            <p>
              Preparation, thesis and personal variables can be linked without
              changing this journal.
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
    );

  return (
    <div className="cc-workspace">
      <div className="cc-daybar">
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
        <span role="status">{store.syncState}</span>
        <button onClick={() => void store.refresh()}>Refresh sync</button>
        {day && (
          <button onClick={() => setEditDay((v) => !v)}>
            Edit trading-day context
          </button>
        )}
      </div>
      {store.error && (
        <div className="cc-error" role="alert">
          <p>{store.error}</p>
          <button onClick={() => store.setError("")}>Dismiss</button>
        </div>
      )}
      {(!day || editDay) && (
        <Panel
          title={day ? "Trading-day context" : "Open a trading day"}
          detail="One day can link multiple recording sessions, accounts, and instruments. Journaling and wearable recording remain independent."
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
          <p className="cc-saved">
            Last saved day state: {new Date(day!.createdAt).toLocaleString()} ·{" "}
            {day!.body.status} · {sessionsForDay(props.history, day!).length}{" "}
            recording sessions
          </p>
          {props.page === "Command Center" && (
            <DailyDashboard key={day!.rootId} {...context} />
          )}
          {props.page === "Pre-Market" && (
            <PreMarket key={day!.rootId} {...context} />
          )}
          {props.page === "Trading Thesis" && (
            <TradingThesis key={day!.rootId} {...context} />
          )}
          {props.page === "Trade Quality" && (
            <TradeQuality key={day!.rootId} {...context} />
          )}
          {props.page === "Rule Violations" && <Violations {...context} />}
          {props.page === "Settings & Variables" && (
            <Variables key={day!.rootId} {...context} />
          )}
          {props.page === "Missions" && <Missions {...context} />}
          {props.page === "Audits" && <Audits key={day!.rootId} {...context} />}
          {props.page === "Patterns" && <PatternExplorer {...context} />}
        </>
      )}
    </div>
  );
}
