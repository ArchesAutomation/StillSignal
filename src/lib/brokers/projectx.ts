import { providerJson, ProviderError } from "./http";
import type { BrokerAdapter, BrokerCredentials, RawExecution } from "./model";
export async function projectxRequest(
  c: BrokerCredentials,
  path: string,
  body: unknown,
) {
  const result = await providerJson("https://api.topstepx.com/api/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + c.accessToken,
    },
    body: JSON.stringify(body),
  });
  if (!result.success || result.errorCode)
    throw new ProviderError("PROJECTX_ACCESS_" + String(result.errorCode));
  return result;
}
export async function projectxLogin(c: BrokerCredentials) {
  const result = await projectxRequest(c, "Auth/loginKey", {
    userName: c.userName,
    apiKey: c.apiKey,
  });
  return {
    ...c,
    accessToken: result.token,
    expiresAt: Date.now() + 23 * 3600000,
  };
}
export const projectx: BrokerAdapter = {
  provider: "projectx",
  async accounts(c) {
    const result = await projectxRequest(c, "Account/search", {
      onlyActiveAccounts: false,
    });
    return result.accounts
      .filter((a: { isVisible: boolean }) => a.isVisible)
      .map((a: { id: number; name: string }) => ({
        id: "",
        providerId: String(a.id),
        institution: "TopstepX",
        number: String(a.id),
        name: a.name,
        currency: "USD",
        environment: c.environment || ("paper" as const),
        identityVerified: true,
      }));
  },
  async executions(c, account, cursor) {
    const start = Number(cursor.start ?? 0),
      end = Number(cursor.end ?? Date.now());
    const result = await projectxRequest(c, "Trade/search", {
      accountId: Number(account.providerId),
      startTimestamp: new Date(start).toISOString(),
      endTimestamp: new Date(end).toISOString(),
    });
    if (result.trades.length >= 250) {
      if (end - start <= 1) throw new ProviderError("RECONCILIATION_REQUIRED");
      const middle = Math.floor((start + end) / 2),
        pending = (cursor.pending as { start: number; end: number }[]) || [];
      return {
        records: [],
        complete: false,
        cursor: {
          ...cursor,
          start,
          end: middle,
          pending: [{ start: middle, end }, ...pending],
        },
      };
    }
    const contracts = new Map<
      string,
      { id: string; name: string; tickSize: number; tickValue: number }
    >();
    for (const id of new Set<string>(
      result.trades.map((r: { contractId: string }) => r.contractId),
    )) {
      const detail = await projectxRequest(c, "Contract/searchById", {
        contractId: id,
      });
      if (!detail.contract?.tickSize || !detail.contract?.tickValue)
        throw new ProviderError("UNRESOLVED_CONTRACT");
      contracts.set(id, detail.contract);
    }
    const records: RawExecution[] = result.trades.map(
      (r: Record<string, any>) => {
        const contract = contracts.get(r.contractId)!;
        return {
          id: String(r.id),
          t: Date.parse(r.creationTimestamp),
          action: r.side === 0 ? "buy" : "sell",
          price: r.price,
          quantity: r.size,
          currency: account.currency,
          fees: r.fees,
          pnl: r.profitAndLoss === null ? undefined : r.profitAndLoss,
          voided: r.voided,
          instrument: {
            id: r.contractId,
            symbol: contract.name,
            assetClass: "future",
            currency: account.currency,
            multiplier: contract.tickValue / contract.tickSize,
            providerSymbol: r.contractId,
          },
          raw: r,
        };
      },
    );
    const pending = (cursor.pending as { start: number; end: number }[]) || [];
    const complete = pending.length === 0;
    return {
      records,
      complete,
      cursor: complete
        ? { start: Math.max(0, Date.now() - 7 * 86400000), end: Date.now() }
        : { ...pending[0], pending: pending.slice(1) },
    };
  },
};
