"use client";
import { useState } from "react";
import { temperatureRecords } from "@/lib/environment/temperature";
import { createRecord, latest, type BodyOf } from "@/lib/process/model";
import {
  Area,
  Empty,
  Field,
  History,
  Panel,
  Save,
  string,
  type Context,
} from "../command-center/shared";
export const defaultQuestions = [
  "Focus",
  "Energy",
  "Perceived stress",
  "Confidence in following my process",
  "Mental clarity",
];
export default function Temperature(context: Context) {
  const { day, store } = context,
    rows = latest(store.records, "checkin")
      .filter((r) => r.body.dayId === day.rootId)
      .sort((a, b) => b.body.observedAt - a.body.observedAt),
    [open, setOpen] = useState(false),
    [questions, setQuestions] = useState<BodyOf<"checkin">["answers"]>(() =>
      (
        latest(store.records, "checkin").sort(
          (a, b) => b.createdAt - a.createdAt,
        )[0]?.body.answers ??
        defaultQuestions.map((question) => ({ question, value: null }))
      ).map((q) => ({ ...q, value: null })),
    );
  return (
    <Panel
      title="Temperature check"
      detail="Self-reported conditions · never inferred from heart rate"
      action={
        <button onClick={() => setOpen((v) => !v)}>
          {open ? "Close check-in" : "Check in now"}
        </button>
      }
    >
      {!rows.length && (
        <Empty>No check-in recorded for this trading day.</Empty>
      )}
      {rows[0] && (
        <>
          <div className="cc-readiness">
            {rows[0].body.answers.map((a) => (
              <div key={a.question}>
                <small>{a.question}</small>
                <strong>
                  {a.value === null ? "Not recorded" : a.value + "/10"}
                </strong>
              </div>
            ))}
          </div>
          <p>{rows[0].body.physical}</p>
          <p>{rows[0].body.circumstances}</p>
          <small>
            {new Date(rows[0].body.observedAt).toLocaleString()} · {rows.length}{" "}
            check-in{rows.length === 1 ? "" : "s"}
          </small>
        </>
      )}
      {open && (
        <form
          className="cc-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await store.save(
                temperatureRecords(store.records, {
                  dayId: day.rootId,
                  observedAt: Date.now(),
                  answers: questions,
                  physical: string(f, "physical"),
                  circumstances: string(f, "circumstances"),
                  reflection: string(f, "reflection"),
                }),
              )
            ) {
              setOpen(false);
              setQuestions((q) => q.map((a) => ({ ...a, value: null })));
            }
          }}
        >
          {questions.map((q, i) => (
            <div className="cc-inline" key={i}>
              <Field label="Question">
                <input
                  required
                  maxLength={160}
                  value={q.question}
                  onChange={(e) =>
                    setQuestions((rows) =>
                      rows.map((a, n) =>
                        n === i ? { ...a, question: e.target.value } : a,
                      ),
                    )
                  }
                />
              </Field>
              <Field label={q.question + " (1–10)"}>
                <select
                  value={q.value ?? ""}
                  onChange={(e) =>
                    setQuestions((rows) =>
                      rows.map((a, n) =>
                        n === i
                          ? {
                              ...a,
                              value: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : a,
                      ),
                    )
                  }
                >
                  <option value="">Not recorded</option>
                  {Array.from({ length: 10 }, (_, n) => (
                    <option key={n} value={n + 1}>
                      {n + 1}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={() =>
                  setQuestions((rows) => rows.filter((_, n) => n !== i))
                }
              >
                Remove question
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setQuestions((rows) => [
                ...rows,
                { question: "New question", value: null },
              ])
            }
          >
            Add question
          </button>
          <Area label="Physical condition" name="physical" />
          <Area label="Unusual circumstances" name="circumstances" />
          <Area label="Reflection (optional)" name="reflection" />
          <Save store={store}>Record check-in</Save>
        </form>
      )}
      <details className="cc-history">
        <summary>Earlier check-ins</summary>
        {rows.map((r) => (
          <div key={r.id}>
            <p>
              {new Date(r.body.observedAt).toLocaleString()} ·{" "}
              {r.body.answers
                .map((a) => `${a.question}: ${a.value ?? "missing"}`)
                .join(" · ")}
            </p>
            <History records={store.records} rootId={r.rootId} />
            <button
              disabled={store.busy}
              onClick={() =>
                void store.save([
                  { ...createRecord("checkin", r.body, r), archived: true },
                ])
              }
            >
              Remove from current analyses
            </button>
          </div>
        ))}
      </details>
    </Panel>
  );
}
