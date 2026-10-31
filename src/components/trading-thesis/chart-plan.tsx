"use client";
import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { useMarketData } from "../use-market-data";
import type { BodyOf } from "@/lib/process/model";
import { Field, type Context } from "../command-center/shared";
import AnnotationChart from "./annotation-chart";
type Chart = NonNullable<BodyOf<"thesis">["chart"]>;
export default function ChartPlan({
  context,
  body,
}: {
  context: Context;
  body: BodyOf<"thesis">;
}) {
  const savedChart =
    body.chart?.symbol === body.instrument ? body.chart : undefined;
  const [interval, setInterval] = useState<Chart["interval"]>(
      savedChart?.interval ?? 300,
    ),
    [annotations, setAnnotations] = useState(savedChart?.annotations ?? []);
  const match = context.props.history
    .filter((s) => !s.demo)
    .flatMap((s) => s.events.map((event) => ({ session: s, event })))
    .find((x) => x.event.symbol === body.instrument && x.event.instrument);
  const [range] = useState(() => {
    const date = Temporal.PlainDate.from(body.periodStart);
    return {
      start: date.toZonedDateTime(context.day.body.timezone).epochMilliseconds,
      end: Math.min(
        Date.now(),
        date
          .add({ days: body.scope === "weekly" ? 7 : 1 })
          .toZonedDateTime(context.day.body.timezone).epochMilliseconds,
      ),
    };
  });
  const { feed, loading, retry } = useMarketData(
    match?.event.instrument && range.end > range.start
      ? {
          instrument: match.event.instrument,
          accountId: match.event.broker?.accountId ?? match.event.account,
          start: range.start,
          end: range.end,
          interval,
          replay: true,
        }
      : null,
    context.props.pulse.owner,
  );
  const chart: Chart | undefined = match?.event.instrument
    ? {
        symbol: body.instrument,
        instrumentId: match.event.instrument.id,
        interval,
        source:
          feed.state === "ready"
            ? feed.provider
            : (savedChart?.source ?? "Unavailable"),
        asOf: feed.asOf || savedChart?.asOf || Date.now(),
        annotations,
      }
    : savedChart
      ? { ...savedChart, annotations }
      : undefined;
  return (
    <details>
      <summary>Chart levels & regions</summary>
      <input
        type="hidden"
        name="chartPlan"
        value={chart ? JSON.stringify(chart) : ""}
      />
      <Field label="Chart timeframe">
        <select
          value={interval}
          onChange={(e) => setInterval(+e.target.value as Chart["interval"])}
        >
          <option value={60}>1 minute</option>
          <option value={300}>5 minutes</option>
          <option value={900}>15 minutes</option>
          <option value={3600}>1 hour</option>
        </select>
      </Field>
      <p>
        {loading ? "Loading recorded market data…" : feed.message} ·{" "}
        {feed.provider} · {feed.granularity}
      </p>
      {feed.state === "ready" && feed.candles.length ? (
        <AnnotationChart
          candles={feed.candles}
          annotations={annotations}
          onChange={setAnnotations}
        />
      ) : (
        <p>
          No chart candles available. Connect an exact instrument through an
          execution or use linked chart screenshots. Saved levels remain
          editable.
        </p>
      )}
      <button type="button" onClick={retry}>
        Retry market data
      </button>
      {annotations.map((a, i) => (
        <fieldset key={a.id}>
          <legend>{a.name}</legend>
          <div className="cc-grid">
            <Field label="Level name">
              <input
                required
                maxLength={160}
                value={a.name}
                onChange={(e) =>
                  setAnnotations((rows) =>
                    rows.map((r, n) =>
                      n === i ? { ...r, name: e.target.value } : r,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Level type">
              <select
                value={a.kind}
                onChange={(e) =>
                  setAnnotations((rows) =>
                    rows.map((r, n) =>
                      n === i
                        ? { ...r, kind: e.target.value as typeof a.kind }
                        : r,
                    ),
                  )
                }
              >
                {[
                  "support",
                  "resistance",
                  "liquidity",
                  "supply",
                  "demand",
                  "entry",
                  "invalidation",
                  "target",
                  "session",
                  "custom",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Price">
              <input
                required
                type="number"
                step="any"
                value={a.price}
                onChange={(e) =>
                  setAnnotations((rows) =>
                    rows.map((r, n) =>
                      n === i
                        ? {
                            ...r,
                            price: e.target.valueAsNumber,
                            recordedAt: Date.now(),
                          }
                        : r,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Region boundary (optional)">
              <input
                type="number"
                step="any"
                value={a.endPrice ?? ""}
                onChange={(e) =>
                  setAnnotations((rows) =>
                    rows.map((r, n) =>
                      n === i
                        ? {
                            ...r,
                            endPrice: e.target.value
                              ? e.target.valueAsNumber
                              : undefined,
                            recordedAt: Date.now(),
                          }
                        : r,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={a.color}
                onChange={(e) =>
                  setAnnotations((rows) =>
                    rows.map((r, n) =>
                      n === i ? { ...r, color: e.target.value } : r,
                    ),
                  )
                }
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() =>
              setAnnotations((rows) => rows.filter((_, n) => n !== i))
            }
          >
            Remove level
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={!chart || annotations.length >= 100}
        onClick={() =>
          setAnnotations((rows) => [
            ...rows,
            {
              id: crypto.randomUUID(),
              name: "New level",
              kind: "custom",
              price: feed.candles.at(-1)?.close ?? 0,
              color: "#74b49d",
              recordedAt: Date.now(),
            },
          ])
        }
      >
        Add chart level
      </button>
      <small>
        Levels are user annotations, not market recommendations. Source, symbol
        and timeframe are saved with this thesis revision.
      </small>
    </details>
  );
}
