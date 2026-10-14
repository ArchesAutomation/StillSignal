"use client";
import { BookOpen, ArrowUpRight } from "lucide-react";
import type { Sample, TradeEvent } from "@/lib/model";
import { clock, money } from "@/lib/model";
import { eventWindow } from "@/lib/analytics";
import { executionAction, eventOrigin } from "@/lib/trade-context";
export default function TradeContextPanel({
  event,
  samples,
  seconds,
  onSelect,
  onReflect,
}: {
  event?: TradeEvent;
  samples: Sample[];
  seconds: number;
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
              <dt>Execution time</dt>
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
                At fill<strong>{context?.at ?? "—"}</strong>
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
                : "Available measurements, in BPM."}
            </p>
          </div>
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
