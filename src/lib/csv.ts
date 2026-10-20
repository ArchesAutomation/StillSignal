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
  fillsStartFlat?: boolean;
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
  const strategyTime = find(/^(date\/time|date and time|date & time)$/);
  const orderUpdateColumn = find(/^(update time|last update time)$/);
  const native =
    !!find(/^trade #$/) && !!find(/^type$/) && !!strategyTime;
  const mapping: CsvMapping = {
    timestamp:
      strategyTime ||
      find(/^(filled time|fill time|filltime|execution time|closing time)$/) ||
      find(/^(timestamp|datetime|date time|time)$/) ||
      orderUpdateColumn,
    symbol: find(/^(symbol|instrument|ticker|contract)$/),
    kind: find(/^(kind|event|entry\/exit)$/) || (native ? find(/^type$/) : ""),
    side: find(/^(side|direction|position)$/) || (native ? find(/^type$/) : ""),
    price: find(
      /^(price|fill price|fillprice|avg fill price|average fill price|execution price)(\s+[^%]+)?$/,
    ),
    quantity: find(
      /^(fill qty|fill quantity|filled qty|filled quantity|filledqty|quantity|qty|contracts|position size \(qty\))$/,
    ),
    pnl: find(/^(pnl|p&l|net p&l|net profit|profit)(\s+[^%]+)?$/),
    execution_id: find(
      /^(execution_id|execution id|fill id|fillid|trade #|order id|orderid|trade id)$/,
    ),
  };
  const actionColumn = find(/^(action|b\/s|buy\/sell|buy or sell|side)$/);
  const statusColumn = find(/^(status|order status|ordstatus)$/);
  const fills = !native && !mapping.kind && !!actionColumn;
  const filledQuantityColumn = find(
    /^(fill qty|fill quantity|filled qty|filled quantity|filledqty)$/,
  );
  // Order history can contain an order/limit price alongside the actual fill
  // price. Never prefer the requested price over the recorded execution.
  if (fills) {
    mapping.price =
      find(/^(avg fill price|average fill price|fill price|fillprice|execution price)(\s+[^%]+)?$/) ||
      mapping.price;
    mapping.quantity = filledQuantityColumn || mapping.quantity;
  }
  return {
    headers,
    rows: result.data,
    mapping,
    format: native
      ? "TradingView Strategy Report — List of Trades"
      : fills
        ? "Broker executions / filled orders"
        : "Trade event CSV",
    backtest: native,
    fills,
    actionColumn,
    statusColumn,
    orderUpdateColumn,
    filledQuantityColumn,
    accountColumn: find(/^(account|account id|account name)$/),
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
  if (input.fills && !map.kind) return parseFills(input, map, options);
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

function parseFills(
  input: ReturnType<typeof inspectCsv>,
  map: CsvMapping,
  options: CsvOptions,
): TradeEvent[] {
  if (!options.fillsStartFlat)
    throw new Error(
      "Confirm that the export includes every fill and starts with a flat position, so entries and exits can be reconstructed.",
    );
  if (map.pnl?.includes("%"))
    throw new Error("P&L needs a monetary amount, not a percentage column.");
  const currency = map.pnl?.match(/(?: |\()([A-Z]{3,8})\)?$/)?.[1];
  if (currency && currency !== "USD")
    throw new Error(
      "Convert P&L to USD or choose Not included for that column.",
    );
  const positions = new Map<string, number>(),
    executions = new Map<string, string>(),
    events: TradeEvent[] = [];
  const rows = input.rows
    .flatMap((row, i) => {
      // Orders exports may include requested quantity for an order with no fills.
      // A cumulative filled quantity is authoritative when supplied, even if the
      // order was later canceled or is still working after a partial fill.
      const filledQuantity = input.filledQuantityColumn
        ? number(row[input.filledQuantityColumn] || "", i + 2, "filled quantity")
        : undefined;
      if (filledQuantity === 0) return [];
      if (filledQuantity !== undefined && filledQuantity < 0)
        throw new Error(`Row ${i + 2}: filled quantity must not be negative.`);
      const status = (row[input.statusColumn] || "")
        .trim()
        .toLowerCase()
        .replace(/[ _-]/g, "");
      const partiallyFilledOrder =
        /^(filled qty|filled quantity|filledqty)$/.test(normalize(input.filledQuantityColumn)) &&
        filledQuantity !== undefined && filledQuantity > 0 &&
        /^(cancelled|canceled|expired|working|pending|open|new)$/.test(status);
      if (
        input.statusColumn &&
        !partiallyFilledOrder &&
        /^(cancelled|canceled|rejected|expired|working|pending|open|new)$/.test(
          status,
        )
      )
        return [];
      if (
        input.statusColumn &&
        !/^(filled|fill|partiallyfilled|partialfill|executed|complete|completed)$/.test(
          status,
        ) &&
        !partiallyFilledOrder
      )
        throw new Error(
          `Row ${i + 2}: unknown order status. Use a filled-executions export.`,
        );
      const get = (field: CsvField) => String(row[map[field]] || "").trim();
      let t: number;
      try {
        const value = get("timestamp");
        if (/(Z|[+-]\d\d:\d\d)$/i.test(value))
          t = Temporal.Instant.from(value).epochMilliseconds;
        else if (options.timezone)
          t = Temporal.PlainDateTime.from(
            value.replace(" ", "T"),
          ).toZonedDateTime(options.timezone, {
            disambiguation: "reject",
          }).epochMilliseconds;
        else throw new Error("timezone");
      } catch {
        throw new Error(
          `Row ${i + 2}: choose the export timezone and use an unambiguous timestamp.`,
        );
      }
      const action = (row[input.actionColumn] || "").trim().toLowerCase();
      if (!/^(buy|sell|b|s)$/.test(action))
        throw new Error(`Row ${i + 2}: choose a Buy/Sell action column.`);
      const symbol = (get("symbol") || options.symbol || "").toUpperCase(),
        price = number(get("price"), i + 2, "fill price"),
        quantity = number(get("quantity"), i + 2, "filled quantity");
      if (!symbol || quantity <= 0)
        throw new Error(
          `Row ${i + 2}: provide a symbol and positive filled quantity.`,
        );
      const account = input.accountColumn
        ? String(row[input.accountColumn] || "").trim()
        : "";
      const ref = get("execution_id"),
        pnlText = get("pnl");
      const payload = JSON.stringify([
        t,
        account,
        symbol,
        action,
        price,
        quantity,
        pnlText,
      ]);
    if (!ref && executions.has(`anonymous:${payload}`))
      throw new Error(`Row ${i + 2}: identical fills need unique fill IDs so neither execution is lost.`);
    if (!ref) executions.set(`anonymous:${payload}`, payload);
      if (ref) {
        const key = `${account}:${ref}`,
          old = executions.get(key);
        if (old && old !== payload)
          throw new Error(
            `Row ${i + 2}: repeated execution/order ID has different data. Export individual fills with unique fill IDs instead of cumulative order snapshots.`,
          );
        if (old) return [];
        executions.set(key, payload);
      }
      return [
        {
          t,
          symbol,
          price,
          quantity,
          action,
          account,
          ref,
          row: i + 2,
          pnlText,
        },
      ];
    })
    .sort((a, b) => a.t - b.t || a.row - b.row);
  for (const row of rows) {
    const key = `${row.account}:${row.symbol}`,
      before = positions.get(key) || 0;
    const signed = /^(buy|b)$/.test(row.action) ? row.quantity : -row.quantity;
    const after = before + signed;
    const add = (
      kind: "entry" | "exit",
      side: "long" | "short",
      quantity: number,
    ) => {
      const id = `csv-${fingerprint(JSON.stringify([row.t, row.account, row.symbol, row.action, row.price, row.quantity, row.ref, kind]))}-${row.t}`;
      const event = eventSchema.safeParse({
        id,
        t: row.t,
        symbol: row.symbol,
        price: row.price,
        quantity,
        kind,
        side,
        source: "csv",
        provenance: "execution",
        ...(input.orderUpdateColumn && map.timestamp === input.orderUpdateColumn
          ? { timestampSource: "order-update" }
          : {}),
        ...(row.account ? { account: row.account } : {}),
        ...(kind === "exit" && row.pnlText
          ? { pnl: number(row.pnlText, row.row, "P&L") }
          : {}),
      });
      if (!event.success)
        throw new Error(
          `Row ${row.row}: execution values are outside the supported range.`,
        );
      events.push(event.data);
    };
    if (before && Math.sign(before) !== Math.sign(signed)) {
      add(
        "exit",
        before > 0 ? "long" : "short",
        Math.min(Math.abs(before), row.quantity),
      );
      if (Math.abs(signed) > Math.abs(before) + 1e-8)
        add("entry", after > 0 ? "long" : "short", Math.abs(after));
    } else add("entry", signed > 0 ? "long" : "short", row.quantity);
    positions.set(key, Math.abs(after) < 1e-8 ? 0 : after);
  }
  if (!events.length)
    throw new Error("This file has no filled executions to import.");
  if (events.length > 5000)
    throw new Error(
      "This export produces more than 5,000 events. Import a smaller complete period.",
    );
  return [...new Map(events.map((e) => [e.id, e])).values()];
}
