# Broker and market access matrix

Verified against official documentation on October 13, 2026. This branch extends TraderPulse 0.4.1; production has not been migrated or released.

## Implemented connection paths

| Route | Implementation | Required before use | Actual freshness |
|---|---|---|---|
| SnapTrade commercial | Signed requests, tenant registration, hosted read-only portal, dynamic application institution catalog, account discovery, paginated activities, signed webhook receipt, durable polling | Commercial client ID/consumer key; production-access approval; stable activity-ID arrangement; unmasked institution account identity | Activity endpoint is **daily data**, polled every 6 hours. Trade detection/live order updates require separate provider capabilities and are not claimed here. |
| TradeStation native | ReadAccount/MarketData OAuth, encrypted tokens and refresh, accounts and market bars | Approved commercial app, exact registered callback. **Individual execution ingestion remains unavailable:** order snapshots contain cumulative quantities; a contracted execution-detail feed or approved reporting adapter is needed. | Account and market-data reads. No fabricated individual fills. |
| Tradovate / eligible NinjaTrader | Partner OAuth, token renewal, account/fill/contract/maturity/product/currency reads, pagination over retained fill list, amendment/void reconciliation | Approved partner app, client ID/secret, callback; backend account eligibility and provider permissions | Periodic sync, normally 60 seconds; available retained REST history. No permanent sockets in Vercel. |
| ProjectX / TopstepX | API-key authentication, encrypted 24-hour token with renewal, accounts, recursively subdivided history windows, contract resolution, void handling | Firm API subscription, platform **username**, API key, firm agreements. TopstepX URLs only; other ProjectX firms require their approved URLs and an adapter addition. | Periodic sync, normally 60 seconds; starting positions without explicit evidence remain unknown. |
| OANDA v20 | Encrypted token, live/practice endpoints, account currencies, transaction pagination/checkpoint, explicit trade-open/close/reduction context, entitled candles | Eligible v20 account, API token, commercial-use approval. Personal tokens can carry trading privileges; this app calls read endpoints only. Global Markets/TMS divisions are excluded by provider docs. | Periodic transaction sync, normally 60 seconds. Streams require a persistent relay. |
| Interactive Brokers native | Honest unavailable route through the common adapter boundary | Third-party compliance approval, OAuth onboarding, or licensed read-only TWS/Client Portal gateway relay. No approved relay/credentials supplied. Use SnapTrade where eligible. | Unavailable pending approved native relay. |
| Rithmic | Honest unavailable route through the common adapter boundary | R API+/R Protocol dev kit, commercial license, application conformance approval, system ID, eligible broker/prop account, and persistent SDK relay | Unavailable pending licensed SDK/relay. |

Availability is derived from actual server configuration. Tokens never enter journal JSON, IndexedDB, exports, or logs. Native order-placement endpoints are not exposed. Ambiguous alternate routes are blocked until account identity is reconciled.

## Discussed SnapTrade institutions

The app does **not** ship a hardcoded list of connectable brokers. It uses the application partner endpoint's allowed_brokerages catalog, including enabled regional and paper variants.

| Discussed institutions | Official access-guide status | Prerequisite |
|---|---|---|
| Interactive Brokers, Robinhood, Webull US/CA, E*TRADE, tastytrade, Public, Moomoo | Listed in current guide | SnapTrade production-access approval; exact institution must appear in the application catalog |
| Questrade, Wealthsimple, Trading 212, Trading 212 Practice, DEGIRO, eToro | Listed, including international/practice variants | Same; geographic/account eligibility still applies |
| Coinbase, Kraken, Binance | Listed | Same; jurisdiction/account eligibility applies |
| Fidelity | Broker approval after SnapTrade application | Guide estimates about two business days; not a guarantee |
| Charles Schwab read-only | Broker approval after SnapTrade application | Guide estimates about one week; trading approval is irrelevant to this app |
| Alpaca | Bring commercial OAuth app keys to SnapTrade | Alpaca app approval; guide notes up to 30 days and excludes Canadian developers |
| TradeStation | Bring commercial app keys to SnapTrade | TradeStation application approval and SnapTrade callback |
| Tradier | Bring partner keys to SnapTrade | Partner review, callback, stated $500 developer onboarding fee; long-lived refresh requires separate approval |
| Other current institutions | Returned dynamically | Commercial catalog, country, account type, actual data capabilities |

