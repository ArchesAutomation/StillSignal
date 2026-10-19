import { ProviderError } from "./http.ts";
import type { BrokerAdapter, RawExecution } from "./model.ts";
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
// Legacy commercial requests are disabled for onboarding, workers and disconnects.
// Personal OAuth needs its own approved, cost-reviewed integration; it must never
// reuse commercial API keys or create subordinate SnapTrade users.
async function blocked(): Promise<never> {
  throw new ProviderError("SNAPTRADE_PERSONAL_OAUTH_REQUIRED");
}
export const snaptrade: BrokerAdapter = {
  provider: "snaptrade",
  accounts: blocked,
  executions: blocked,
  disconnect: blocked,
};
