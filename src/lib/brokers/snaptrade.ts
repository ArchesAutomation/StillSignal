import { snapSignature } from "./security";
import { providerJson, ProviderError } from "./http";
import type { BrokerAdapter, BrokerCredentials, RawExecution } from "./model";
export async function snapRequest(
  path: string,
  credentials?: BrokerCredentials,
  body?: unknown,
  params: Record<string, string> = {},
  method?: string,
) {
  const query = new URLSearchParams({
    clientId: process.env.SNAPTRADE_CLIENT_ID!,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...params,
    ...(credentials
      ? { userId: credentials.userId!, userSecret: credentials.userSecret! }
      : {}),
  }).toString();
  return providerJson("https://api.snaptrade.com/api/v1" + path + "?" + query, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      Signature: snapSignature(
        "/api/v1" + path,
        query,
        body,
        process.env.SNAPTRADE_CONSUMER_KEY!,
      ),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
type Activity = {
  id: string;
  type: string;
  trade_date: string;
  price: number;
  units: number;
  fee?: number;
  currency?: { code: string };
  currency_universal_symbol?: unknown;
  symbol?: {
    id: string;
    symbol: string;
    exchange?: { code: string };
    type?: { code: string };
  };
  option_symbol?: {
    id: string;
    ticker: string;
    expiration_date: string;
    is_mini_option?: boolean;
  };
  [key: string]: unknown;
};
export function snapActivity(row: Activity): RawExecution | null {
  if (!["BUY", "SELL"].includes(row.type)) return null;
  const symbol = row.option_symbol?.ticker || row.symbol?.symbol;
  if (
    !symbol ||
    !row.currency?.code ||
    row.currency_universal_symbol ||
    !row.id
  )
    throw new ProviderError("UNRESOLVED_INSTRUMENT_OR_CURRENCY");
  const isOption = !!row.option_symbol,
    type = row.symbol?.type?.code?.toLowerCase();
  if (isOption && typeof row.option_symbol!.is_mini_option !== "boolean")
    throw new ProviderError("OPTION_CONTRACT_MULTIPLIER_REQUIRED");
  const assetClass = isOption
    ? "option"
    : type === "crypto"
      ? "crypto"
      : "equity";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(row.trade_date);
  const t = Date.parse(day ? row.trade_date + "T00:00:00Z" : row.trade_date);
  if (!Number.isFinite(t)) throw new ProviderError("INVALID_EXECUTION_TIME");
  return {
    id: row.id,
    t,
    action: row.type === "BUY" ? "buy" : "sell",
    price: row.price,
    quantity: Math.abs(row.units),
    currency: row.currency.code,
    fees: row.fee,
    timePrecision: day ? "day" : "millisecond",
    instrument: {
      id: row.option_symbol?.id || row.symbol!.id,
      symbol,
      assetClass,
      exchange: row.symbol?.exchange?.code,
      currency: row.currency.code,
      multiplier: isOption ? (row.option_symbol!.is_mini_option ? 10 : 100) : 1,
      ...(isOption
        ? {
            expiry: row.option_symbol!.expiration_date.slice(0, 10),
            providerSymbol: "O:" + symbol.replace(/\s/g, ""),
          }
        : {}),
    },
    raw: row,
  };
}
export const snaptrade: BrokerAdapter = {
  provider: "snaptrade",
  async accounts(credentials) {
    const [rows, authorizations] = await Promise.all([
      snapRequest("/accounts", credentials),
      snapRequest("/authorizations", credentials),
    ]);
    return rows
      .filter(
        (r: { brokerage_authorization: string }) =>
          !authorizations.find(
            (a: { id: string; disabled: boolean }) =>
              a.id === r.brokerage_authorization,
          )?.disabled,
      )
      .map(
        (r: {
          id: string;
          institution_name: string;
          institution_account_id?: string;
          number: string;
          name: string;
          balance?: { total?: { currency?: string } };
          is_paper: boolean;
        }) => {
          const number = r.institution_account_id || r.number || "";
          const currency = r.balance?.total?.currency;
          if (!currency || !/^[A-Z]{3}$/.test(currency))
            throw new ProviderError("UNRESOLVED_ACCOUNT_CURRENCY");
          return {
            id: "",
            providerId: r.id,
            institution: r.institution_name,
            number,
            name: r.name || r.institution_name,
            currency,
            environment: r.is_paper ? ("paper" as const) : ("live" as const),
            identityVerified: !!number && !/[*•]/.test(number),
          };
        },
      );
  },
  async executions(credentials, account, cursor) {
    if (process.env.SNAPTRADE_STABLE_IDS !== "true")
      throw new ProviderError("SNAPTRADE_STABLE_IDS_REQUIRED");
    const result = await snapRequest(
      "/accounts/" + encodeURIComponent(account.providerId) + "/activities",
      credentials,
      undefined,
      {
        offset: String(cursor.offset || 0),
        limit: "200",
        ...(cursor.startDate ? { startDate: String(cursor.startDate) } : {}),
      },
    );
    const rows: Activity[] = result.data;
    if (!Array.isArray(rows))
      throw new ProviderError("PROVIDER_CONTRACT_CHANGED");
    const complete = rows.length < 200;
    const records = rows
      .map(snapActivity)
      .filter((r): r is RawExecution => r !== null);
    return {
      records,
      complete,
      cursor: complete
        ? {
            offset: 0,
            startDate: new Date(Date.now() - 7 * 86400000)
              .toISOString()
              .slice(0, 10),
          }
        : { ...cursor, offset: Number(cursor.offset || 0) + rows.length },
    };
  },
  async disconnect(credentials) {
    const auths = await snapRequest("/authorizations", credentials);
    for (const auth of auths)
      await snapRequest(
        "/authorizations/" + encodeURIComponent(auth.id),
        credentials,
        undefined,
        {},
        "DELETE",
      );
  },
};
