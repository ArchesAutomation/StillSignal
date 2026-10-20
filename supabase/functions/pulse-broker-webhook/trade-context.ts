import type { TradeEvent } from "./model.ts";

export function executionAction(event: TradeEvent): "buy" | "sell" {
  return (
    event.action ||
    ((event.kind === "entry") === (event.side === "long") ? "buy" : "sell")
  );
}
export function isActualExecution(event: TradeEvent) {
  return (
    !event.voided &&
    !["alert", "strategy", "backtest"].includes(event.provenance || "")
  );
}
export function eventOrigin(event: TradeEvent) {
  if (event.source === "broker")
    return `${event.broker?.provider || "Broker"} · Execution${event.positionKnown === false ? " · Position unknown" : ""}`;
  if (event.provenance === "backtest") return "CSV · Backtest";
  if (event.source === "tradingview")
    return `TradingView · ${event.provenance === "strategy" ? "Strategy" : "Observation"}`;
  if (event.source === "csv" && event.timestampSource === "order-update")
    return "CSV · Filled order · Order update time";
  return event.source === "csv" ? "CSV · Execution" : "Manual";
}
export function pnlByCurrency(events: TradeEvent[]) {
  const totals = new Map<string, number>();
  for (const e of events)
    if (
      isActualExecution(e) &&
      (e.kind === "exit" || e.source === "broker") &&
      e.pnl !== undefined
    ) {
      const currency = e.currency || e.instrument?.currency || "USD";
      totals.set(currency, (totals.get(currency) || 0) + e.pnl);
    }
  return [...totals.entries()];
}
// Broker revisions are authoritative. A stale offline client cannot undo an amendment or void.
export function mergeEvents(...sets: TradeEvent[][]) {
  const map = new Map<string, TradeEvent>();
  for (const set of sets)
    for (const event of set) {
      const old = map.get(event.id);
      if (
        !old ||
        (event.source !== "broker" && old.source !== "broker") ||
        (event.revision || 0) > (old.revision || 0)
      )
        map.set(event.id, event);
    }
  return [...map.values()].sort(
    (a, b) => a.t - b.t || a.id.localeCompare(b.id),
  );
}
