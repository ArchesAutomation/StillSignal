"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/model";
import { weekOf } from "@/lib/process/model";
import { snapshotTrades } from "@/lib/pnl-export";
import type { Props } from "../concept/shared";
import { Field, Panel } from "./shared";

export default function DashboardPnl({ props, date, zone }: {
  props: Props;
  date: string;
  zone: string;
}) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const start = period === "week" ? weekOf(date) : date.slice(0, 7) + "-01";
  const month = new Date(start + "T12:00:00Z");
  const end = period === "week"
    ? new Date(Date.parse(start + "T12:00:00Z") + 6 * 86400000).toISOString().slice(0, 10)
    : new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const { history, session, pulse } = props;
  const trades = useMemo(
    () => snapshotTrades([...history, session], pulse.owner, start, end, zone),
    [history, session, pulse.owner, start, end, zone],
  );
  const totals = new Map<string, number>();
  let unavailable = 0;
  for (const trade of trades) {
    if (!trade.complete || !trade.currency) {
      unavailable++;
      continue;
    }
    totals.set(trade.currency, (totals.get(trade.currency) ?? 0) + trade.pnl!);
  }
  return (
    <Panel title="Realised P&L">
      <Field label="Period">
        <select value={period} onChange={(event) => setPeriod(event.target.value === "month" ? "month" : "week")}>
          <option value="week">Selected week</option>
          <option value="month">Selected month</option>
        </select>
      </Field>
      <p className="cc-muted">{start} to {end}</p>
      {totals.size ? (
        <ul>{Array.from(totals, ([currency, total]) =>
          <li key={currency}><strong>{money(total, currency)}</strong> {currency}</li>
        )}</ul>
      ) : <p>No realised P&L recorded for this period.</p>}
      {unavailable > 0 && <p>{unavailable} closed trades excluded because P&L or currency is missing.</p>}
      {props.onOpenJournalDay && (
        <button disabled={pulse.active} onClick={() => void props.onOpenJournalDay?.(date)}>
          Open selected day in journal
        </button>
      )}
    </Panel>
  );
}
