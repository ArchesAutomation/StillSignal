import type { BrokerAdapter, BrokerCredentials, RawExecution } from "./model";
import { providerJson, ProviderError } from "./http";
export async function tradovateRequest(c: BrokerCredentials, path: string) {
  return providerJson(
    (c.environment === "paper"
      ? "https://demo.tradovateapi.com"
      : "https://live.tradovateapi.com") +
      "/v1/" +
      path,
    { headers: { Authorization: "Bearer " + c.accessToken } },
  );
}
export const tradovate: BrokerAdapter = {
  provider: "tradovate",
  async accounts(c) {
    const [accounts, currencies] = await Promise.all([
      tradovateRequest(c, "account/list"),
      tradovateRequest(c, "currency/list"),
    ]);
    return accounts.map(
      (a: { id: number; name: string; currencyId: number }) => {
        const currency = currencies.find(
          (v: { id: number }) => v.id === a.currencyId,
        )?.name;
        if (!currency || !/^[A-Z]{3}$/.test(currency))
          throw new ProviderError("UNRESOLVED_ACCOUNT_CURRENCY");
        return {
          id: "",
          providerId: String(a.id),
          institution: "Tradovate",
          number: String(a.id),
          name: a.name,
          currency,
          environment: c.environment || "live",
          identityVerified: true,
        };
      },
    );
  },
  async executions(c, account, cursor) {
    const [fills, orders] = await Promise.all([
      tradovateRequest(c, "fill/list"),
      tradovateRequest(c, "order/list"),
    ]);
    const owned = new Set(
      orders
        .filter(
          (o: { accountId: number }) =>
            String(o.accountId) === account.providerId,
        )
        .map((o: { id: number }) => o.id),
    );
    const rows = fills
      .filter((f: { orderId: number }) => owned.has(f.orderId))
      .sort((a: { id: number }, b: { id: number }) => a.id - b.id);
    const start = Number(cursor.offset || 0),
      page = rows.slice(start, start + 200);
    const records: RawExecution[] = [];
    for (const f of page) {
      const contract = await tradovateRequest(
        c,
        "contract/item?id=" + f.contractId,
      );
      const maturity = await tradovateRequest(
        c,
        "contractMaturity/item?id=" + contract.contractMaturityId,
      );
      const product = await tradovateRequest(
        c,
        "product/item?id=" + maturity.productId,
      );
      const currency = await tradovateRequest(
        c,
        "currency/item?id=" + product.currencyId,
      );
      if (!product.valuePerPoint || !currency.name)
        throw new ProviderError("UNRESOLVED_CONTRACT");
      records.push({
        id: String(f.id),
        t: Date.parse(f.timestamp),
        action: f.action === "Buy" ? "buy" : "sell",
        price: f.price,
        quantity: f.qty,
        currency: currency.name,
        voided: !f.active,
        instrument: {
          id: "tradovate:" + contract.id,
          symbol: contract.name,
          assetClass: "future",
          currency: currency.name,
          multiplier: product.valuePerPoint,
          expiry: maturity.expirationDate?.slice(0, 10),
          providerSymbol: contract.name,
        },
        raw: f,
      });
    }
    const complete = start + page.length >= rows.length;
    // Reconcile the complete retained list on each cycle, including amended/voided fills.
    return {
      records,
      complete,
      cursor: { offset: complete ? 0 : start + page.length },
    };
  },
};
