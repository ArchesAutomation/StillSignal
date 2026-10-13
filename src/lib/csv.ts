import Papa from "papaparse";
import type { TradeEvent } from "./model";
// Explicit UTC/offset timestamps prevent silent timezone shifts at import.
export function parseTrades(csv: string): TradeEvent[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (result.errors.length)
    throw new Error("CSV could not be parsed: " + result.errors[0].message);
  if (result.data.length > 5000)
    throw new Error("Import up to 5,000 events at a time.");
  return result.data.map((r, i) => {
    const timestamp = r.timestamp?.trim();
    const t = Date.parse(timestamp);
    if (!/(Z|[+-]\d\d:\d\d)$/.test(timestamp || "") || !Number.isFinite(t))
      throw new Error(
        `Row ${i + 2}: timestamp must be ISO 8601 with Z or a timezone offset.`,
      );
    if (!["entry", "exit"].includes(r.kind))
      throw new Error(`Row ${i + 2}: kind must be entry or exit.`);
    if (!["long", "short"].includes(r.side))
      throw new Error(`Row ${i + 2}: side must be long or short.`);
    if (!r.symbol || r.symbol.length > 32)
      throw new Error(
        `Row ${i + 2}: symbol is required (32 characters maximum).`,
      );
    const price = Number(r.price),
      quantity = Number(r.quantity);
    const pnl = r.pnl?.trim() ? Number(r.pnl) : undefined;
    if (
      !r.price?.trim() ||
      !r.quantity?.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      (pnl !== undefined && !Number.isFinite(pnl))
    )
      throw new Error(`Row ${i + 2}: check price, quantity, and P&L.`);
    // Stable content-derived ID: importing the same execution twice is harmless.
    const key = [
      timestamp,
      r.symbol,
      r.kind,
      r.side,
      price,
      quantity,
      r.execution_id || "",
    ].join("|");
    let h = 2166136261;
    for (let k = 0; k < key.length; k++)
      h = Math.imul(h ^ key.charCodeAt(k), 16777619);
    return {
      id: "csv-" + (h >>> 0).toString(16) + "-" + t,
      t,
      symbol: r.symbol.toUpperCase(),
      kind: r.kind as "entry" | "exit",
      side: r.side as "long" | "short",
      price,
      quantity,
      pnl,
      source: "csv" as const,
    };
  });
}
export const csvTemplate='timestamp,symbol,kind,side,price,quantity,pnl,execution_id\n';
