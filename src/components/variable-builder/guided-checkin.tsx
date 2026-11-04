"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { temperatureRecords } from "@/lib/environment/temperature";
import { currentTimeOnDay, observationTime, observationTimeInput } from "@/lib/environment/observation-time";
import { latest, type RecordOf } from "@/lib/process/model";
import { mergeEvents } from "@/lib/trade-context";
import { positionIdeas } from "@/lib/position-ideas";
import { useSavedGuide } from "../use-saved-guide";
import { Field, type Context } from "../command-center/shared";
const questions = [
  "Focus",
  "Energy",
  "Perceived stress",
  "Confidence in following my process",
  "Mental clarity",
];
const schema = z.object({
  page: z.number().int().min(0).max(30),
  answers: z
    .array(
      z.object({
        question: z.string().max(160),
        value: z.number().min(1).max(10).nullable(),
      }),
    )
    .max(30),
  physical: z.string().max(8000),
  circumstances: z.string().max(8000),
  reflection: z.string().max(8000),
  phase: z.enum(["pre-market", "during", "post-session"]),
  association: z.string(),
  at: z.string().optional(),
});
export default function GuidedCheckin({
  context,
  previous,
  onClose,
}: {
  context: Context;
  previous?: RecordOf<"checkin">;
  onClose: () => void;
}) {
  const { store, props, day } = context;
  const draft = useSavedGuide(
    `ss-checkin-draft:${props.pulse?.owner ?? "local"}:${day.rootId}:${previous?.id ?? "new"}`,
    () => ({
      page: 0,
      answers:
        previous?.body.answers ??
        questions.map((question) => ({ question, value: null })),
      physical: previous?.body.physical ?? "",
      circumstances: previous?.body.circumstances ?? "",
      reflection: previous?.body.reflection ?? "",
      phase:
        previous?.body.phase ??
        (day.body.status === "preparing"
          ? ("pre-market" as const)
          : ("during" as const)),
      association: previous?.body.tradeId ?? "",
      at: previous
        ? observationTimeInput(previous.body.observedAt, day.body.timezone)
        : currentTimeOnDay(day.body.date, day.body.timezone),
    }),
    (v) => schema.parse(v),
  );
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { page, answers } = draft.value,
    question = answers[page];
  const recordings = (props.history ?? []).filter(
    (s) => !s.demo && s.owner === props.pulse?.owner,
  );
  const positions = positionIdeas(
    mergeEvents(recordings.flatMap((s) => s.events)),
  )
    .filter((i) => i.openQuantity > 0)
    .flatMap((idea) => {
      const source = recordings.find((s) =>
        s.events.some((e) => e.id === idea.entryEventId),
      );
      return source ? [{ sessionId: source.id, idea }] : [];
    });
  useEffect(() => {
    if (!draft.loaded) return;
    heading.current?.scrollIntoView?.({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [page, draft.loaded]);
  async function save() {
    if (saving) return;
    const names = answers.map((a) => a.question.trim());
    if (names.some((name) => !name) || new Set(names).size !== names.length) {
      setError(
        "Give each check-in question a different, non-empty name before saving.",
      );
      return;
    }
    setSaving(true);
    setError("");
    const linked = positions.find(
      (p) => p.idea.entryEventId === draft.value.association,
    );
    try {
      const batch = temperatureRecords(
        store.records,
        {
          dayId: day.rootId,
          observedAt: observationTime(
            draft.value.at ?? (previous
              ? observationTimeInput(previous.body.observedAt, day.body.timezone)
              : currentTimeOnDay(day.body.date, day.body.timezone)),
            day.body.timezone,
            previous?.body.observedAt,
          ),
          answers,
          physical: draft.value.physical,
          circumstances: draft.value.circumstances,
          reflection: draft.value.reflection,
          phase: draft.value.phase,
          sessionId: draft.value.association
            ? (linked?.sessionId ?? previous?.body.sessionId)
            : undefined,
          tradeId: draft.value.association
            ? (linked?.idea.entryEventId ?? previous?.body.tradeId)
            : undefined,
        },
        previous,
      );
      if (await store.save(batch)) {
        draft.clear();
        onClose();
      } else
        setError(
          "Your check-in could not be saved. Your answers are still here.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!draft.loaded) return <p>Opening your check-in…</p>;
  return (
    <section className="guide-checkin">
      <small>
        Check-in · {Math.min(page + 1, answers.length + 1)} of{" "}
        {answers.length + 1} · {day.body.date} · {day.body.timezone}
      </small>
      <h3 ref={heading} tabIndex={-1}>
        {question
          ? `How would you describe your ${question.question.toLowerCase()}?`
          : "Anything else you want to remember?"}
      </h3>
      <details className="guide-advanced">
        <summary>Personalise my check-in questions</summary>
        <p>
          These are your own scales. The same answers are shared with the
          journal.
        </p>
        {answers.map((answer, index) => (
          <div key={index}>
            <Field label={`Question ${index + 1}`}>
              <input
                maxLength={160}
                value={answer.question}
                onChange={(e) =>
                  draft.update((v) => ({
                    ...v,
                    answers: v.answers.map((a, n) =>
                      n === index ? { ...a, question: e.target.value } : a,
                    ),
                  }))
                }
              />
            </Field>
            <button
              type="button"
              onClick={() =>
                draft.update((v) => ({
                  ...v,
                  page: Math.min(v.page, Math.max(0, v.answers.length - 2)),
                  answers: v.answers.filter((_, n) => n !== index),
                }))
              }
            >
              Remove question {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={answers.length >= 30}
          onClick={() =>
            draft.update((v) => ({
              ...v,
              answers: [
                ...v.answers,
                {
                  question: `My question ${v.answers.length + 1}`,
                  value: null,
                },
              ],
            }))
          }
        >
          Add a question
        </button>
      </details>
      {question ? (
        <>
          <div
            className="cc-rating-values"
            role="group"
            aria-label={question.question}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={question.value === value}
                aria-label={`${question.question}: ${value} of 10`}
                onClick={() =>
                  draft.update((v) => ({
                    ...v,
                    answers: v.answers.map((a, n) =>
                      n === page
                        ? { ...a, value: a.value === value ? null : value }
                        : a,
                    ),
                  }))
                }
              >
                {value}
              </button>
            ))}
          </div>
          <p>
            1 · very low <span className="guide-scale-end">10 · very high</span>
          </p>
          <p>
            {question.value === null
              ? "Not recorded. You may leave this unanswered."
              : `${question.value}/10 · your own rating`}
          </p>
        </>
      ) : (
        <>
          {(["physical", "circumstances", "reflection"] as const).map((key) => (
            <Field
              key={key}
              label={
                {
                  physical: "Physical condition (optional)",
                  circumstances:
                    "Circumstances, caffeine or distractions (optional)",
                  reflection:
                    "What could this mean for my approach? (optional)",
                }[key]
              }
            >
              <textarea
                maxLength={8000}
                value={draft.value[key]}
                onChange={(e) =>
                  draft.update((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </Field>
          ))}
          <details>
            <summary>Timing & ongoing position (optional)</summary>
            <Field label={`Check-in time (${day.body.timezone})`}>
              <input
                type="datetime-local"
                value={draft.value.at ?? (previous
                  ? observationTimeInput(previous.body.observedAt, day.body.timezone)
                  : currentTimeOnDay(day.body.date, day.body.timezone))}
                onChange={(e) => draft.update((v) => ({ ...v, at: e.target.value }))}
              />
            </Field>
            <Field label="When in your day?">
              <select
                value={draft.value.phase}
                onChange={(e) =>
                  draft.update((v) => ({
                    ...v,
                    phase: e.target.value as typeof v.phase,
                  }))
                }
              >
                <option value="pre-market">Before my session</option>
                <option value="during">During my session</option>
                <option value="post-session">After my session</option>
              </select>
            </Field>
            <Field label="Link to an existing open position">
              <select
                value={draft.value.association}
                onChange={(e) =>
                  draft.update((v) => ({ ...v, association: e.target.value }))
                }
              >
                <option value="">This trading day only</option>
                {positions.map(({ idea }) => (
                  <option key={idea.entryEventId} value={idea.entryEventId}>
                    {idea.symbol} · opened{" "}
                    {new Date(idea.entry).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </Field>
          </details>
        </>
      )}
      {(error || draft.storageError) && (
        <p role="alert">{error || draft.storageError}</p>
      )}
      <div className="cc-actions">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => draft.update((v) => ({ ...v, page: v.page - 1 }))}
        >
          Back
        </button>
        {question ? (
          <button
            className="cc-primary"
            type="button"
            onClick={() => draft.update((v) => ({ ...v, page: v.page + 1 }))}
          >
            Continue check-in →
          </button>
        ) : (
          <button
            className="cc-primary"
            type="button"
            disabled={saving || store.busy}
            onClick={() => void save()}
          >
            {saving
              ? "Saving…"
              : previous
                ? "Save check-in correction"
                : "Record check-in"}
          </button>
        )}
        <button type="button" onClick={onClose}>
          Keep draft & close
        </button>
      </div>
      <p className="cc-muted">
        Ratings are self-reported. Missing answers stay unrecorded. This
        check-in is shared with your preparation, journal and Command Center.
      </p>
    </section>
  );
}