No broker has been live-validated in this session. No physical WHOOP validation is claimed.

## Market data

| Feed | Implemented | Required permissions and hosting |
|---|---|---|
| Massive | US equities/options OHLC HTTP adapter; periodic forming-bar refresh | Commercial agreement plus relevant exchanges/OPRA. Standard personal terms prohibit an end-user commercial application and redistribution. Exact tenant/instrument display entitlement is required. |
| Databento | GLBX.MDP3 historical OHLC HTTP adapter, exact raw futures symbol, minute-bar aggregation | API subscription, venue licensing, display permission. Storage/analytics need distinct permissions. Live TCP streams require an always-on relay; this branch does not claim a live futures socket. |
| OANDA / ProjectX / TradeStation | Account-entitled HTTP bars through the shared market interface | Explicit application/tenant/instrument permission; account ownership is checked. API login alone is not treated as a display/redistribution license. |

Market records remain separate from Session JSON and HR chunks. Cache writes require explicit storage permission. The branch performs no additional market analytics or redistribution. Replay reveals a candle only after its ending timestamp, labels granularity, and never invents intra-candle OHLC. Ambiguous legacy futures/options need explicit identity.

## Remaining prerequisites

1. Isolated Supabase staging project/branch, approved cost, staging Auth, and Edge secrets.
2. Apply only the additive broker_execution_market_workspace migration to an existing staged baseline. Do not rerun the four old migrations against production.
3. Deploy the five source-generated Edge Functions to staging. Existing data/TradingView copies are regenerated from source handlers/contracts.
4. Persistent worker host with Node, staging project/key, AES key, and provider configuration. Vercel handlers retain the 10-second limit; no permanent provider loop runs there.
5. Provider approvals/credentials above. SnapTrade stable IDs and complete amendment/deletion delivery require contractual verification; the default history gate is closed.
6. Market subscriptions and exact tenant/instrument entitlements, with separate display, storage, analytics, and redistribution decisions.
7. Remote staging advisors and real-provider validation after provisioning. Isolated local Postgres tests do not establish live-provider, physical Bluetooth, or production readiness.

## Official sources

- [SnapTrade portal](https://docs.snaptrade.com/docs/implement-connection-portal), [broker access](https://docs.snaptrade.com/docs/broker-access-guide), [OpenAPI](https://docs.snaptrade.com/openapi.yaml), [signatures](https://docs.snaptrade.com/docs/request-signatures), [webhooks](https://docs.snaptrade.com/docs/webhooks).
- [TradeStation OAuth](https://api.tradestation.com/docs/fundamentals/authentication/auth-code/), [API](https://api.tradestation.com/docs/).
- [Tradovate API](https://api.tradovate.com/), [official OAuth example](https://github.com/tradovate/example-api-oauth), [partner API](https://partner.tradovate.com/).
- [ProjectX authentication](https://gateway.docs.projectx.com/docs/getting-started/authenticate/authenticate-api-key/), [trades](https://gateway.docs.projectx.com/docs/api-reference/trade/trade-search/), [contracts](https://gateway.docs.projectx.com/docs/api-reference/market-data/search-contracts-by-id/).
- [OANDA eligibility](https://developer.oanda.com/rest-live-v20/introduction/), [transactions](https://developer.oanda.com/rest-live-v20/transaction-ep/).
- [IBKR Web API](https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/), [Rithmic kits](https://www.rithmic.com/apis).
- [Databento licensing](https://databento.com/docs/portal), [historical API](https://databento.com/docs/api-reference-historical/timeseries/timeseries-get-range).
- [Massive terms](https://massive.com/legal/market-data-terms-of-service), [OHLC API](https://massive.com/docs/rest/stocks/aggregates/custom-bars).
