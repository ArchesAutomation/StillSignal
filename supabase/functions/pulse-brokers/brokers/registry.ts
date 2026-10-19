import type { BrokerProvider } from "./model.ts";
export const brokerRoutes: {
  id: BrokerProvider;
  name: string;
  method: "hosted" | "oauth" | "key" | "unavailable";
  prerequisite: string;
  freshness: string;
  docs: string;
  env: string[];
}[] = [
  {
    id: "alpaca",
    name: "Alpaca",
    method: "oauth",
    prerequisite:
      "Registered Alpaca Connect OAuth application, approved commercial use, and registered callback URL.",
    freshness:
      "Individual fill history with execution timestamps; periodic sync",
    docs: "https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api",
    env: ["ALPACA_CLIENT_ID", "ALPACA_CLIENT_SECRET", "ALPACA_APPROVED"],
  },
  {
    id: "tastytrade",
    name: "tastytrade",
    method: "oauth",
    prerequisite:
      "Verified tastytrade third-party OAuth application, read scope, registered callback, and customer 2FA.",
    freshness:
      "Individual transaction history with execution timestamps; periodic sync",
    docs: "https://developer.tastytrade.com/docs/authentication/oauth2/",
    env: [
      "TASTYTRADE_CLIENT_ID",
      "TASTYTRADE_CLIENT_SECRET",
      "TASTYTRADE_APPROVED",
    ],
  },
  {
    id: "snaptrade",
    name: "SnapTrade · Global brokerages",
    method: "hosted",
    prerequisite:
      "Commercial SnapTrade client ID and consumer key; allowed institution catalog; stable transaction-ID agreement before automatic history ingestion.",
    freshness:
      "Daily activity history; trade detection needs an additional subscription",
    docs: "https://docs.snaptrade.com/docs/getting-started",
    env: [
      "SNAPTRADE_CLIENT_ID",
      "SNAPTRADE_CONSUMER_KEY",
      "SNAPTRADE_COMMERCIAL_ENABLED",
    ],
  },
  {
    id: "tradestation",
    name: "TradeStation",
    method: "oauth",
    prerequisite:
      "Approved commercial OAuth app, registered callback, ReadAccount scope, and an execution-detail feed agreement. Order summaries alone cannot reconstruct individual fills.",
    freshness:
      "Account sync; individual execution ingest requires approved feed",
    docs: "https://api.tradestation.com/docs/",
    env: [
      "TRADESTATION_CLIENT_ID",
      "TRADESTATION_CLIENT_SECRET",
      "TRADESTATION_APPROVED",
    ],
  },
  {
    id: "tradovate",
    name: "Tradovate / NinjaTrader",
    method: "oauth",
    prerequisite:
      "Approved Tradovate partner app, OAuth client and registered callback. NinjaTrader accounts must be provisioned on the eligible Tradovate backend.",
    freshness: "Periodic fill history; sockets require a persistent relay",
    docs: "https://partner.tradovate.com/",
    env: [
      "TRADOVATE_CLIENT_ID",
      "TRADOVATE_CLIENT_SECRET",
      "TRADOVATE_APPROVED",
    ],
  },
  {
    id: "ibkr",
    name: "Interactive Brokers · Native",
    method: "unavailable",
    prerequisite:
      "IBKR third-party API compliance approval and OAuth onboarding, or a licensed TWS/Client Portal gateway relay with read-only settings. SnapTrade is the hosted route when eligible.",
    freshness: "Unavailable until approved relay is installed",
    docs: "https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/",
    env: [],
  },
  {
    id: "projectx",
    name: "ProjectX / TopstepX",
    method: "key",
    prerequisite:
      "Firm-enabled Gateway API subscription, platform username and API key. This implementation supports TopstepX; other firms require their approved connection URLs.",
    freshness:
      "Periodic historical trade sync; firm and account eligibility vary",
    docs: "https://gateway.docs.projectx.com/docs/intro/",
    env: ["PROJECTX_ENABLED"],
  },
  {
    id: "rithmic",
    name: "Rithmic",
    method: "unavailable",
    prerequisite:
      "R | API+ or R | Protocol developer kit, application conformance approval, commercial license, system identifier, and persistent relay. An account login alone is insufficient.",
    freshness: "Unavailable until licensed SDK relay is installed",
    docs: "https://www.rithmic.com/apis",
    env: [],
  },
  {
    id: "oanda",
    name: "OANDA v20",
    method: "key",
    prerequisite:
      "Eligible v20 account and commercial application approval. Personal tokens can carry trading privileges; TraderPulse invokes read endpoints only. Global Markets and TMS accounts are ineligible.",
    freshness:
      "Periodic transaction sync with durable transaction-ID checkpoint",
    docs: "https://developer.oanda.com/rest-live-v20/introduction/",
    env: ["OANDA_ENABLED"],
  },
];
export function routeAvailability(env: Record<string, string | undefined>) {
  const encryptionReady = /^[A-Za-z0-9+/]{43}=$/.test(
    env.BROKER_ENCRYPTION_KEY || "",
  );
  return brokerRoutes.map((route) => ({
    ...route,
    environments: (route.id === "tastytrade" &&
    !(env.TASTYTRADE_PAPER_CLIENT_ID && env.TASTYTRADE_PAPER_CLIENT_SECRET)
      ? ["live"]
      : ["live", "paper"]) as ("live" | "paper")[],
    available:
      encryptionReady &&
      route.method !== "unavailable" &&
      // OAuth and hosted flows must have an explicitly configured redirect origin.
      (route.method === "key" ||
        /^https:\/\/[^/?#]+$/.test(env.APP_ORIGIN || "")) &&
      route.env.every((key) =>
        /_ENABLED$|_APPROVED$/.test(key) ? env[key] === "true" : !!env[key],
      ),
  }));
}
