import { providerJson, ProviderError } from "./http";
import type { BrokerAdapter, BrokerCredentials, RawExecution } from "./model";
const base = (c: BrokerCredentials) =>
  c.environment === "paper"
    ? "https://api-fxpractice.oanda.com"
    : "https://api-fxtrade.oanda.com";
const headers = (c: BrokerCredentials) => ({
  Authorization: "Bearer " + c.accessToken,
});
export async function oandaRequest(c: BrokerCredentials, path: string) {
  return providerJson(base(c) + path, { headers: headers(c) });
}
export function oandaFill(
  row: Record<string, any>,
  currency: string,
): RawExecution | null {
  if (row.type !== "ORDER_FILL") return null;
  const units = Number(row.units),
    closing = [
      ...(row.tradesClosed || []),
      ...(row.tradeReduced ? [row.tradeReduced] : []),
    ].reduce((sum, trade) => sum + Math.abs(Number(trade.units)), 0);
  return {
    id: String(row.id),
    t: Date.parse(row.time),
    action: units > 0 ? "buy" : "sell",
    price: Number(row.price),
    quantity: Math.abs(units),
    currency,
    fees: Number(row.commission || 0) + Number(row.guaranteedExecutionFee || 0),
    pnl: row.pl === undefined ? undefined : Number(row.pl),
    openedQuantity: row.tradeOpened
      ? Math.abs(Number(row.tradeOpened.units))
      : 0,
    closedQuantity: closing,
    instrument: {
      id: "oanda:" + row.instrument,
      symbol: row.instrument,
      assetClass: "forex",
      exchange: "OANDA",
      currency,
      multiplier: 1,
      providerSymbol: row.instrument,
    },
    raw: row,
  };
}
export const oanda: BrokerAdapter = {
  provider: "oanda",
  async accounts(c) {
    const result = await oandaRequest(c, "/v3/accounts");
    const accounts = [];
    for (const row of result.accounts) {
      const detail = await oandaRequest(
        c,
        "/v3/accounts/" + encodeURIComponent(row.id) + "/summary",
      );
      accounts.push({
        id: "",
        providerId: row.id,
        institution: "OANDA",
        number: row.id,
        name: detail.account.alias || row.id,
        currency: detail.account.currency,
        environment: c.environment || ("live" as const),
        identityVerified: true,
      });
    }
    return accounts;
  },
  async executions(c, account, cursor) {
    const prefix = "/v3/accounts/" + encodeURIComponent(account.providerId);
    if (cursor.scanFrom) {
      const from = BigInt(String(cursor.scanFrom)),
        to = BigInt(String(cursor.scanTo)),
        last = from + 199n < to ? from + 199n : to;
      const result = await oandaRequest(
        c,
        prefix + "/transactions/idrange?from=" + from + "&to=" + last,
      );
      return {
        records: result.transactions
          .map((row: Record<string, any>) => oandaFill(row, account.currency))
          .filter(Boolean),
        complete: last >= to,
        cursor:
          last >= to
            ? { since: String(to) }
            : { scanFrom: String(last + 1n), scanTo: String(to) },
      };
    }
    if (cursor.page) {
      const page = new URL(String(cursor.page));
      if (
        page.origin !== base(c) ||
        page.pathname !== prefix + "/transactions/idrange"
      )
        throw new ProviderError("INVALID_CURSOR");
      const result = await providerJson(page.href, { headers: headers(c) });
      const pages = (cursor.pages as string[]) || [],
        records = result.transactions
          .map((row: Record<string, any>) => oandaFill(row, account.currency))
          .filter(Boolean);
      return {
        records,
        complete: pages.length === 0,
        cursor: pages.length
          ? { ...cursor, page: pages[0], pages: pages.slice(1) }
          : { since: cursor.lastTransactionID },
      };
    }
    if (cursor.since) {
      const result = await oandaRequest(
        c,
        prefix +
          "/transactions/sinceid?id=" +
          encodeURIComponent(String(cursor.since)),
      );
      if (result.transactions.length > 250)
        return {
          records: [],
          complete: false,
          cursor: {
            scanFrom: String(BigInt(String(cursor.since)) + 1n),
            scanTo: result.lastTransactionID,
          },
        };
      return {
        records: result.transactions
          .map((row: Record<string, any>) => oandaFill(row, account.currency))
          .filter(Boolean),
        complete: true,
        cursor: { since: result.lastTransactionID },
      };
    }
    const result = await oandaRequest(c, prefix + "/transactions?pageSize=200");
    const pages = result.pages || [];
    return {
      records: [],
      complete: pages.length === 0,
      cursor: pages.length
        ? {
            page: pages[0],
            pages: pages.slice(1),
            lastTransactionID: result.lastTransactionID,
          }
        : { since: result.lastTransactionID },
    };
  },
};
