"use client";
import { useEffect, useRef, useState } from "react";
import {
  recordSchema,
  biasSchema,
  createRecord,
  latest,
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
import PersistentForm, { clearFormDraft } from "../persistent-form";
import ThesisAttachments from "../thesis-attachments";
import PrivateImage from "../private-image";
import { thesisMatchesDay, thesisMatchesInstrument } from "@/lib/process/thesis";
const thesisLabels = {
  structure: "Market structure",
  events: "Economic events",
  levels: "Major price levels",
  liquidity: "Liquidity zones",
  primary: "Primary scenario",
  alternate: "Alternative scenario",
  entries: "Entry conditions",
  invalidation: "Invalidation criteria",
  noTrade: "No-trade conditions",
  targets: "Price targets",
  notes: "Notes",
  screenshots: "Chart screenshots",
} as const;
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
  return latest(records, "thesis").filter((t) => thesisMatchesDay(t, day));
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
export default function ThesisWorkspace(
  context: Context & {
    initialScope?: "daily" | "weekly";
    visibleFields?: NonNullable<
      BodyOf<"protocol">["steps"][number]["thesisFields"]
    >;
  },
) {
  const { day, store } = context,
    [editor, setEditor] = useState<
      | {
          body: BodyOf<"thesis">;
          previous?: RecordOf<"thesis">;
        }
      | undefined
    >(() => {
      if (!context.initialScope) return undefined;
      const previous = relevantTheses(store.records, day)
        .filter(
          (t) =>
            (context.initialScope === "weekly"
              ? t.body.scope === "weekly"
              : t.body.scope !== "weekly") &&
            thesisMatchesInstrument(t, day.body.instrument),
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      return previous
        ? undefined
        : { body: emptyThesis(day, context.initialScope) };
    }),
    [versionKey, setVersionKey] = useState(0);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [acting, setActing] = useState(false);
  const actionInFlight = useRef(false);
  async function changeArchive(thesis: RecordOf<"thesis">, archived: boolean) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActing(true);
    setActionMessage("");
    setActionError("");
    try {
      const saved = await store.save([{
        ...createRecord("thesis", {
          ...thesis.body,
          reason: archived ? "Archived mistaken plan" : "Restored archived plan",
        }, thesis),
        archived,
      }]);
      if (saved)
        setActionMessage(`${archived ? "Archived" : "Restored"} this plan. Original versions and linked evidence are retained.`);
      else setActionError(`Could not ${archived ? "archive" : "restore"} this plan. The action was not confirmed; retry when saving is available.`);
    } catch (error) {
      setActionError(`Could not ${archived ? "archive" : "restore"} this plan. ${error instanceof Error ? error.message : "Retry when saving is available."}`);
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  const editorKey = `ss-thesis-editor:${context.props.pulse?.owner ?? "local"}:${day.rootId}:${context.initialScope ?? "all"}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(editorKey) ?? "null");
      if (saved) {
        const parsed = recordSchema.parse(createRecord("thesis", saved.body));
        if (parsed.kind === "thesis")
          setEditor({
            body: parsed.body,
            previous: store.records.find(
              (r): r is RecordOf<"thesis"> =>
                r.kind === "thesis" && r.id === saved.previousId,
            ),
          });
      }
    } catch {
      /* Saved records stay untouched if a draft is malformed. */
    }
  }, [editorKey]);
  useEffect(() => {
    if (editor) {
      try {
        localStorage.setItem(
          editorKey,
          JSON.stringify({
            body: editor.body,
            previousId: editor.previous?.id,
          }),
        );
      } catch {}
    }
  }, [editor, editorKey]);
  const formKey =
    editorKey + ":" + (editor?.previous?.id ?? editor?.body.scope ?? "new");
  const rows = relevantTheses(store.records, day).filter(
      (t) =>
        !context.initialScope ||
        (thesisMatchesInstrument(t, day.body.instrument) &&
          (context.initialScope === "weekly"
            ? t.body.scope === "weekly"
            : t.body.scope !== "weekly")),
    ),
    weekly = relevantTheses(store.records, day).filter(
      (r) => r.body.scope === "weekly",
    );
  const open = (body: BodyOf<"thesis">, previous?: RecordOf<"thesis">) => {
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
            {context.initialScope !== "daily" && (
              <button onClick={() => open(emptyThesis(day, "weekly"))}>
                New weekly thesis
              </button>
            )}
            {context.initialScope !== "weekly" && (
              <button onClick={() => open(emptyThesis(day, "daily"))}>
                New daily thesis
              </button>
            )}
          </div>
        }
      >
        {actionMessage && <p role="status">{actionMessage}</p>}
        {actionError && <p role="alert">{actionError}</p>}
        <p className="cc-muted">Archive removes a plan from current use without deleting its versions or linked reviews. Restore brings it back.</p>
        <details>
          <summary>Archived plans</summary>
          {latest(store.records, "thesis", Infinity, true)
            .filter(
              (t) =>
                t.archived &&
                (t.body.dayId === day.rootId || t.body.scope === "weekly"),
            )
            .map((t) => (
              <p key={t.id}>
                {t.body.scope} · {t.body.periodStart} ·{" "}
                {t.body.instrument || "All instruments"}
                <button
                  disabled={store.busy || acting}
                  onClick={() =>
                    void changeArchive(t, false)
                  }
                >
                  Restore plan
                </button>
              </p>
            ))}
        </details>
        {!rows.length && (
          <Empty>
            Write your first plan or derive a daily plan from your weekly
            thesis.
          </Empty>
        )}
        {rows.map((t) => (
          <article key={t.rootId} className="cc-thesis">
            <div className="cc-actions">
              <h3>
                {t.body.scope} · {t.body.periodStart} ·{" "}
                {t.body.instrument || "All instruments"}
              </h3>
              <Badge>{t.body.bias}</Badge>
              <span>v{t.revision}</span>
            </div>
            {context.visibleFields ? (
              <dl className="cc-definition">
                {context.visibleFields.map((key) => (
                  <div key={key}>
                    <dt>{thesisLabels[key]}</dt>
                    <dd>
                      {(key === "screenshots"
                        ? t.body.screenshots.join(" · ")
                        : t.body[key]) || "Not recorded"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <>
                <p>{t.body.primary}</p>
                <dl className="cc-definition">
                  <dt>Alternative</dt>
                  <dd>{t.body.alternate || "Not recorded"}</dd>
                  <dt>Invalidation</dt>
                  <dd>{t.body.invalidation || "Not recorded"}</dd>
                  <dt>No-trade conditions</dt>
                  <dd>{t.body.noTrade || "Not recorded"}</dd>
                </dl>
              </>
            )}
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
              {t.body.scope === "weekly" &&
                context.initialScope !== "weekly" && (
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
            <div className="guide-thesis-images">
              {t.body.screenshots.map((url, i) =>
                url.startsWith("local-image:") ? (
                  <PrivateImage
                    key={url}
                    path={url}
                    owner={context.props.pulse?.owner ?? "local"}
                    name={`Chart screenshot ${i + 1}`}
                  />
                ) : (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={`Chart screenshot ${i + 1}`} />
                  </a>
                ),
              )}
            </div>
            <button
              disabled={store.busy || acting}
              onClick={() => {
                if (
                  window.confirm(
                    "Archive this mistaken plan? Original versions and linked review evidence will remain in history.",
                  )
                )
                  void changeArchive(t, true);
              }}
            >
              Archive mistaken plan
            </button>
          </article>
        ))}
      </Panel>
      {editor && (
        <Panel
          title={
            editor.previous ? "Save a thesis revision" : "Write your thesis"
          }
        >
          <PersistentForm
            draftKey={formKey}
            key={versionKey}
            className="cc-form"
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
                  structure: f.has("structure")
                    ? string(f, "structure")
                    : b.structure,
                  events: f.has("events") ? string(f, "events") : b.events,
                  levels: f.has("levels") ? string(f, "levels") : b.levels,
                  liquidity: f.has("liquidity")
                    ? string(f, "liquidity")
                    : b.liquidity,
                  primary: f.has("primary") ? string(f, "primary") : b.primary,
                  alternate: f.has("alternate")
                    ? string(f, "alternate")
                    : b.alternate,
                  entries: f.has("entries") ? string(f, "entries") : b.entries,
                  invalidation: f.has("invalidation")
                    ? string(f, "invalidation")
                    : b.invalidation,
                  noTrade: f.has("noTrade") ? string(f, "noTrade") : b.noTrade,
                  targets: f.has("targets") ? string(f, "targets") : b.targets,
                  notes: f.has("notes") ? string(f, "notes") : b.notes,
                  screenshots: f.has("screenshots")
                    ? lines(f, "screenshots")
                    : b.screenshots,
                  reason: string(f, "reason"),
                  timeframes: lines(f, "timeframes").map((line) => {
                    const [timeframe, bias] = line.split("=");
                    return {
                      timeframe: timeframe.trim(),
                      bias: biasSchema.parse(bias?.trim() || "neutral"),
                    };
                  }),
                };
                if (
                  await store.save([
                    createRecord("thesis", body, editor.previous),
                  ])
                ) {
                  clearFormDraft(formKey);
                  clearFormDraft(formKey + ":images");
                  clearFormDraft(editorKey);
                  setEditor(undefined);
                }
              } catch {
                store.setError(
                  "Check timeframe lines: use names such as 15M=bullish, 1H=bearish, or Daily=neutral.",
                );
              }
            }}
          >
            <div className="cc-grid">
              <Input
                label="Instrument"
                name="instrument"
                value={editor.body.instrument}
              />
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
            <Area
              label="Timeframe biases (one per line: 15M=bullish)"
              name="timeframes"
              value={editor.body.timeframes
                .map((v) => `${v.timeframe}=${v.bias}`)
                .join("\n")}
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
              )
                .filter(
                  ([key]) =>
                    key !== "screenshots" &&
                    (!context.visibleFields ||
                      context.visibleFields.includes(key)),
                )
                .map(([key, label]) => (
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
            {(!context.visibleFields ||
              context.visibleFields.includes("screenshots")) && (
              <ThesisAttachments
                key={formKey}
                draftKey={formKey + ":images"}
                owner={context.props.pulse?.owner ?? "local"}
                initial={editor.body.screenshots}
                onChange={(screenshots) =>
                  setEditor((current) =>
                    current
                      ? { ...current, body: { ...current.body, screenshots } }
                      : current,
                  )
                }
              />
            )}
            <Area
              label="Reason for this revision"
              name="reason"
              value={editor.body.reason}
              required
            />
            <div className="cc-actions">
              <Save store={store}>
                Save thesis {editor.previous ? "revision" : ""}
              </Save>
              <button type="button" onClick={() => setEditor(undefined)}>
                Cancel
              </button>
            </div>
          </PersistentForm>
        </Panel>
      )}
    </div>
  );
}
