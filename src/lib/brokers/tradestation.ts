import type { BrokerAdapter, BrokerCredentials } from "./model";
import { providerJson, ProviderError } from "./http";
export async function tradeStationRequest(c: BrokerCredentials, path: string) {
  return providerJson(
    (c.environment === "paper"
      ? "https://sim-api.tradestation.com"
      : "https://api.tradestation.com") +
      "/v3/" +
      path,
    { headers: { Authorization: "Bearer " + c.accessToken } },
  );
}
export const tradestation: BrokerAdapter = {
  provider: "tradestation",
  async accounts(c) {
    const result = await tradeStationRequest(c, "brokerage/accounts");
    return result.Accounts.map(
      (a: { AccountID: string; Currency?: string; AccountType: string }) => {
        if (!a.Currency || !/^[A-Z]{3}$/.test(a.Currency))
          throw new ProviderError("UNRESOLVED_ACCOUNT_CURRENCY");
        return {
          id: "",
          providerId: a.AccountID,
          institution: "TradeStation",
          number: a.AccountID,
          name: a.AccountType + " · " + a.AccountID.slice(-4),
          currency: a.Currency,
          environment: c.environment || "live",
          identityVerified: true,
        };
      },
    );
  },
  async executions() {
    // The public order API exposes cumulative fill quantities. Do not turn snapshots into invented fills.
    throw new ProviderError("TRADESTATION_EXECUTION_FEED_REQUIRED");
  },
};
