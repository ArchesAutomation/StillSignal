"use client";
import { useState } from "react";
import { latest } from "@/lib/process/model";
import { preparation, thesisAt } from "@/lib/process/engine";
import { displayValue, observationsAt } from "@/lib/environment/values";
import { isActualExecution } from "@/lib/trade-context";
import { Empty, Field, type Context } from "./shared";
export default function JournalContext({ store, day, props }: Context) {
  const events = props.session.events
      .filter(isActualExecution)
      .sort((a, b) => a.t - b.t),
    [selected, setSelected] = useState(""),
    event = events.find((e) => e.id === selected),
    at = event?.t ?? props.session.endedAt ?? props.pulse.now,
    prep = preparation(
      store.records,
      day.rootId,
      event?.timePrecision === "day" ||
        event?.timestampSource === "order-update"
        ? 0
        : at,
    ),
    thesis =
      event?.timePrecision === "day" ||
      event?.timestampSource === "order-update"
        ? undefined
        : thesisAt(
            store.records,
            day.rootId,
            event?.symbol ?? day.body.instrument,
            at,
          ),
    observations =
      event?.timePrecision === "day" ||
      event?.timestampSource === "order-update"
        ? []
        : observationsAt(
            store.records,
            day.rootId,
            at,
            props.session.id,
            event?.id,
          ),
    checkin = latest(store.records, "checkin")
      .filter((c) => c.body.dayId === day.rootId && c.body.observedAt <= at)
      .sort((a, b) => b.body.observedAt - a.body.observedAt)[0];
  return (
    <details className="cc-journal-context">
      <summary>
        Recorded process context · {day.body.date} · {day.body.status}
      </summary>
      <Field label="Context at execution">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Latest context for this recording</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.symbol} · {e.kind} · {new Date(e.t).toLocaleTimeString()}
            </option>
          ))}
        </select>
      </Field>
      {event?.timePrecision === "day" ||
      event?.timestampSource === "order-update" ? (
        <Empty>
          Exact execution time is unavailable: timed thesis, preparation, and
          physiological associations are not shown.
        </Empty>
      ) : (
        <>
          <p>
            Preparation as recorded by this time:{" "}
            {prep.total
              ? `${prep.complete}/${prep.total} required · ${prep.unknown} unverified`
              : "No applicable preparation record"}
          </p>
          <p>
            Thesis:{" "}
            {thesis
              ? `${thesis.body.bias} · v${thesis.revision} saved ${new Date(thesis.createdAt).toLocaleTimeString()} · ${thesis.body.primary}`
              : "No applicable recorded thesis"}
          </p>
          <p>
            Self-reported check-in:{" "}
            {checkin
              ? checkin.body.answers
                  .map((a) => `${a.question} ${a.value ?? "missing"}`)
                  .join(" · ")
              : "Not recorded before this time"}
          </p>
          {observations.map((o) => (
            <p key={o.observation.id}>
              {o.definition.body.name}:{" "}
              {displayValue(o.observation, o.definition)} · definition v
              {o.definition.revision} · observed{" "}
              {new Date(o.observation.body.observedAt).toLocaleTimeString()}
              {o.observation.createdAt > at ? " (entered retrospectively)" : ""}
            </p>
          ))}
        </>
      )}
      <div className="cc-actions">
        <button onClick={() => props.onPage("Trade Quality")}>
          Review strategy & rules
        </button>
        <button onClick={() => props.onPage("Settings & Variables")}>
          Record conditions
        </button>
        <button onClick={() => props.onPage("Audits")}>Open audits</button>
      </div>
    </details>
  );
}
