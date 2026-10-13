import Papa from "papaparse";
import { Temporal } from "@js-temporal/polyfill";
import { eventSchema } from "./validation";
import type { TradeEvent } from "./model";
export const csvTemplate =
  "timestamp,symbol,kind,side,price,quantity,pnl,execution_id\n";
export const csvFields = [
  "timestamp",
  "symbol",
  "kind",
  "side",
  "price",
  "quantity",
  "pnl",
  "execution_id",
] as const;
export type CsvField = (typeof csvFields)[number];
export type CsvMapping = Record<CsvField, string>;
export type CsvOptions = {
  mapping?: CsvMapping;
  timezone?: string;
  symbol?: string;
  kind?: "entry" | "exit";
  side?: "long" | "short";
};
const normalize = (s: string) =>
  s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
export function inspectCsv(csv: string) {
  if (new TextEncoder().encode(csv).length > 2_000_000)
    throw new Error("Choose a CSV smaller than 2 MB.");
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  if (result.errors.length)
    throw new Error("CSV could not be parsed: " + result.errors[0].message);
  if (!result.data.length)
    throw new Error(
      "The CSV has no trade rows. Fill in the template before importing.",
    );
  if (result.data.length > 5000)
    throw new Error("Import up to 5,000 events at a time.");
  const headers = result.meta.fields || [];
  if (
    new Set(headers.map(normalize)).size !== headers.length ||
    Object.keys(
      (result.meta as { renamedHeaders?: object }).renamedHeaders || {},
    ).length
  )
    throw new Error("CSV column names must be unique.");
  const find = (matches: RegExp) =>
    headers.find((h) => matches.test(normalize(h))) || "";
  const native =
    !!find(/^trade #$/) && !!find(/^type$/) && !!find(/^date\/time$/);
  const mapping: CsvMapping = {
    timestamp: find(
      /^(timestamp|date\/time|datetime|date time|filled time|fill time)$/,
    ),
    symbol: find(/^(symbol|instrument|ticker)$/),
    kind: find(/^(kind|event|entry\/exit)$/) || (native ? find(/^type$/) : ""),
    side: find(/^(side|direction|position)$/) || (native ? find(/^type$/) : ""),
    price: find(/^(price|fill price|execution price)(\s+[^%]+)?$/),
    quantity: find(/^(quantity|qty|contracts|position size \(qty\))$/),
    pnl: find(/^(pnl|p&l|net p&l|net profit|profit)(\s+[^%]+)?$/),
    execution_id: find(
      /^(execution_id|execution id|trade #|order id|trade id)$/,
    ),
  };
  return {
    headers,
    rows: result.data,
    mapping,
    format: native
      ? "TradingView Strategy Report — List of Trades"
      : "Trade event CSV",
    backtest: native,
  };
}
function number(value: string, row: number, label: string) {
  let s = value.trim();
  if (/^\([^()]+\)$/.test(s)) s = "-" + s.slice(1, -1);
  s = s.replace(/^([-+]?)[\$€£]/, "$1");
  if (s.includes(",")) {
    if (!/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))
      throw new Error(`Row ${row}: ${label} needs a decimal-point number.`);
    s = s.replaceAll(",", "");
  }
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) || !Number.isFinite(Number(s)))
    throw new Error(`Row ${row}: check ${label}.`);
  return Number(s);
}
function fingerprint(s: string) {
  let a = 2166136261,
    b = 3335557771;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b ^ s.charCodeAt(i), 2246822519);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
export function parseTrades(
  csv: string,
  options: CsvOptions = {},
): TradeEvent[] {
  const input = inspectCsv(csv),
    map = options.mapping || input.mapping;
  if (map.pnl?.includes("%"))
    throw new Error("P&L needs a monetary amount, not a percentage column.");
  const currency = map.pnl?.match(/(?: |\()([A-Z]{3,8})\)?$/)?.[1];
  if (currency && currency !== "USD")
    throw new Error(
      "This journal displays P&L in USD. Convert the P&L column to USD or choose Not included for that column.",
    );
  const events = input.rows.map((row, i) => {
    const n = i + 2,
      get = (key: CsvField) =>
        map[key] ? String(row[map[key]] || "").trim() : "";
    const timestamp = get("timestamp");
    let t: number;
    try {
      if (/(Z|[+-]\d\d:\d\d)$/i.test(timestamp))
        t = Temporal.Instant.from(timestamp).epochMilliseconds;
      else {
        if (!options.timezone) throw new Error("timezone");
        t = Temporal.PlainDateTime.from(
          timestamp.replace(" ", "T"),
        ).toZonedDateTime(options.timezone, {
          disambiguation: "reject",
        }).epochMilliseconds;
      }
    } catch {
      throw new Error(
        `Row ${n}: timestamp must be ISO 8601 with Z or a timezone offset, or an unambiguous date/time with the CSV timezone selected.`,
      );
    }
    const kindText = (get("kind") || options.kind || "").toLowerCase(),
      sideText = (get("side") || options.side || "").toLowerCase();
    const kind = /^entry(?:\s|$)/.test(kindText)
      ? "entry"
      : /^exit(?:\s|$)/.test(kindText)
        ? "exit"
        : undefined;
    const side = /^(?:entry |exit )?long$/.test(sideText)
      ? "long"
      : /^(?:entry |exit )?short$/.test(sideText)
        ? "short"
        : undefined;
    if (!kind)
      throw new Error(
        `Row ${n}: choose an entry/exit column or a fixed event type.`,
      );
    if (!side)
      throw new Error(
        `Row ${n}: choose a long/short column or a fixed direction. Buy/sell alone does not identify entry versus exit.`,
      );
    const symbol = (get("symbol") || options.symbol || "").toUpperCase().trim();
    if (!symbol)
      throw new Error(`Row ${n}: select the instrument for this file.`);
    const price = number(get("price"), n, "price"),
      quantity = number(get("quantity"), n, "quantity"),
      pnlText = get("pnl"),
      pnl = kind === "exit" && pnlText ? number(pnlText, n, "P&L") : undefined;
    const key = [
      t,
      symbol,
      kind,
      side,
      price,
      quantity,
      get("execution_id"),
    ].join("|");
    const event = {
      id: "csv-" + fingerprint(key) + "-" + t,
      t,
      symbol,
      kind,
      side,
      price,
      quantity,
      ...(pnl === undefined ? {} : { pnl }),
      source: "csv" as const,
      ...(input.backtest ? { provenance: "backtest" as const } : {}),
    };
    const parsed = eventSchema.safeParse(event);
    if (!parsed.success)
      throw new Error(
        `Row ${n}: price, quantity, symbol, or P&L is outside the supported range.`,
      );
    return parsed.data;
  });
  const unique = new Map<string, TradeEvent>();
  for (const e of events) {
    const old = unique.get(e.id);
    if (old && old.pnl !== e.pnl)
      throw new Error(
        "This file has conflicting P&L for the same execution ID.",
      );
    unique.set(e.id, e);
  }
  return [...unique.values()].sort((a, b) => a.t - b.t);
}
