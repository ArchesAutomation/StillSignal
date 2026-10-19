import { z } from "zod";
import { providerJson, ProviderError } from "./http";
import type { BrokerAdapter, BrokerCredentials, RawExecution } from "./model";
import type { Instrument } from "../model";

export const alpacaOrigin = (c: BrokerCredentials) =>
  c.environment === "paper"
    ? "https://paper-api.alpaca.markets"
    : "https://api.alpaca.markets";
export function alpacaRequest(c: BrokerCredentials, path: string) {
  return providerJson(alpacaOrigin(c) + "/v2/" + path, {
    headers: { Authorization: "Bearer " + c.accessToken },
  });
}
const fillSchema = z
  .object({
    id: z.string().min(1),
    activity_type: z.literal("FILL"),
    transaction_time: z.iso.datetime({ offset: true }),
    symbol: z.string().min(1),
    side: z.enum(["buy", "sell"]),
    qty: z.coerce.number().positive(),
    price: z.coerce.number().nonnegative(),
  })
  .passthrough();
export function alpacaFill(
  row: unknown,
  instrument: Instrument,
  currency: string,
): RawExecution {
  const r = fillSchema.parse(row);
  return {
    id: r.id,
    t: Date.parse(r.transaction_time),
    action: r.side,
    price: r.price,
    quantity: r.qty,
    instrument,
    currency,
    raw: r,
  };
}
export const alpaca: BrokerAdapter = {
  provider: "alpaca",
  async accounts(c) {
    const a = z
      .object({
        id: z.uuid(),
        account_number: z.string().min(1),
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .parse(await alpacaRequest(c, "account"));
    if (a.currency !== "USD") throw new ProviderError("UNRESOLVED_CURRENCY");
    return [
      {
        id: "",
        providerId: a.id,
        institution: "Alpaca",
        number: a.account_number,
        name: "Alpaca · " + a.account_number.slice(-4),
        currency: a.currency,
        environment: c.environment || "live",
        identityVerified: true,
      },
    ];
  },
  async executions(c, account, cursor) {
    // Freeze a bounded snapshot while paging. Overlap recent history on later passes.
    const end = Number(cursor.end || Date.now());
    const query = new URLSearchParams({
      activity_types: "FILL",
      direction: "asc",
      page_size: "100",
      after: new Date(Number(cursor.start || 0)).toISOString(),
      until: new Date(end).toISOString(),
      ...(cursor.token ? { page_token: String(cursor.token) } : {}),
    });
    const rows = z
      .array(fillSchema)
      .max(100)
      .parse(await alpacaRequest(c, "account/activities?" + query));
    const instruments = new Map<string, Instrument>();
    for (const symbol of new Set(rows.map((r) => r.symbol))) {
      const asset = z
        .object({
          id: z.uuid(),
          symbol: z.string(),
          class: z.string(),
          exchange: z.string().min(1),
        })
        .parse(await alpacaRequest(c, "assets/" + encodeURIComponent(symbol)));
      if (asset.symbol !== symbol)
        throw new ProviderError("PROVIDER_CONTRACT_CHANGED");
      let instrument: Instrument;
      if (asset.class === "us_equity") {
        instrument = {
          id: "alpaca:" + asset.id,
          symbol,
          assetClass: "equity",
          exchange: asset.exchange,
          currency: account.currency,
          multiplier: 1,
          providerSymbol: symbol,
        };
      } else if (asset.class === "us_option") {
        const contract = z
          .object({
            id: z.uuid(),
            symbol: z.string(),
            multiplier: z.coerce.number().positive(),
            expiration_date: z.iso.date(),
          })
          .parse(
            await alpacaRequest(
              c,
              "options/contracts/" + encodeURIComponent(symbol),
            ),
          );
        if (contract.symbol !== symbol)
          throw new ProviderError("PROVIDER_CONTRACT_CHANGED");
        instrument = {
          id: "alpaca:" + contract.id,
          symbol,
          assetClass: "option",
          exchange: asset.exchange,
          currency: account.currency,
          multiplier: contract.multiplier,
          expiry: contract.expiration_date,
          providerSymbol: "O:" + symbol,
        };
      } else throw new ProviderError("UNRESOLVED_INSTRUMENT");
      instruments.set(symbol, instrument);
    }
    const complete = rows.length < 100;
    const token = rows.at(-1)?.id;
    if (!complete && token === cursor.token)
      throw new ProviderError("PROVIDER_CONTRACT_CHANGED");
    return {
      records: rows.map((r) =>
        alpacaFill(r, instruments.get(r.symbol)!, account.currency),
      ),
      complete,
      cursor: complete
        ? { start: Math.max(0, end - 7 * 86400000) }
        : { ...cursor, end, token },
    };
  },
};
