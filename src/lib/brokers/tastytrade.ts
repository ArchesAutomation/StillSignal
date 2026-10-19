import { z } from "zod";
import { providerJson, ProviderError } from "./http";
import type { BrokerAdapter, BrokerCredentials, RawExecution } from "./model";
import type { Instrument } from "../model";
export const tastyOrigin = (c: BrokerCredentials) =>
  c.environment === "paper"
    ? "https://api.cert.tastyworks.com"
    : "https://api.tastyworks.com";
export const tastyHeaders = {
  "User-Agent": "TraderPulse/0.4.1",
  Accept: "application/json",
};
export function tastyRequest(c: BrokerCredentials, path: string) {
  return providerJson(tastyOrigin(c) + path, {
    headers: { ...tastyHeaders, Authorization: "Bearer " + c.accessToken },
  });
}
const transaction = z
  .object({
    id: z.number().int().positive(),
    "account-number": z.string(),
    "transaction-type": z.string(),
    action: z.string().optional(),
  })
  .passthrough();
const execution = transaction.extend({
  action: z.enum([
    "Buy",
    "Sell",
    "Buy to Open",
    "Buy to Close",
    "Sell to Open",
    "Sell to Close",
  ]),
  "executed-at": z.iso.datetime({ offset: true }),
  symbol: z.string().min(1),
  "instrument-type": z.string(),
  price: z.coerce.number().nonnegative(),
  quantity: z.coerce.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export function tastyFill(row: unknown, instrument: Instrument): RawExecution {
  const r = execution.parse(row);
  // Reversal records need their original execution reconciled, not a second fill.
  if (r["reverses-id"]) throw new ProviderError("RECONCILIATION_REQUIRED");
  const fees = [
    "commission",
    "clearing-fees",
    "regulatory-fees",
    "proprietary-index-option-fees",
    "other-charge",
    "currency-conversion-fees",
  ];
  let total = 0,
    hasFees = false;
  if (r["is-estimated-fee"] !== true)
    for (const name of fees) {
      if (r[name] === undefined) continue;
      const n = Number(r[name]),
        effect = r[name + "-effect"];
      if (
        !Number.isFinite(n) ||
        n < 0 ||
        !["Debit", "Credit", "None"].includes(String(effect))
      )
        throw new ProviderError("UNRESOLVED_FEES");
      total += effect === "Credit" ? -n : effect === "Debit" ? n : 0;
      hasFees = true;
    }
  return {
    id: String(r.id),
    t: Date.parse(r["executed-at"]),
    action: r.action.startsWith("Buy") ? "buy" : "sell",
    price: r.price,
    quantity: r.quantity,
    instrument,
    currency: r.currency,
    ...(hasFees ? { fees: total } : {}),
    ...(r.action.endsWith("to Open")
      ? { openedQuantity: r.quantity, closedQuantity: 0 }
      : r.action.endsWith("to Close")
        ? { openedQuantity: 0, closedQuantity: r.quantity }
        : {}),
    raw: r,
  };
}
export const tastytrade: BrokerAdapter = {
  provider: "tastytrade",
  async accounts(c) {
    const response = await tastyRequest(c, "/customers/me/accounts");
    const rows = z
      .array(
        z.object({
          account: z.object({
            "account-number": z.string().min(1),
            "is-closed": z.boolean(),
            nickname: z.string().optional(),
          }),
        }),
      )
      .parse(response.data?.items);
    const accounts = [];
    for (const { account: a } of rows.filter((r) => !r.account["is-closed"])) {
      const balances = await tastyRequest(
        c,
        "/accounts/" + encodeURIComponent(a["account-number"]) + "/balances",
      );
      const balance = z
        .object({
          "account-number": z.literal(a["account-number"]),
          currency: z.string().regex(/^[A-Z]{3}$/),
        })
        .parse(balances.data);
      accounts.push({
        id: "",
        providerId: a["account-number"],
        number: a["account-number"],
        institution: "tastytrade",
        name: a.nickname || "tastytrade · " + a["account-number"].slice(-4),
        currency: balance.currency,
        environment: c.environment || "live",
        identityVerified: true,
      });
    }
    return accounts;
  },
  async executions(c, account, cursor) {
    const end = Number(cursor.end || Date.now());
    const page = Number(cursor.page || 0);
    const params = new URLSearchParams({
      "per-page": "100",
      "page-offset": String(page),
      sort: "Asc",
      type: "Trade",
      "start-at": new Date(Number(cursor.start || 0)).toISOString(),
      "end-at": new Date(end).toISOString(),
    });
    const result = await tastyRequest(
      c,
      "/accounts/" +
        encodeURIComponent(account.providerId) +
        "/transactions?" +
        params,
    );
    const rows = z.array(transaction).max(100).parse(result.data?.items);
    if (rows.some((r) => r["account-number"] !== account.providerId))
      throw new ProviderError("PROVIDER_CONTRACT_CHANGED");
    const records: RawExecution[] = [];
    const cache = new Map<string, Instrument>();
    for (const row of rows) {
      if (row["transaction-type"] !== "Trade") continue;
      if (row.action === "Allocate") continue;
      const r = execution.parse(row),
        symbol = r.symbol,
        type = r["instrument-type"];
      const key = type + ":" + symbol;
      if (!cache.has(key)) {
        const route = (
          {
            Equity: "equities",
            "Equity Option": "equity-options",
            Future: "futures",
            "Future Option": "future-options",
          } as Record<string, string>
        )[type];
        if (!route) throw new ProviderError("UNRESOLVED_INSTRUMENT");
        const d = (
          await tastyRequest(
            c,
            "/instruments/" + route + "/" + encodeURIComponent(symbol),
          )
        ).data;
        if (d?.symbol !== symbol)
          throw new ProviderError("PROVIDER_CONTRACT_CHANGED");
        const multiplier =
          type === "Equity"
            ? 1
            : Number(
                type === "Equity Option"
                  ? d["shares-per-contract"]
                  : type === "Future"
                    ? d["notional-multiplier"]
                    : d.multiplier,
              );
        const expiry = d["expiration-date"];
        if (
          !Number.isFinite(multiplier) ||
          multiplier <= 0 ||
          (type !== "Equity" && !expiry)
        )
          throw new ProviderError("UNRESOLVED_CONTRACT");
        cache.set(key, {
          id: "tastytrade:" + key,
          symbol,
          assetClass:
            type === "Equity"
              ? "equity"
              : type === "Future"
                ? "future"
                : "option",
          exchange: d.exchange || d["listed-market"],
          currency: r.currency,
          multiplier,
          ...(expiry ? { expiry } : {}),
          providerSymbol:
            type === "Equity Option"
              ? "O:" + symbol.replace(/\s/g, "")
              : symbol,
        });
      }
      records.push(tastyFill(r, cache.get(key)!));
    }
    const complete = rows.length < 100;
    return {
      records,
      complete,
      cursor: complete
        ? { start: Math.max(0, end - 7 * 86400000) }
        : { ...cursor, end, page: page + 1 },
    };
  },
};
