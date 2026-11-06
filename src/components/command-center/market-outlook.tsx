"use client";
import { createRecord, type RecordOf } from "@/lib/process/model";
import { relevantTheses } from "../trading-thesis/workspace";
import { Field, type Context } from "./shared";
import { thesisMatchesInstrument } from "@/lib/process/thesis";
import { GlassPanel } from "../glassyui/glass-panel";
const minutes = (value: string) => {
  const key = value.trim().toLowerCase();
  if (["weekly", "week", "1w"].includes(key)) return 10080;
  if (["daily", "day", "1d"].includes(key)) return 1440;
  const match = /^(\d+)\s*([mhdw])$/.exec(key);
  return match
    ? Number(match[1]) * ({ m: 1, h: 60, d: 1440, w: 10080 }[match[2]] ?? 1)
    : 0;
};
export const highestTimeframeFirst = (values: string[]) =>
  [...new Set(values)].sort(
    (a, b) => minutes(b) - minutes(a) || a.localeCompare(b),
  );
export default function MarketOutlook({ store, day, props }: Context) {
  const plans = relevantTheses(store.records, day)
    .filter(
      (t) =>
        thesisMatchesInstrument(t, day.body.instrument),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const weekly = plans.find((t) => t.body.scope === "weekly"),
    daily = plans.find((t) => t.body.scope !== "weekly");
  const row = (
    label: string,
    plan: RecordOf<"thesis"> | undefined,
    timeframe?: string,
  ) => (
    <div key={label}>
      {plan ? (
        <Field label={label}>
          <select
            aria-label={`${label} bias`}
            value={
              timeframe
                ? (plan.body.timeframes.find((f) => f.timeframe === timeframe)
                    ?.bias ?? "")
                : plan.body.bias
            }
            disabled={store.busy}
            onChange={(e) => {
              const bias = e.target.value as RecordOf<"thesis">["body"]["bias"];
              const timeframes = timeframe
                ? [
                    ...plan.body.timeframes.filter(
                      (f) => f.timeframe !== timeframe,
                    ),
                    { timeframe, bias },
                  ]
                : plan.body.timeframes;
              void store.save([
                createRecord(
                  "thesis",
                  {
                    ...plan.body,
                    ...(!timeframe ? { bias } : {}),
                    timeframes,
                    reason: `Updated ${label} bias from market outlook`,
                  },
                  plan,
                ),
              ]);
            }}
          >
            <option value="" disabled>
              Not recorded
            </option>
            {["bullish", "bearish", "neutral", "no-trade"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <span>{label}: not recorded</span>
          <button onClick={() => props.onPage("Trading Thesis")}>
            Add plan
          </button>
        </>
      )}
    </div>
  );
  const timeframes = highestTimeframeFirst([
    ...day.body.timeframes,
    ...(daily?.body.timeframes.map((f) => f.timeframe) ?? []),
  ]);
  const extraScopes = timeframes.filter((t) => minutes(t) >= 1440);
  return (
    <GlassPanel lens
      className="cc-market-strip guide-market-outlook"
      aria-label="Recorded market bias"
    >
      <strong>Market outlook</strong>
      <small>{day.body.instrument.trim() || "All instruments"} · {day.body.date}{daily?.body.scope === "intraday" ? " · latest intraday update" : ""}</small>
      {row("Weekly", weekly)}
      {row("Daily", daily)}
      {timeframes.filter((t) => minutes(t) < 1440).map((t) => row(t, daily, t))}
      {!!extraScopes.length && (
        <details>
          <summary>Separate chart scopes</summary>
          <p>
            Overall plan bias and chart-timeframe bias are separate records of
            your view.
          </p>
          {extraScopes.map((t) => row(`${t} chart`, daily, t))}
        </details>
      )}
      {store.error && <p role="alert">{store.error}</p>}
    </GlassPanel>
  );
}
