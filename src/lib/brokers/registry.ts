import { directDetails, snaptradeBlockedReason } from "./connection-policy";
import type { BrokerProvider } from "./model";
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
    method: "unavailable",
    prerequisite: snaptradeBlockedReason,
    freshness: "Daily transactions, delayed by one day; no live-session sync",
    docs: "https://docs.snaptrade.com/docs/oauth-apps",
    env: [],
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
      "IBKR third-party API compliance approval and OAuth onboarding, or a licensed TWS/Client Portal gateway relay with read-only settings. Choose SnapTrade separately to review Personal sharing requirements.",
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
  return brokerRoutes.map((route) => {
    const missing = route.env.filter((key) =>
      /_ENABLED$|_APPROVED$/.test(key) ? env[key] !== "true" : !env[key],
    );
    const reasons = [
      ...(route.method === "unavailable" ? [route.prerequisite] : []),
      ...(route.method !== "unavailable" && env.BROKER_SERVICES_ENABLED === "false"
        ? ["The broker backend is not enabled in this deployment (BROKER_SERVICES_ENABLED)."] : []),
      ...(route.method !== "unavailable" && !encryptionReady ? ["Server credential encryption is not configured (BROKER_ENCRYPTION_KEY)."] : []),
      ...(route.method === "oauth" && !/^https:\/\/[^/?#]+$/.test(env.APP_ORIGIN || "")
        ? ["The secure OAuth callback origin is not configured (APP_ORIGIN)."] : []),
      ...(missing.length ? ["Missing configuration or approval: " + missing.join(", ") + "."] : []),
    ];
    return {
      ...route,
      connectionType: route.id === "snaptrade" ? "SnapTrade" : "Direct",
      ...(directDetails[route.id] || {
        assets: "Brokerage equities/options where supported; eligibility varies",
        history: "Daily transactions, delayed by one day; broker history varies",
        live: "Unavailable: no intraday transaction sync or paid trade detection",
        payer: "User owns the Personal account; Trade Pulse OAuth preview pricing is temporary and future app costs are unknown. Commercial per-user billing is disabled",
      }),
      unavailableReason: reasons.join(" "),
      nextAction: reasons.length
        ? "Import a brokerage CSV now, or ask the workspace administrator to complete the requirements above."
        : route.method === "key" ? "Follow setup instructions, then enter your own API credentials."
        : "Follow setup instructions, then sign in at your broker and approve account read access.",
      environments: (route.id === "tastytrade" &&
        !(env.TASTYTRADE_PAPER_CLIENT_ID && env.TASTYTRADE_PAPER_CLIENT_SECRET)
        ? ["live"] : ["live", "paper"]) as ("live" | "paper")[],
      available: reasons.length === 0,
    };
  });
}
