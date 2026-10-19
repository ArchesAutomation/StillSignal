# Direct brokerage connections

TraderPulse connects customers' own brokerage accounts. New onboarding does not offer SnapTrade or crypto exchanges. Existing SnapTrade records and backend support remain compatible.

## Customer experience

1. **Choose broker.** Only implemented direct routes appear. Unconfigured routes say “coming soon” and offer CSV import.
2. **Connect securely.** Broker-specific instructions lead to broker-hosted read authorization, or explain where to obtain a native token/key. Customers never need TraderPulse developer credentials. Live and demo choices are preserved; tastytrade demo requires separate application credentials.
3. **Confirm import.** Authorization, discovered accounts and imported executions are separate checks. An execution count comes from the authenticated customer's stored records for this connection. An OAuth redirect, saved key or empty account list cannot produce an import success. Returning from the broker callback reopens Connections at the selected connection. Failed authorization and worker errors have recovery instructions.

## Implemented routes and limits

| Broker                                    | Customer connection                      | History                                                                                                            | Required before enabling                                                                                |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Alpaca                                    | Hosted OAuth, default read-only scope    | Individual FILL activities, fractional quantities, exact timestamps and stable activity IDs; US stocks/options     | Registered Connect app, commercial-use approval, callback URL, client credentials                       |
| tastytrade                                | Hosted OAuth, `read` scope, customer 2FA | Individual transactions; stocks, equity options, futures and future options; execution effects and final fee signs | Verified third-party app and registered callback. Sandbox has separate keys                             |
| Tradovate / eligible NinjaTrader accounts | Hosted OAuth                             | Existing individual-fill adapter                                                                                   | Approved partner app; account must use the supported Tradovate backend                                  |
| OANDA v20                                 | Personal API token                       | Existing transaction-ID based fill adapter                                                                         | Eligible v20 accounts and commercial-use authorization; Global Markets/TMS accounts excluded            |
| TopstepX / ProjectX                       | Platform username and API key            | Existing historical-trade adapter                                                                                  | Firm-enabled API subscription; this adapter uses TopstepX's approved URLs, not arbitrary ProjectX firms |
| TradeStation                              | Hosted OAuth                             | Account discovery only; no fill imports from cumulative order summaries                                            | Approved app and additional execution-detail access before ingest can be implemented/enabled            |

Native OANDA/ProjectX keys can carry trading authority even though TraderPulse invokes read operations only. Explain this during setup. Never request a customer's brokerage password. Tokens are encrypted server-side; no client storage or browser logs of secrets.

Alpaca option premium multipliers are obtained from the contract's `multiplier`, never assumed from deliverable `size`. Missing contract metadata stops that page. Unknown entry/exit effects remain unknown, rather than assuming a flat account. tastytrade reversal rows pause import for reconciliation instead of creating duplicate fills. Both adapters freeze page bounds and overlap seven days on later passes; broker history retention and older corrections still require reconciliation/CSV. Fees outside the execution response are not invented.

## Other brokers reviewed

This is an initial direct-adapter set, **not a claim that every brokerage is integrated**. Public personal API access does not establish commercial customer-account access.

| Candidate                         | Current disposition                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TradeZero                         | Its official customer-platform guide requires Connect Trade unless TradeZero separately provisions a direct partner program. Portal keys are personal-use only; do not collect them from customers.                                      |
| Tradier                           | Account history is nightly and lacks intraday timestamps/order numbers. It does not satisfy precise execution/heart-rate matching. A different approved fill source is needed.                                                           |
| cTrader-affiliated brokers        | Public OAuth/protocol exists, but requires a shared persistent TCP/WebSocket application connection, heartbeat and account authentication. Needs a dedicated relay and verification of callback/state behavior; no adapter claimed here. |
| TradeLocker firms                 | Developer access plus individual-fill semantics need verification. Final order history may group partial fills; do not turn order totals into invented fills.                                                                            |
| Saxo                              | Read APIs exist. Commercial application evaluation and multi-asset execution/correction normalization remain separate work. No adapter claimed.                                                                                          |
| Schwab / Questrade                | Customer-platform commercial onboarding and approved API contracts must be verified before implementation. No adapter claimed.                                                                                                           |
| IG                                | Historical activity/transactions exist, but customer authorization, fill semantics and commercial access remain unverified for this product. No adapter claimed.                                                                         |
| IBKR / Rithmic / FXCM native SDKs | Require approved third-party access and/or persistent gateway/SDK infrastructure. Not enabled by accepting ordinary login credentials.                                                                                                   |

## Launch setup

No provider credentials or approvals were supplied during implementation. All new application approval flags default to false. Fixture tests do not constitute broker certification or live connectivity.

1. Obtain the applications/approvals above. Register `https://<app-host>/api/brokers/callback` exactly. Request read access only. Do not email or paste secrets into issue/PR comments.
2. Configure the server environment from `.env.example`: HTTPS `APP_ORIGIN`, a 32-byte base64 `BROKER_ENCRYPTION_KEY`, provider client credentials, and the matching approved/enabled flag. tastytrade paper credentials are separate. Never put these values in public environment variables.
3. Apply `20261019213657_direct_broker_providers.sql` through the normal migration pipeline. This only extends the broker provider constraint; account policies and journals are unchanged.
4. Regenerate/deploy the Supabase function bundles using the existing workflow. Run the persistent `scripts/broker-worker.ts` on an appropriate host; Vercel request functions alone do not run the discovery/import queue. The staging worker must use an isolated project.
5. Test with an eligible demo customer: authorize → discover the correct account → import a known individual fill → verify exact time/quantity/contract → repeat sync without duplicates → refresh grant → disconnect. Verify a second customer cannot read the first customer's progress or records. Check errors and delayed queue handling.
6. Enable the broker workspace feature flag only after staging validation and worker operation are confirmed. Provider data and chart market-data permissions are separate; account linking does not activate candle data or grant redistribution rights.

## Primary sources checked 2026-10-19

- [Alpaca OAuth](https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api), [Connect commercial access](https://docs.alpaca.markets/us/docs/about-connect-api), [account activities](https://docs.alpaca.markets/us/docs/account-activities), [official contract model](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/trading/models.py).
- [tastytrade OAuth](https://developer.tastytrade.com/docs/authentication/oauth2/), [transactions OpenAPI](https://developer.tastytrade.com/openapi/transactions.json), [instruments OpenAPI](https://developer.tastytrade.com/openapi/instruments.json), [account balances](https://developer.tastytrade.com/reference/balances-and-positions/getAccountsAccountNumberBalances/).
- [TradeZero customer-platform restrictions](https://developer.tradezero.com/docs/documentation/oauth-partner-guide), [Tradier historical limitations](https://docs.tradier.com/reference/brokerage-api-accounts-get-account-history).
- [cTrader connections](https://help.ctrader.com/open-api/connection/), [TradeLocker getting started](https://public-api.tradelocker.com/docs/getting-started), [Saxo application access](https://www.developer.saxo/openapi/learn/request-app-access), [Schwab user guides](https://developer.schwab.com/user-guides), [Questrade API agreement](https://www.questrade.com/disclosure/legal-notice-and-disclosures/api-access-agreement), [IG API guide](https://labs.ig.com/rest-trading-api-guide.html).
