# Brokerage connections and market intervals

The connection tree starts with an explicit choice: Direct, SnapTrade, TradingView, or CSV. No route is preferred or selected automatically. Customers connect accounts they own. Broker setup cards report asset coverage, availability, credential/approval requirements, history, sync speed, payer, and next action. Unsupported direct integrations remain visible with their actual requirements.

## Direct

Existing Alpaca, tastytrade, Tradovate, ProjectX/TopstepX, OANDA and TradeStation adapters are retained. OAuth requires an approved application and exact callback origin; native-key routes require eligible user accounts and deployment configuration. Credentials remain encrypted server-side and tenant-scoped. API reads, OAuth state consumption, account reconciliation, durable import jobs and execution journal normalization retain their existing boundaries.

Direct import uses the existing worker and polling schedule, not a streaming execution subscription. Upstream publication can be delayed. Execution time belongs to the broker record; arrival time records receipt by Trade Pulse. A running worker is required for automatic polling. No additional aggregation infrastructure or provider subscription is provisioned by this change.

TradeStation account linking does not imply individual-fill ingestion: the approved execution-detail feed remains unavailable. IBKR native and Rithmic require an approved/licensed relay which this app does not implement. CSV remains usable for their trade history.

## SnapTrade policy (official documentation checked 2026-10-19)

SnapTrade Personal customers can authorize an OAuth app to access accounts they manage. However, the receiving app must register under a Commercial developer account, keep a confidential client secret on a backend, and obtain KYC approval for production. Test apps are limited to five users. OAuth preview access is temporary; future app pricing is undecided. Personal-account eligibility is not a guarantee of permanently free app integration.

Trade Pulse leaves this route disabled pending registration, approval, a verified arrangement without recurring Trade Pulse per-user costs, and implementation of a dedicated Personal OAuth adapter. There is deliberately no environment switch which enables the legacy commercial adapter. Setting SNAPTRADE_COMMERCIAL_ENABLED or legacy credentials cannot register commercial users, open the commercial connection portal, call paid refresh/recent-order endpoints, or start subscriptions/trade detection. Legacy workers fail closed and pause. Existing journal records are retained. For any legacy connection, stop local sync and revoke upstream access in the SnapTrade dashboard; this change does not delete upstream accounts or resolve an existing provider invoice.

A future approved Personal OAuth integration must use state and S256 PKCE, confidential backend token exchange, least-privilege read scope, encrypted tenant-bound tokens, atomic refresh rotation, and revocation. It must not register subordinate commercial users or accept Personal consumer keys from customers.

SnapTrade transaction history is updated daily and delayed by one day. It is not an intraday execution feed. The displayed brokerage list is a curated subset of official brokerage support, not a live entitlement catalog; account and region eligibility must be verified in Personal. No crypto exchanges are offered.

Official references:
- https://docs.snaptrade.com/docs/oauth-apps
- https://docs.snaptrade.com/docs/personal-vs-commercial
- https://docs.snaptrade.com/docs/billing
- https://docs.snaptrade.com/docs/syncing
- https://support.snaptrade.com/brokerages

## TradingView and CSV

TradingView setup links to the existing alert editor. Users need 2FA, eligible webhook access, and their journal webhook token. Supported price, indicator and Pine strategy alerts are provider events, not guaranteed broker fills. A TradingView broker login cannot be reused by Trade Pulse; manual brokerage transactions do not automatically synchronize. Delivery may be delayed or fail. The customer pays applicable TradingView and data-plan costs.

CSV is a separate manual import. The dashboard's visible Import CSV action opens it directly; the CSV shortcut in Connections also bypasses broker setup. Choose a file, check its timezone and preview, confirm an initially flat position for filled-order exports, and import. No broker name, login or approval is required.

By default, imports match the export's calendar dates to the user's recorded sessions. The selected matching day is preferred; otherwise the matching session with the most heart-rate samples is used. Multiple dates are handled separately, and a journal is created only when no session matches. Existing session identity, recording bounds, samples and notes remain intact. An active session keeps recording. The dashboard displays the union of recorded and trade times, with missing HR shown as gaps. If a day has multiple recordings, the selected matching session is the target; this does not combine separate wearable recordings.

Importing identical executions does not duplicate them. Advanced options retain separate-file and selected-session imports. Backtests default to a separate journal. Position context averages actual HR measurements before entry, through scale-ins/partial exits until the position is fully closed, and after exit. Accounts and instruments are not cross-paired; alerts and backtests do not produce a broker holding window.

TradingView reference: https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/

## Overview

1m, 5m, 15m and 1h selections remain usable while market data is missing. Selection visibly changes the status and the request interval. Missing instrument/credentials/display entitlement or empty responses preserve the trade/heart-rate timeline and explain the selected interval. No prices are fabricated from executions. Existing exact-instrument behavior is retained; market charts fit the requested interval's viewport when available.

## Release and verification

Run typecheck, the complete test suite, production build, `node --import tsx scripts/test-broker-browser.mjs`, and the isolated review Overview test described in STAGING_REVIEW.md. Tests use isolated synthetic accounts only; they do not verify live brokerage credentials.

Regenerate Edge Functions with `node scripts/prepare-edge.mjs` after changes to broker source. Both generated handlers and the Vercel proxy enforce the SnapTrade block. Deploy the updated pulse-brokers handler together with the web app: direct connect requests now require an explicit connectionType. Existing migrations and private-demo/auth/signup protections are unchanged. Provider approvals, encrypted credential configuration, a running direct-sync worker, and exact market entitlements are still required before enabling those services.

## TradingView filled Orders CSV

The importer also accepts filled Orders exports with Symbol, Side, Type, Qty, Remaining Qty, Filled Qty, Avg Fill Price, Update Time, Order ID and expiry columns. Filled Qty takes priority over requested Qty, and Avg Fill Price takes priority over limit/stop prices. Reverse-chronological exports are sorted before reconstructing entries/exits. Zero-fill orders are skipped; cumulative partial fills are distinguished from individual-fill exports. Conflicting snapshots for the same order are rejected instead of double-counted.

When no fill timestamp exists, Update Time is used and retained as an explicit Order update time label throughout the journal and context panel. It is not presented as an exact execution time. The export timezone is visible and editable; importing uses that timezone. A complete, initially flat position history must be confirmed before import. Missing P&L is left blank. Loading another file clears the previous preview and confirmation; a late file read cannot overwrite a newer selection.

Run `node scripts/test-csv-browser.mjs` for isolated desktop/mobile upload, preview, persistence, replacement-file and re-import checks. The committed format fixture contains synthetic transactions only. The customer-supplied source file is not stored in this repository or uploaded by the test.
