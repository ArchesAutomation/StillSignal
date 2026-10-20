"use client";
import { BookOpen, ArrowUpRight } from "lucide-react";
import type { Sample, TradeEvent } from "@/lib/model";
import { clock, money } from "@/lib/model";
import { eventWindow, positionWindow } from "@/lib/analytics";
import { executionAction, eventOrigin } from "@/lib/trade-context";
export default function TradeContextPanel({
  event,
  samples,
  seconds,
  events = [],
  end = samples.at(-1)?.t ?? event?.t ?? Date.now(),
  onSelect,
  onReflect,
}: {
  event?: TradeEvent;
  samples: Sample[];
  seconds: number;
  events?: TradeEvent[];
  end?: number;
  onSelect: (event: TradeEvent) => void;
  onReflect: (t: number) => void;
}) {
  const context =
    event && event.timePrecision !== "day"
      ? eventWindow(samples, event, seconds)
      : null;
  return (
    <aside className="glass trade-context-panel">
      <div className="context-heading">
        <span className="eyebrow">TRADE CONTEXT</span>
        <BookOpen size={16} />
      </div>
      {event ? (
        <>
          <div className="context-symbol">
            <h2>{event.symbol}</h2>
            <span
              className={executionAction(event) === "buy" ? "mint" : "rose"}
            >
              {executionAction(event).toUpperCase()}
            </span>
          </div>
          <p>
            {event.kind === "fill"
              ? "Unclassified fill · starting position unknown"
              : event.kind + " · " + event.side}
          </p>
          <dl className="context-facts">
            <div>
              <dt>{event.timestampSource === "order-update" ? "Order update time" : "Execution time"}</dt>
              <dd>
                {event.timePrecision === "day"
                  ? new Date(event.t).toISOString().slice(0, 10) +
                    " · date only"
                  : clock(event.t)}
              </dd>
            </div>
            <div>
              <dt>Price × quantity</dt>
              <dd>
                {event.price} × {event.quantity}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{eventOrigin(event)}</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>{event.account?.slice(0, 12) || "Manual journal"}</dd>
            </div>
            {event.fees !== undefined && (
              <div>
                <dt>Fees</dt>
                <dd>{money(event.fees, event.currency || "USD")}</dd>
              </div>
            )}
          </dl>
          <div className="context-hr">
            <span>HEART RATE · {seconds}s WINDOW</span>
            <div>
              <small>
                Before
                <strong>
                  {context?.before == null ? "—" : Math.round(context.before)}
                </strong>
              </small>
              <small>
                {event.timestampSource === "order-update" ? "At update" : "At fill"}<strong>{context?.at ?? "—"}</strong>
              </small>
              <small>
                After
                <strong>
                  {context?.after == null ? "—" : Math.round(context.after)}
                </strong>
              </small>
            </div>
            <p>
              {event.timePrecision === "day"
                ? "Date-only records cannot be aligned to a heart-rate measurement."
                : event.timestampSource === "order-update"
                  ? "Measurements align to the order update time, which may differ from the actual fill time."
                  : "Available measurements, in BPM."}
            </p>
          </div>
          <PositionHeartRate event={event} samples={samples} events={events} seconds={seconds} end={end} />
          <button
            className="button primary full"
            onClick={() => onReflect(event.t)}
          >
            Add reflection <ArrowUpRight size={14} />
          </button>
          <button className="text-button" onClick={() => onSelect(event)}>
            Open event details
          </button>
        </>
      ) : (
        <div className="context-empty">
          <span className="context-geometry" aria-hidden="true">
            ◇
          </span>
          <h3>Every execution has context.</h3>
          <p>
            Select a marker or trade to bring the market, your pulse, and your
            reflection together.
          </p>
        </div>
      )}
    </aside>
  );
}

export function PositionHeartRate({ event, samples, events, seconds, end }: {
  event: TradeEvent; samples: Sample[]; events: TradeEvent[]; seconds: number; end: number;
}) {
  const position = positionWindow(samples, events, event, seconds, end);
  if (!position) return null;
  return (
          <div className="context-hr" aria-label="Position heart rate">
            <span>WHILE THE POSITION IS OPEN</span>
            <p>{clock(position.start)} – {position.closed ? clock(position.end) : "Still open"}</p>
            <div>
              <small>Before entry<strong>{position.before == null ? "—" : Math.round(position.before)}</strong></small>
              <small>During position<strong>{position.during == null ? "—" : Math.round(position.during)}</strong></small>
              <small>After exit<strong>{position.after == null ? "—" : Math.round(position.after)}</strong></small>
            </div>
            <p>{position.count ? `${position.count.toLocaleString()} recorded measurements during the position. Averages in BPM; gaps are not filled.` : "No heart rate was recorded during this position."}
              {position.approximate && " Position timing uses order updates and may differ from actual fill times."}
            </p>
          </div>
  );
}
