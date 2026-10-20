// No commercial-key fallback or environment switch may opt customers into billing.
export const snaptradeBlockedReason =
  "SnapTrade Personal sharing is disabled in Trade Pulse. It requires a registered confidential OAuth app under a Commercial developer account and production KYC approval. OAuth access is a limited preview; future app pricing is undecided. An approved app and a verified arrangement without recurring Trade Pulse per-user costs are required before this path can be implemented and enabled. Import a brokerage CSV now.";

export const connectionTypes = [
  { id: "direct", name: "Direct", description: "Connect your own brokerage account using its supported API or OAuth." },
  { id: "snaptrade", name: "SnapTrade", description: "Share your own SnapTrade Personal brokerage accounts. Disabled pending app approval and cost review." },
  { id: "tradingview", name: "TradingView", description: "Send price, indicator, or Pine strategy alerts. Events are not guaranteed broker fills." },
  { id: "csv", name: "CSV", description: "Import brokerage transactions manually from a file you export." },
] as const;
export type ConnectionType = typeof connectionTypes[number]["id"];

// Curated brokerage-only examples from support.snaptrade.com/brokerages, checked 2026-10-19.
// This is not an enabled institution catalog. Personal account/region eligibility must be checked upstream.
export const snaptradeBrokerages = [
  "E*Trade", "Fidelity", "Interactive Brokers", "Robinhood", "Schwab Read-Only",
  "Vanguard US", "Wealthsimple", "Webull", "Webull Canada",
];

export const directDetails: Record<string, { assets: string; history: string; live: string; payer: string }> = {
  alpaca: { assets: "Equities, options", history: "Individual fills; broker retention applies", live: "Near-real-time polling when the sync worker is running; no streaming in this app", payer: "User pays any broker/account fees; Trade Pulse's OAuth app requires approval" },
  tastytrade: { assets: "Equities, options, futures", history: "Transactions with execution timestamps; broker retention applies", live: "Near-real-time polling when the sync worker is running; no streaming in this app", payer: "User pays broker/account fees; Trade Pulse's OAuth app requires approval" },
  tradovate: { assets: "Futures", history: "Historical individual fills; broker retention applies", live: "Near-real-time polling when the sync worker is running; socket relay is not implemented", payer: "User pays applicable broker/API fees; Trade Pulse's partner app requires approval" },
  tradestation: { assets: "Equities, options, futures", history: "Account linking only; execution-detail feed agreement is missing. Use CSV for trades", live: "Unavailable: individual execution feed is not implemented", payer: "User pays broker/data fees; Trade Pulse needs commercial app and feed approval" },
  projectx: { assets: "Futures", history: "Historical trades for eligible TopstepX accounts", live: "Near-real-time polling when the sync worker is running; no streaming in this app", payer: "User pays any firm-required Gateway API subscription" },
  oanda: { assets: "Forex", history: "v20 transactions with a durable transaction-ID checkpoint", live: "Near-real-time polling when the sync worker is running; no streaming in this app", payer: "User pays applicable broker/API fees; account must be v20 eligible" },
  ibkr: { assets: "Equities, options, futures, forex", history: "Unavailable here until an approved direct integration is implemented; use CSV", live: "Unavailable: approved gateway relay is not installed", payer: "User pays applicable broker/data fees; Trade Pulse requires third-party approval/relay licensing" },
  rithmic: { assets: "Futures", history: "Unavailable here until a licensed SDK relay is implemented; use CSV", live: "Unavailable: licensed persistent relay is not installed", payer: "User pays account/data fees; Trade Pulse requires SDK conformance and commercial licensing" },
};
