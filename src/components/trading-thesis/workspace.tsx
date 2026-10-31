"use client";
import { useState } from "react";
import VisualPlan from "./visual-plan";
import ChartPlan from "./chart-plan";
import {
  biasSchema,
  createRecord,
  latest,
  recordSchema,
  weekOf,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import {
  Area,
  Badge,
  Empty,
  Field,
  History,
  Input,
  Panel,
  Save,
  lines,
  string,
  type Context,
} from "../command-center/shared";
export function emptyThesis(
  day: RecordOf<"day">,
  scope: "daily" | "weekly",
): BodyOf<"thesis"> {
  return {
    scope,
    dayId: scope === "weekly" ? undefined : day.rootId,
    periodStart: scope === "weekly" ? weekOf(day.body.date) : day.body.date,
    instrument: day.body.instrument,
    bias: "neutral",
    timeframes: day.body.timeframes.map((timeframe) => ({
      timeframe,
      bias: "neutral",
    })),
    structure: "",
    events: "",
    levels: "",
    liquidity: "",
    primary: "",
    alternate: "",
    entries: "",
    invalidation: "",
    noTrade: "",
    targets: "",
    notes: "",
    screenshots: [],
    reason: "Initial plan",
  };
}
export function relevantTheses(
  records: Context["store"]["records"],
  day: RecordOf<"day">,
) {
  return latest(records, "thesis").filter(
    (t) =>
      t.body.dayId === day.rootId ||
      (t.body.scope === "weekly" &&
        t.body.periodStart === weekOf(day.body.date)),
  );
}
export function ThesisPanel({ store, day, props }: Context) {
  const theses = relevantTheses(store.records, day);
  return (
    <Panel
      title="Trading thesis"
      detail="Your recorded market view"
      action={
        <button onClick={() => props.onPage("Trading Thesis")}>
          Open plans
        </button>
      }
    >
      {!theses.length && (
        <Empty>No thesis recorded for this day or week.</Empty>
      )}
      {theses.map((t) => (
        <article className="cc-thesis" key={t.id}>
          <div className="cc-actions">
            <h3>
              {t.body.scope} · {t.body.instrument || "All instruments"}
            </h3>
            <Badge>{t.body.bias}</Badge>
          </div>
          <p>{t.body.primary || "No primary scenario recorded."}</p>
          {t.body.scenarios?.map((s) => (
            <details key={s.id}>
              <summary>
                {s.role} · {s.title}
              </summary>
              <p>
                If {s.condition || "condition not recorded"}, then{" "}
                {s.action || "action not recorded"}.
              </p>
              <p>Confirmation: {s.confirmation || "Not recorded"}</p>
              <p>Invalidation: {s.invalidation || "Not recorded"}</p>
            </details>
          ))}
          {t.body.invalidation && (
            <small>Invalidation: {t.body.invalidation}</small>
          )}
          <small>
            v{t.revision} · saved {new Date(t.createdAt).toLocaleString()}
          </small>
        </article>
      ))}
    </Panel>
  );
}
export default function ThesisWorkspace(context: Context) {
  const { day, store } = context,
    [editor, setEditor] = useState<{
      body: BodyOf<"thesis">;
      previous?: RecordOf<"thesis">;
    }>(),
    [versionKey, setVersionKey] = useState(0);
  const rows = relevantTheses(store.records, day),
    weekly = rows.filter((r) => r.body.scope === "weekly");
  const draftKey = (scope: string, previous?: RecordOf<"thesis">) =>
    `still-signal-thesis-draft-v1:${context.props.pulse.owner}:${day.rootId}:${previous?.id ?? scope}`;
  const open = (body: BodyOf<"thesis">, previous?: RecordOf<"thesis">) => {
    try {
      const saved = localStorage.getItem(draftKey(body.scope, previous));
      if (saved) {
        const parsed = recordSchema.safeParse(
          createRecord("thesis", JSON.parse(saved), previous),
        );
        if (parsed.success && parsed.data.kind === "thesis")
          body = parsed.data.body;
      }
    } catch {
      /* A malformed or unavailable draft never replaces a saved thesis. */
    }
    setEditor({ body, previous });
    setVersionKey((n) => n + 1);
  };
  return (
    <div className="cc-stack">
      <Panel
        title="Weekly & daily plans"
        detail="Revisions are timestamped. Trade analysis uses the version available at execution."
        action={
          <div className="cc-actions">
            <button onClick={() => open(emptyThesis(day, "weekly"))}>
              New weekly thesis
            </button>
            <button onClick={() => open(emptyThesis(day, "daily"))}>
              New daily thesis
            </button>
          </div>
        }
      >
        {!rows.length && (
          <Empty>
            Write your first plan or derive a daily plan from your weekly
            thesis.
          </Empty>
        )}
        {rows.map((t) => (
          <article key={t.id} className="cc-thesis">
            <div className="cc-actions">
              <h3>
                {t.body.scope} · {t.body.periodStart} ·{" "}
                {t.body.instrument || "All instruments"}
              </h3>
              <Badge>{t.body.bias}</Badge>
              <span>v{t.revision}</span>
            </div>
            <p>{t.body.primary}</p>
            <dl className="cc-definition">
              <dt>Alternative</dt>
              <dd>{t.body.alternate || "Not recorded"}</dd>
              <dt>Invalidation</dt>
              <dd>{t.body.invalidation || "Not recorded"}</dd>
              <dt>No-trade conditions</dt>
              <dd>{t.body.noTrade || "Not recorded"}</dd>
            </dl>
            <div className="cc-actions">
              <button onClick={() => open({ ...t.body, reason: "" }, t)}>
                Revise thesis
              </button>
              {t.body.scope !== "weekly" && (
                <button
                  onClick={() =>
                    open({ ...t.body, scope: "intraday", reason: "" }, t)
                  }
                >
                  Intraday update
                </button>
              )}
              {t.body.scope === "weekly" && (
                <button
                  onClick={() =>
                    open({
                      ...t.body,
                      scope: "daily",
                      periodStart: day.body.date,
                      dayId: day.rootId,
                      weeklyId: t.id,
                      reason: "Derived from weekly thesis",
                    })
                  }
                >
                  Derive daily thesis
                </button>
              )}
            </div>
            <History records={store.records} rootId={t.rootId} />
            {t.body.screenshots.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                Chart screenshot {i + 1}
              </a>
            ))}
          </article>
        ))}
      </Panel>
      {editor && (
        <Panel
          title={
            editor.previous ? "Save a thesis revision" : "Write your thesis"
          }
        >
          <form
            key={versionKey}
            className="cc-form"
            onChange={(e) => {
              const form = e.currentTarget;
              const current = editor;
              requestAnimationFrame(() => {
                try {
                  const f = new FormData(form);
                  const b = {
                    ...current.body,
                    instrument: string(f, "instrument"),
                    bias: string(f, "bias"),
                    weeklyId: string(f, "weeklyId") || undefined,
                    timeframes: JSON.parse(string(f, "visualTimeframes")),
                    scenarios: JSON.parse(string(f, "visualScenarios")),
                    chart: string(f, "chartPlan")
                      ? JSON.parse(string(f, "chartPlan"))
                      : undefined,
                  };
                  for (const key of [
                    "structure",
                    "events",
                    "levels",
                    "liquidity",
                    "primary",
                    "alternate",
                    "entries",
                    "invalidation",
                    "noTrade",
                    "targets",
                    "notes",
                    "reason",
                  ] as const)
                    b[key] = string(f, key);
                  b.screenshots = lines(f, "screenshots");
                  localStorage.setItem(
                    draftKey(current.body.scope, current.previous),
                    JSON.stringify(b),
                  );
                } catch {
                  /* Saving the version remains available when draft storage is unavailable. */
                }
              });
            }}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const f = new FormData(e.currentTarget),
                  b = editor.body;
                const body: BodyOf<"thesis"> = {
                  ...b,
                  instrument: string(f, "instrument"),
                  bias: biasSchema.parse(string(f, "bias")),
                  weeklyId: string(f, "weeklyId") || undefined,
                  structure: string(f, "structure"),
                  events: string(f, "events"),
                  levels: string(f, "levels"),
                  liquidity: string(f, "liquidity"),
                  primary: string(f, "primary"),
                  alternate: string(f, "alternate"),
                  entries: string(f, "entries"),
                  invalidation: string(f, "invalidation"),
                  noTrade: string(f, "noTrade"),
                  targets: string(f, "targets"),
                  notes: string(f, "notes"),
                  screenshots: lines(f, "screenshots"),
                  reason: string(f, "reason"),
                  timeframes: JSON.parse(string(f, "visualTimeframes")),
                  scenarios: JSON.parse(string(f, "visualScenarios")),
                  chart: string(f, "chartPlan")
                    ? JSON.parse(string(f, "chartPlan"))
                    : undefined,
                };
                if (
                  await store.save([
                    createRecord("thesis", body, editor.previous),
                  ])
                ) {
                  try {
                    localStorage.removeItem(
                      draftKey(editor.body.scope, editor.previous),
                    );
                  } catch {}
                  setEditor(undefined);
                }
              } catch {
                store.setError(
                  "Could not read the visual plan. Check the timeframe and scenario fields before saving.",
                );
              }
            }}
          >
            <div className="cc-grid">
              <Field label="Instrument">
                <input
                  name="instrument"
                  maxLength={40}
                  value={editor.body.instrument}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      body: { ...editor.body, instrument: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Directional bias">
                <select name="bias" defaultValue={editor.body.bias}>
                  {biasSchema.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              {editor.body.scope !== "weekly" && (
                <Field label="Related weekly plan (optional)">
                  <select
                    name="weeklyId"
                    defaultValue={editor.body.weeklyId ?? ""}
                  >
                    <option value="">Independent daily plan</option>
                    {weekly.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.body.instrument} · v{t.revision}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <VisualPlan key={versionKey} body={editor.body} />
            <ChartPlan
              key={"chart-" + versionKey + ":" + editor.body.instrument}
              context={context}
              body={editor.body}
            />
            <div className="cc-grid">
              {(
                [
                  ["structure", "Market structure"],
                  ["events", "Economic events"],
                  ["levels", "Major price levels"],
                  ["liquidity", "Liquidity zones"],
                  ["primary", "Primary scenario"],
                  ["alternate", "Alternative scenario"],
                  ["entries", "Entry conditions"],
                  ["invalidation", "Invalidation criteria"],
                  ["noTrade", "No-trade conditions"],
                  ["targets", "Optional price targets"],
                  ["notes", "Notes"],
                  [
                    "screenshots",
                    "Chart screenshot URLs (HTTPS, one per line)",
                  ],
                ] as const
              ).map(([key, label]) => (
                <Area
                  key={key}
                  name={key}
                  label={label}
                  value={
                    key === "screenshots"
                      ? editor.body.screenshots.join("\n")
                      : editor.body[key]
                  }
                />
              ))}
            </div>
            <Area
              label="Reason for this revision"
              name="reason"
              value={editor.body.reason}
              required
            />
            <div className="cc-actions">
              <small>
                Text drafts are kept on this device for this account. Saving
                creates an immutable revision.
              </small>
              <Save store={store}>
                Save thesis {editor.previous ? "revision" : ""}
              </Save>
              <button type="button" onClick={() => setEditor(undefined)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
