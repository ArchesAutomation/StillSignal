"use client";
import {
  evaluateRule,
  processScore,
  sessionsForDay,
} from "@/lib/process/engine";
import {
  adherenceSchema,
  createRecord,
  latest,
  recordSchema,
  ruleSchema,
  type BodyOf,
  type RecordOf,
  type Rule,
} from "@/lib/process/model";
import { isActualExecution } from "@/lib/trade-context";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import PersistentForm, { clearFormDraft } from "../persistent-form";
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
  number,
  string,
  type Context,
} from "../process/shared";
import TemplateTools from "../process/template-tools";
import GuidedRuleBuilder from "./guided-rule-builder";
const newRule = (): Rule => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  weight: 1,
  verification: "manual",
});
const blank: BodyOf<"playbook"> = {
  name: "",
  instrument: "",
  entries: "",
  confirmations: "",
  sizing: "",
  risk: "",
  exits: "",
  invalid: "",
  behavioral: "",
  rules: [],
};
// Drafts are allowed to be unfinished; committed records still use ruleSchema.
const draftRulesSchema = z.array(z.object({
  ...ruleSchema.shape,
  name: z.string().max(160),
  weight: z.number(),
  limit: z.number().optional(),
})).min(1).max(100);
function restorePlaybookDraft(raw: string, records: Context["store"]["records"]) {
  const saved = JSON.parse(raw);
  const rules = draftRulesSchema.parse(saved.body.rules);
  const parsed = recordSchema.parse(createRecord("playbook", {
    ...saved.body,
    name: saved.body.name || "My draft",
    rules: rules.map((r) => ({
      ...r, name: r.name || "Draft rule", weight: 1,
      verification: "manual", limit: undefined,
      startMinute: undefined, endMinute: undefined,
    })),
  }));
  if (parsed.kind !== "playbook") throw Error("Invalid playbook draft.");
  const previous = records.find(
    (r): r is RecordOf<"playbook"> => r.kind === "playbook" && r.id === saved.previousId,
  );
  if (saved.previousId && !previous)
    throw Error("The draft's original playbook version is not loaded. Refresh before resuming; the draft is preserved.");
  return { editor: { body: { ...parsed.body, name: saved.body.name }, previous }, rules };
}
export function QualityAssessment({
  context,
  assessment,
}: {
  context: Context;
  assessment: RecordOf<"assessment">;
}) {
  const { store, day, props } = context,
    playbook = store.records.find(
      (r): r is RecordOf<"playbook"> =>
        r.kind === "playbook" && r.id === assessment.body.playbookId,
    );
  if (!playbook) return null;
  const evaluations = latest(store.records, "evaluation").filter(
      (e) => e.body.assessmentId === assessment.id,
    ),
    score = processScore(evaluations, playbook.body.rules);
  const event = props.history
    .find((s) => s.id === assessment.body.sessionId)
    ?.events.find((e) => e.id === assessment.body.tradeId);
  return (
    <article className="cc-assessment">
      <div className="cc-actions">
        <h3>
          {event?.symbol ?? assessment.body.planned?.symbol ?? "Setup"} ·{" "}
          {playbook.body.name}
        </h3>
        <Badge>
          {assessment.body.retrospective
            ? "Retrospective review"
            : "Pre-trade assessment"}
        </Badge>
        <Badge>playbook v{playbook.revision}</Badge>
      </div>
      <p>
        Process score{" "}
        {score.score === null ? "not available" : Math.round(score.score) + "%"}{" "}
        · evidence coverage{" "}
        {score.coverage === null
          ? "not available"
          : Math.round(score.coverage * 100) + "%"}{" "}
        · {score.unknown} unknown · {score.excluded} not applicable
      </p>
      <small>
        Assessed {new Date(assessment.body.assessedAt).toLocaleString()}
        {assessment.body.quality !== null
          ? ` · self-assessed quality ${assessment.body.quality}/10`
          : ""}
      </small>
      <p>{assessment.body.notes}</p>
      {playbook.body.rules.map((rule) => {
        const previous = evaluations.find((e) => e.body.ruleId === rule.id);
        return (
          <form
            className="cc-check-row"
            key={rule.id + (previous?.id ?? "")}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await store.save([
                createRecord(
                  "evaluation",
                  {
                    assessmentId: assessment.id,
                    ruleId: rule.id,
                    adherence: adherenceSchema.parse(string(f, "adherence")),
                    method: "manual",
                    reason: string(f, "reason"),
                    evidenceIds: [],
                  },
                  previous,
                ),
              ]);
            }}
          >
            <div>
              <strong>{rule.name}</strong>
              <small>
                Weight {rule.weight} · {rule.description}
              </small>
              {previous && (
                <small>
                  {previous.body.method} · {previous.body.reason}
                </small>
              )}
            </div>
            <Field label={rule.name + " adherence"}>
              <select
                name="adherence"
                defaultValue={previous?.body.adherence ?? "unknown"}
              >
                {adherenceSchema.options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Input
              label="Evidence / explanation"
              name="reason"
              value={previous?.body.reason}
            />
            <Save store={store}>Record review</Save>
          </form>
        );
      })}
      <div className="cc-actions">
        <button
          disabled={store.busy || !event}
          onClick={async () => {
            if (!event) return;
            const batch = playbook.body.rules
              .filter((r) => r.verification !== "manual")
              .map((rule) => {
                const result = evaluateRule(rule, event, day, store.records),
                  previous = evaluations.find((e) => e.body.ruleId === rule.id);
                return createRecord(
                  "evaluation",
                  {
                    assessmentId: assessment.id,
                    ruleId: rule.id,
                    method: "verified",
                    ...result,
                  },
                  previous,
                );
              });
            if (batch.length) await store.save(batch);
            else store.setError("This playbook's rules require manual review.");
          }}
        >
          Verify measurable execution rules
        </button>
        <button
          onClick={() => {
            if (assessment.body.sessionId) {
              const session = props.history.find(
                (s) => s.id === assessment.body.sessionId,
              );
              if (session)
                void props.pulse
                  .openSession(session)
                  .then(() => props.onPage("Journal"))
                  .catch((e) => store.setError(String(e)));
            }
          }}
        >
          Open source journal
        </button>
      </div>
      {!assessment.body.tradeId && (
        <details className="cc-history">
          <summary>Link this planned review to a recorded execution</summary>
          <form
            className="cc-inline"
            onSubmit={async (e) => {
              e.preventDefault();
              const value = string(new FormData(e.currentTarget), "execution");
              const selected = sessionsForDay(props.history, day)
                .flatMap((s) =>
                  s.events
                    .filter(isActualExecution)
                    .map((event) => ({ session: s, event })),
                )
                .find((x) => x.session.id + ":" + x.event.id === value);
              if (!selected) return;
              const linked = createRecord(
                "assessment",
                {
                  ...assessment.body,
                  sessionId: selected.session.id,
                  tradeId: selected.event.id,
                  retrospective:
                    assessment.createdAt > selected.event.t ||
                    playbook.createdAt > selected.event.t,
                },
                assessment,
              );
              const carried = evaluations
                .filter((e) => e.body.method === "manual")
                .map((e) =>
                  createRecord(
                    "evaluation",
                    {
                      ...e.body,
                      assessmentId: linked.id,
                      reason:
                        e.body.reason +
                        " (Carried forward from the saved setup review.)",
                    },
                    e,
                  ),
                );
              await store.save([linked, ...carried]);
            }}
          >
            <Field label="Execution to link">
              <select name="execution" required>
                <option value="">Choose recorded execution</option>
                {sessionsForDay(props.history, day).flatMap((s) =>
                  s.events.filter(isActualExecution).map((e) => (
                    <option key={s.id + e.id} value={s.id + ":" + e.id}>
                      {e.symbol} · {new Date(e.t).toLocaleString()} · {e.kind}
                    </option>
                  )),
                )}
              </select>
            </Field>
            <Save store={store}>Link execution</Save>
          </form>
        </details>
      )}
      {assessment.body.screenshots.map((url, i) => (
        <a href={url} target="_blank" rel="noreferrer" key={i}>
          Supporting chart {i + 1}
        </a>
      ))}
      <History records={store.records} rootId={assessment.rootId} />
    </article>
  );
}
export function Violations(context: Context) {
  const { store, props } = context,
    rows = latest(store.records, "evaluation").filter(
      (e) => e.body.adherence === "broken",
    );
  return (
    <Panel
      title="Rule violations"
      detail="Only confirmed execution checks and explicit user reports appear here. Unknown data is not a violation."
    >
      {!rows.length && <Empty>No recorded rule violations.</Empty>}
      {rows.map((e) => {
        const a = store.records.find(
            (r): r is RecordOf<"assessment"> =>
              r.kind === "assessment" && r.id === e.body.assessmentId,
          ),
          p =
            a &&
            store.records.find(
              (r): r is RecordOf<"playbook"> =>
                r.kind === "playbook" && r.id === a.body.playbookId,
            ),
          rule = p?.body.rules.find((r) => r.id === e.body.ruleId);
        return (
          <article key={e.id} className="cc-list-row">
            <div>
              <strong>{rule?.name ?? "Rule"}</strong>
              <p>{e.body.reason || "No explanation recorded."}</p>
              <small>
                {e.body.method === "verified"
                  ? "Execution-verified"
                  : "Self-reported"}{" "}
                · {new Date(e.createdAt).toLocaleString()} · {p?.body.name} v
                {p?.revision}
              </small>
              <History records={store.records} rootId={e.rootId} />
            </div>
            <button onClick={() => props.onPage("Trade Quality")}>
              Review evidence
            </button>
          </article>
        );
      })}
    </Panel>
  );
}
export default function TradeQuality(context: Context) {
  return <PlaybookWorkspace key={context.props.pulse?.owner ?? "local"} {...context} />;
}
function PlaybookWorkspace(context: Context) {
  const { store, day, props } = context,
    books = latest(store.records, "playbook", Infinity, true),
    [editor, setEditor] = useState<{
      body: BodyOf<"playbook">;
      previous?: RecordOf<"playbook">;
    }>(),
    [rules, setRules] = useState<Rule[]>([newRule()]),
    [assessing, setAssessing] = useState(false);
  const [guided, setGuided] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [acting, setActing] = useState(false);
  const actionInFlight = useRef(false);
  const editorKey = `ss-playbook-editor:${props.pulse?.owner ?? "local"}`;
  const scopedDraftKey = (previousId?: string) => `${editorKey}:${previousId ?? "new"}:editor`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(editorKey);
      if (raw) {
        const restored = restorePlaybookDraft(raw, store.records);
        setEditor(restored.editor);
        setRules(restored.rules);
      }
    } catch (error) {
      setDraftMessage(error instanceof Error ? error.message : "This draft could not be restored. Saved playbooks are unchanged.");
    }
  }, [editorKey]);
  useEffect(() => {
    if (editor && rules.length) {
      try {
        const saved = JSON.stringify({
            body: { ...editor.body, rules },
            previousId: editor.previous?.id,
          });
        localStorage.setItem(scopedDraftKey(editor.previous?.id), saved);
        localStorage.setItem(editorKey, saved);
        setDraftMessage("");
      } catch {
        setDraftMessage("Could not store the playbook rule draft on this device. Keep the editor open until you save.");
      }
    }
  }, [editor, rules, editorKey]);
  const formKey = editorKey + ":" + (editor?.previous?.id ?? "new");
  function openEditor(body: BodyOf<"playbook">, previous?: RecordOf<"playbook">) {
    setSaveMessage("");
    setActionError("");
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(scopedDraftKey(previous?.id));
    } catch {
      setDraftMessage("Draft storage is unavailable. Keep this editor open until you save.");
    }
    if (raw) {
      try {
        const restored = restorePlaybookDraft(raw, store.records);
        setEditor(restored.editor);
        setRules(restored.rules);
        return;
      } catch (error) {
        setDraftMessage(error instanceof Error ? error.message : "Could not restore the rule draft. Your saved records are unchanged.");
        return;
      }
    }
    setEditor({ body, previous });
    setRules(previous?.body.rules ?? [newRule()]);
  }
  async function write(batch: Context["store"]["records"], success: string, failure: string) {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setActing(true);
    setActionError("");
    setSaveMessage("");
    try {
      if (!await store.save(batch)) {
        setActionError(failure + " The action was not confirmed. Retry when saving is available.");
        return false;
      }
      setSaveMessage(success);
      return true;
    } catch (error) {
      setActionError(failure + " " + (error instanceof Error ? error.message : "Retry when saving is available."));
      return false;
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  const assessments = latest(store.records, "assessment").filter(
      (a) => a.body.dayId === day.rootId,
    ),
    sessions = sessionsForDay(props.history, day),
    events = sessions.flatMap((s) =>
      s.events.filter(isActualExecution).map((e) => ({ session: s, event: e })),
    );
  return (
    <div className="cc-stack">
      <button onClick={() => setGuided((v) => !v)}>
        {guided ? "Close rule guide" : "Build my first rule with a guide"}
      </button>
      {(guided || !books.length) && (
        <GuidedRuleBuilder context={context} onClose={() => setGuided(false)} />
      )}
      <Panel
        title="Strategy playbooks"
        detail="User-defined execution and behavioral rules, with versioned weights."
        action={
          <button
            onClick={() => openEditor(blank)}
          >
            New playbook
          </button>
        }
      >
        {saveMessage && <p role="status">{saveMessage}</p>}
        {actionError && <p role="alert">{actionError}</p>}
        {draftMessage && <p role="status">{draftMessage}</p>}
        <p className="cc-muted">Each playbook has one current version. Earlier versions stay in History. Archive removes a playbook from new use; linked reviews remain and Restore brings it back.</p>
        <TemplateTools kind="playbook" store={store} />
        {!books.length && (
          <Empty>Define your strategy before reviewing setup quality.</Empty>
        )}
        {books.map((b) => (
          <div key={b.rootId} className="cc-list-row">
            <div>
              <strong>{b.body.name}</strong>
              <small>
                v{b.revision} · {b.body.rules.length} rules ·{" "}
                {b.body.instrument || "Any instrument"}
                {b.archived ? " · archived" : ""}
              </small>
              <History records={store.records} rootId={b.rootId} />
            </div>
            <button
              onClick={() => openEditor(b.body, b)}
            >
              Edit next version
            </button>
            <button
              disabled={store.busy || acting}
              onClick={() =>
                void write([
                  {
                    ...createRecord("playbook", b.body, b),
                    archived: !b.archived,
                  },
                ], `${b.archived ? "Restored" : "Archived"} “${b.body.name}”. Earlier versions and linked reviews are retained.`, `Could not ${b.archived ? "restore" : "archive"} “${b.body.name}”.`)
              }
            >
              {b.archived ? "Restore" : "Archive"}
            </button>
          </div>
        ))}
        {editor && (
          <PersistentForm
            draftKey={formKey}
            className="cc-form"
            key={editor.previous?.id ?? "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body = {
                ...editor.body,
                name: string(f, "name"),
                instrument: string(f, "instrument"),
                entries: string(f, "entries"),
                confirmations: string(f, "confirmations"),
                sizing: string(f, "sizing"),
                risk: string(f, "risk"),
                exits: string(f, "exits"),
                invalid: string(f, "invalid"),
                behavioral: string(f, "behavioral"),
                rules,
              };
              if (
                await write([
                  createRecord("playbook", body, editor.previous),
                ], `Saved “${body.name}”. Your playbook is listed above; use Edit next version to revise it.`, "Could not save this playbook.")
              ) {
                clearFormDraft(formKey);
                clearFormDraft(editorKey);
                clearFormDraft(scopedDraftKey(editor.previous?.id));
                setEditor(undefined);
              }
            }}
          >
            <div className="cc-grid">
              <Input
                name="name"
                label="Strategy name"
                value={editor.body.name}
                required
              />
              <Input
                name="instrument"
                label="Instrument applicability"
                value={editor.body.instrument}
              />
              {(
                [
                  ["entries", "Entry requirements"],
                  ["confirmations", "Confirmation conditions"],
                  ["sizing", "Position sizing rules"],
                  ["risk", "Risk management"],
                  ["exits", "Exit and management guidelines"],
                  ["invalid", "Invalid setup conditions"],
                  ["behavioral", "Personal behavioral requirements"],
                ] as const
              ).map(([key, label]) => (
                <Area
                  name={key}
                  key={key}
                  label={label}
                  value={editor.body[key]}
                />
              ))}
            </div>
            {rules.map((r, i) => {
              const update = (patch: Partial<Rule>) =>
                setRules((rows) =>
                  rows.map((old, n) => (n === i ? { ...old, ...patch } : old)),
                );
              return (
                <fieldset key={r.id}>
                  <legend>Rule {i + 1}</legend>
                  <div className="cc-grid">
                    <Field label="Rule name">
                      <input
                        required
                        value={r.name}
                        onChange={(e) => update({ name: e.target.value })}
                      />
                    </Field>
                    <Field label="Description / manual criterion">
                      <input
                        value={r.description}
                        onChange={(e) =>
                          update({ description: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Weight">
                      <input
                        required
                        type="number"
                        min="0.01"
                        max="1000"
                        step="any"
                        value={r.weight}
                        onChange={(e) =>
                          update({ weight: Number(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Verification">
                      <select
                        value={r.verification}
                        onChange={(e) =>
                          update({
                            verification: e.target
                              .value as Rule["verification"],
                          })
                        }
                      >
                        {[
                          "manual",
                          "max-size",
                          "time-window",
                          "preparation",
                          "thesis-direction",
                        ].map((v) => (
                          <option key={v} value={v}>
                            {v === "max-size"
                              ? "max-size (single execution only)"
                              : v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {r.verification === "max-size" && (
                      <Field label="Maximum single-execution units">
                        <input
                          type="number"
                          required
                          min="0.000001"
                          step="any"
                          value={r.limit ?? ""}
                          onChange={(e) =>
                            update({ limit: Number(e.target.value) })
                          }
                        />
                      </Field>
                    )}
                    {r.verification === "time-window" && (
                      <>
                        <Field
                          label={"Window start (" + day.body.timezone + ")"}
                        >
                          <input
                            type="time"
                            required
                            defaultValue={
                              r.startMinute === undefined
                                ? ""
                                : `${Math.floor(r.startMinute / 60)
                                    .toString()
                                    .padStart(
                                      2,
                                      "0",
                                    )}:${(r.startMinute % 60).toString().padStart(2, "0")}`
                            }
                            onChange={(e) => {
                              const [h, m] = e.target.value
                                .split(":")
                                .map(Number);
                              update({ startMinute: e.target.value ? h * 60 + m : undefined });
                            }}
                          />
                        </Field>
                        <Field label="Window end">
                          <input
                            type="time"
                            required
                            defaultValue={
                              r.endMinute === undefined
                                ? ""
                                : `${Math.floor(r.endMinute / 60)
                                    .toString()
                                    .padStart(
                                      2,
                                      "0",
                                    )}:${(r.endMinute % 60).toString().padStart(2, "0")}`
                            }
                            onChange={(e) => {
                              const [h, m] = e.target.value
                                .split(":")
                                .map(Number);
                              update({ endMinute: e.target.value ? h * 60 + m : undefined });
                            }}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={rules.length < 2}
                    onClick={() =>
                      setRules((rows) => rows.filter((_, n) => n !== i))
                    }
                  >
                    Remove rule
                  </button>
                </fieldset>
              );
            })}
            <div className="cc-actions">
              <button
                type="button"
                onClick={() => setRules((rows) => [...rows, newRule()])}
              >
                Add rule
              </button>
              <Save store={{ ...store, busy: store.busy || acting }}>Save playbook version</Save>
              <button type="button" onClick={() => {
                setEditor(undefined);
                setSaveMessage("Draft kept on this device. Reopen this playbook to continue editing; nothing was committed.");
              }}>
                Cancel
              </button>
            </div>
          </PersistentForm>
        )}
      </Panel>
      <Panel
        title="Setup quality & adherence"
        detail="Process scores remain separate from P&L. Unreviewed rules stay unknown."
        action={
          <button onClick={() => setAssessing((v) => !v)}>
            Assess setup or execution
          </button>
        }
      >
        {assessing && (
          <form
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                selected = events.find(
                  (x) =>
                    x.session.id + ":" + x.event.id === string(f, "execution"),
                ),
                planned =
                  !selected && string(f, "symbol")
                    ? {
                        symbol: string(f, "symbol"),
                        side: string(f, "side") as "long" | "short",
                        quantity: number(f, "quantity") ?? 0,
                        t: Date.now(),
                      }
                    : undefined;
              const body: BodyOf<"assessment"> = {
                dayId: day.rootId,
                sessionId: selected?.session.id,
                tradeId: selected?.event.id,
                planned,
                playbookId: string(f, "playbook"),
                retrospective: !!selected,
                assessedAt: Date.now(),
                quality: number(f, "quality") ?? null,
                notes: string(f, "notes"),
                screenshots: lines(f, "screenshots"),
              };
              if (await store.save([createRecord("assessment", body)]))
                setAssessing(false);
            }}
          >
            <div className="cc-grid">
              <Field label="Execution or planned setup">
                <select name="execution">
                  <option value="">Planned setup (before execution)</option>
                  {events.map((x) => (
                    <option
                      key={x.session.id + x.event.id}
                      value={x.session.id + ":" + x.event.id}
                    >
                      {x.event.symbol} · {new Date(x.event.t).toLocaleString()}{" "}
                      · {x.event.kind}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Playbook version">
                <select name="playbook" required>
                  <option value="">Select version</option>
                  {store.records
                    .filter(
                      (r): r is RecordOf<"playbook"> =>
                        r.kind === "playbook" && !r.archived,
                    )
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.body.name} · v{b.revision} ·{" "}
                        {new Date(b.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                </select>
              </Field>
              <Input
                label="Planned instrument (for planned setup)"
                name="symbol"
              />
              <Field label="Planned direction">
                <select name="side">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </Field>
              <Input
                name="quantity"
                label="Planned units"
                type="number"
                min={0.000001}
                step="any"
              />
              <Input
                name="quality"
                label="Self-assessed setup quality (optional, 1–10)"
                type="number"
                min={1}
                max={10}
              />
            </div>
            <Area name="notes" label="Notes / supporting evidence" />
            <Area
              name="screenshots"
              label="Screenshot URLs (HTTPS, one per line)"
            />
            <p className="cc-muted">
              Existing executions are clearly marked as retrospective reviews.
            </p>
            <Save store={store}>Save assessment</Save>
          </form>
        )}
        {!assessments.length && (
          <Empty>No setup reviews recorded for this day.</Empty>
        )}
        {assessments.map((a) => (
          <QualityAssessment key={a.id} context={context} assessment={a} />
        ))}
      </Panel>
    </div>
  );
}
