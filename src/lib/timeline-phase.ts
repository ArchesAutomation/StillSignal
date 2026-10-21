import type { CompletedTrade } from "./smart-journal";

export type TimelinePhase = "before" | "entry" | "management" | "exit" | "after" | "reflection";

export function timelinePhase(
  kind: string,
  timestamp: number,
  trades: Pick<CompletedTrade, "entry" | "exit">[],
): TimelinePhase {
  if (kind === "ENTRY") return "entry";
  if (kind === "EXIT") return "exit";
  if (kind === "FILL") return "management";
  if (kind !== "REFLECTION" || !trades.length) return "reflection";

  if (trades.some((trade) => trade.entry === timestamp)) return "entry";
  if (trades.some((trade) => trade.exit === timestamp)) return "exit";
  if (trades.some((trade) => trade.entry < timestamp && (trade.exit ?? Infinity) > timestamp))
    return "management";

  const nextEntry = trades.reduce((next, trade) =>
    trade.entry > timestamp ? Math.min(next, trade.entry) : next, Infinity);
  const previousExit = trades.reduce((previous, trade) =>
    trade.exit !== undefined && trade.exit < timestamp ? Math.max(previous, trade.exit) : previous, -Infinity);
  if (nextEntry === Infinity) return previousExit === -Infinity ? "reflection" : "after";
  if (previousExit === -Infinity) return "before";
  return timestamp - previousExit <= nextEntry - timestamp ? "after" : "before";
}
