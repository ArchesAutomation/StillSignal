"use client";
import { latest, type RecordOf } from "@/lib/process/model";
import { useState } from "react";
import { Empty, History, Panel, type Context } from "../process/shared";
import GuidedCheckin from "./guided-checkin";
export const defaultQuestions = [
  "Focus",
  "Energy",
  "Perceived stress",
  "Confidence in following my process",
  "Mental clarity",
];
export default function Temperature(
  context: Context & { initiallyOpen?: boolean },
) {
  const { day, store } = context;
  const rows = latest(store.records, "checkin")
    .filter((r) => r.body.dayId === day.rootId && r.body.arrival === undefined)
    .sort((a, b) => b.body.observedAt - a.body.observedAt);
  const [open, setOpen] = useState(
    (context.initiallyOpen ?? false) && !rows.length,
  );
  const [editing, setEditing] = useState<RecordOf<"checkin">>();
  return (
    <Panel
      title="Temperature check"
      detail="Self-reported conditions · never inferred from heart rate"
      action={
        <button
          onClick={() => {
            setEditing(undefined);
            setOpen((v) => !v);
          }}
        >
          {open ? "Close check-in" : "Check in now"}
        </button>
      }
    >
      {!rows.length && (
        <Empty>
          No check-in recorded for this trading day. A few optional questions
          help you record how you are arriving.
        </Empty>
      )}
      {rows[0] && (
        <>
          <div className="cc-readiness">
            {rows[0].body.answers.map((a) => (
              <div key={a.question}>
                <small>{a.question}</small>
                <strong>
                  {a.value === null ? "Not recorded" : `${a.value}/10`}
                </strong>
              </div>
            ))}
          </div>
          <p>{rows[0].body.physical}</p>
          <p>{rows[0].body.circumstances}</p>
          <p>{rows[0].body.reflection}</p>
          <small>
            {new Date(rows[0].body.observedAt).toLocaleString([], { timeZone: day.body.timezone })} ({day.body.timezone}) ·{" "}
            {rows[0].body.phase ?? "during"}
          </small>
          <button
            onClick={() => {
              setEditing(rows[0]);
              setOpen(true);
            }}
          >
            Correct this check-in
          </button>
        </>
      )}
      {open && (
        <GuidedCheckin
          key={day.rootId + (editing?.id ?? "new")}
          context={context}
          previous={editing}
          onClose={() => {
            setOpen(false);
            setEditing(undefined);
          }}
        />
      )}
      {rows.length > 0 && (
        <details className="cc-history">
          <summary>Earlier check-ins & corrections</summary>
          {rows.map((r) => (
            <div key={r.id}>
              <p>
                {new Date(r.body.observedAt).toLocaleString([], { timeZone: day.body.timezone })} ({day.body.timezone}) ·{" "}
                {r.body.answers
                  .map((a) => `${a.question}: ${a.value ?? "not recorded"}`)
                  .join(" · ")}
              </p>
              <History records={store.records} rootId={r.rootId} />
              <button
                onClick={() => {
                  setEditing(r);
                  setOpen(true);
                }}
              >
                Correct this record
              </button>
            </div>
          ))}
        </details>
      )}
    </Panel>
  );
}
