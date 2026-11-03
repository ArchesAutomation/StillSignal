"use client";
import { useMemo, useState } from "react";
import { completedOn, tradeRuleStatuses } from "@/lib/process/session-review";
import {
  createRecord,
  latest,
  type BodyOf,
  type RecordOf,
} from "@/lib/process/model";
import { useSavedGuide } from "./use-saved-guide";
import { z } from "zod";
import { Field, Panel, type Context } from "./command-center/shared";
import PnlSnapshot from "./pnl-snapshot";
import PersonalStillness from "./personal-stillness";
export default function SessionReviewGuide(context: Context) {
  const { store, props, day } = context;
  const ideas = useMemo(
    () =>
      completedOn(
        [...props.history, props.session].filter(
          (s) => s.owner === props.pulse.owner,
        ),
        day.body.date,
        day.body.timezone,
      ),
    [
      props.history,
      props.session,
      props.pulse.owner,
      day.body.date,
      day.body.timezone,
    ],
  );
  const profile = latest(store.records, "protocol").sort(
    (a, b) => b.createdAt - a.createdAt,
  )[0]?.body.profile;
  const books = latest(store.records, "playbook");
  const [trade, setTrade] = useState(""),
    [ruleIndex, setRuleIndex] = useState(0),
    [bookId, setBookId] = useState(books[0]?.id ?? ""),
    [error, setError] = useState("");
  const idea = ideas.find((i) => i.id === trade),
    book = books.find((b) => b.id === bookId) ?? books[0];
  const statuses = idea ? tradeRuleStatuses(store.records, idea) : [];
  const pinnedBook =
    statuses[0]?.assessment &&
    store.records.find(
      (r): r is RecordOf<"playbook"> =>
        r.kind === "playbook" &&
        r.id === statuses[0].assessment?.body.playbookId,
    );
  const activeBook = pinnedBook || book,
    rule = activeBook?.body.rules[ruleIndex];
  const review = statuses.find((s) => s.rule.id === rule?.id);
  const draft = useSavedGuide(
    `ss-rule-review:${props.pulse.owner}:${day.rootId}:${trade}:${rule?.id ?? "none"}`,
    () => ({
      value: review?.evaluation?.body.adherence ?? "unknown",
      note: review?.evaluation?.body.reason ?? "",
    }),
    (v) =>
      z
        .object({
          value: z.enum([
            "followed",
            "broken",
            "partial",
            "not-applicable",
            "unknown",
          ]),
          note: z.string().max(8000),
        })
        .parse(v),
  );
  async function save() {
    if (!idea || !rule || !activeBook) return;
    setError("");
    const session = [...props.history, props.session].find((s) =>
      s.events.some((e) => e.id === idea.entryEventId),
    );
    if (!session) {
      setError(
        "The original trade recording is unavailable. Reopen the source session.",
      );
      return;
    }
    const assessment =
      statuses[0]?.assessment ??
      createRecord("assessment", {
        dayId: day.rootId,
        sessionId: session.id,
        tradeId: idea.entryEventId,
        playbookId: activeBook.id,
        retrospective: true,
        assessedAt: Date.now(),
        quality: null,
        notes: "Session review",
        screenshots: [],
      });
    const evaluation = createRecord(
      "evaluation",
      {
        assessmentId: assessment.id,
        ruleId: rule.id,
        adherence: draft.value.value as BodyOf<"evaluation">["adherence"],
        method: "manual",
        reason: draft.value.note,
        evidenceIds: [],
      },
      review?.evaluation,
    );
    if (
      await store.save([
        ...(statuses[0]?.assessment ? [] : [assessment]),
        evaluation,
      ])
    ) {
      draft.clear();
      if (ruleIndex + 1 < activeBook.body.rules.length)
        setRuleIndex((i) => i + 1);
      else setTrade("");
    } else
      setError(
        "Your rule review could not be saved. Your answer remains here.",
      );
  }
  return (
    <Panel
      title="Review this session"
      detail="Outcome and process are different questions. Each trade keeps its own rule checks."
    >
      <div className="guide-review-overview">
        <p>
          {ideas.length
            ? `${ideas.length} fully closed trades on ${day.body.date}. Choose one to review its rules.`
            : "No completed trades on this date. You can still pause, write or speak about your day."}
        </p>
        {profile?.reviewOrder !== "rules-first" &&
          !!profile?.stillness.length && (
            <details>
              <summary>Start with my optional stillness</summary>
              <PersonalStillness
                owner={props.pulse.owner}
                elements={profile.stillness}
              />
            </details>
          )}
        {ideas.map((i) => {
          const checks = tradeRuleStatuses(store.records, i);
          return (
            <article className="guide-trade-status" key={i.id}>
              <strong>
                {i.symbol} ·{" "}
                {new Date(i.exit!).toLocaleTimeString([], {
                  timeZone: day.body.timezone,
                })}
              </strong>
              <span>
                {checks.length
                  ? checks
                      .map(
                        (c) =>
                          `${c.rule.name}: ${{ followed: "Followed", broken: "Not followed", partial: "Partly followed", "not-applicable": "Not applicable", unknown: "Not reviewed" }[c.status]}`,
                      )
                      .join(" · ")
                  : "Not reviewed"}
              </span>
              <button
                onClick={() => {
                  setTrade(i.id);
                  setRuleIndex(0);
                }}
              >
                Review this trade
              </button>
            </article>
          );
        })}
        {idea && (
          <section className="guide-rule-focus">
            <h3>{idea.symbol} · one rule at a time</h3>
            {!statuses.length && books.length > 0 && (
              <Field label="Which playbook applies?">
                <select
                  value={bookId || books[0]?.id}
                  onChange={(e) => {
                    setBookId(e.target.value);
                    setRuleIndex(0);
                  }}
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.body.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {rule ? (
              <div key={rule.id}>
                <small>
                  Rule {ruleIndex + 1} of {activeBook!.body.rules.length}
                </small>
                <h4>{rule.name}</h4>
                <p>{rule.description}</p>
                {review?.evaluation && (
                  <p>
                    Saved answer: {review.status} ·{" "}
                    {review.evaluation.body.reason}
                  </p>
                )}
                <Field label="What do you confirm?">
                  <select
                    value={draft.value.value}
                    onChange={(e) =>
                      draft.update((v) => ({
                        ...v,
                        value: e.target.value as typeof v.value,
                      }))
                    }
                  >
                    <option value="unknown">Not reviewed</option>
                    <option value="followed">Followed</option>
                    <option value="broken">Not followed</option>
                    <option value="not-applicable">Not applicable</option>
                  </select>
                </Field>
                <Field label="Evidence or reflection (optional)">
                  <textarea
                    maxLength={8000}
                    value={draft.value.note}
                    onChange={(e) =>
                      draft.update((v) => ({ ...v, note: e.target.value }))
                    }
                  />
                </Field>
                <div className="cc-actions">
                  <button
                    disabled={ruleIndex === 0}
                    onClick={() => setRuleIndex((i) => i - 1)}
                  >
                    Previous rule
                  </button>
                  <button
                    disabled={store.busy || !draft.loaded}
                    className="cc-primary"
                    onClick={() => void save()}
                  >
                    Save & continue
                  </button>
                  <button onClick={() => setTrade("")}>
                    Return to overview
                  </button>
                </div>
              </div>
            ) : (
              <p>
                Create your first rule in the playbook builder below. Entry
                conditions, risk and behaviour can each become a rule you
                confirm in review.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        )}
        {!!profile?.stillness.length &&
          profile.reviewOrder === "rules-first" && (
            <details>
              <summary>Pause alongside my review</summary>
              <PersonalStillness
                owner={props.pulse.owner}
                elements={profile.stillness}
              />
            </details>
          )}
        <div className="cc-actions">
          <button
            onClick={() =>
              props.onReflect({
                t: Date.now(),
                eventTime: null,
                source: "typed",
                section: "day-review",
              })
            }
          >
            Write a reflection
          </button>
          <button
            onClick={() =>
              props.onReflect({
                t: Date.now(),
                eventTime: null,
                source: "voice",
                autoListen: true,
                section: "day-review",
              })
            }
          >
            Speak a reflection
          </button>
          <button onClick={() => props.onPage("Journal")}>
            Inspect charts & HR in my journal
          </button>
          <button onClick={() => props.onPage("Audits")}>
            Finish session / review today
          </button>
        </div>
        <PnlSnapshot {...context} />
        <p className="cc-muted">
          Confirmations feed existing mission and process summaries. Unknown
          rules remain unreviewed; one trade's checks never replace another's.
        </p>
      </div>
    </Panel>
  );
}
