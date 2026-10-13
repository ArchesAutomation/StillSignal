# Verification — Trade Pulse 0.3

## Local release checks

24 automated tests pass, plus TypeScript checking and an optimized Next.js production build. Tests cover empty authenticated workspaces, source-independent journaling/reflections/reopen, CSV file picker and actual drop events, preview-before-write, identical imports, native TradingView strategy exports, timezone/DST validation, USD P&L rules, trade-only timelines, supported alert templates, strategy partial exits/reversals, daily journal IDs and DST boundaries, simulated BLE lifecycle, sample gaps, analytics, body limits, local ownership/outbox durability, Postgres RLS, retries, tombstones and server-only RPCs. React review checked hook cleanup, semantic labels, optional physiology rendering and lazy integration loading.

## Hosted checks on 2026-10-13

Passed against Supabase TraderPulse (`ipfurgwqqjkybhadzutj`) using two disposable, confirmed password accounts, with no email delivery and no physical sensor:

- Empty account signs in; creates an account-wide connection without an active session or wearable. The second account cannot see its connection or journals.
- Public direct webhook accepts JSON with no API key/bearer header after validating the narrow token. First durable receipt: **1,135 ms**; identical retry: **849 ms**, with zero duplicate insertion.
- Invalid tokens fail; conflicting data under the same event ID is rejected. Database/API/ownership checks prevent cross-tenant reads, deletion and hook creation.
- Strategy reversal atomically records a long exit and short entry. No P&L or physiological values are invented.
- An existing open manual journal receives incoming alerts and retains reflections with zero samples. Without one, alerts create/reuse the tenant's daily journal.
- CSV parser output persists to a historical CSV journal; repeated saves preserve exactly two events and zero samples.
- Legacy session hooks remain functional; rotation and Disconnect invalidate old keys; future timestamps are rejected.
- All disposable auth users and their cascaded journal/event/connection records were removed. After cleanup: 0 sessions, 0 chunks, 0 events, 0 connections, 0 temporary users. Demo and Caleb accounts were not populated.

The three schema migrations match the remote ledger: `20261013082052`, `20261013091657`, `20261013093620`. Updated runtime Edge Functions are active. The setup-only bootstrap is retired after verification, contains only a 410 handler, and uses gateway JWT verification.

Earlier hosted checks also established forbidden direct client mutations/RPCs, cross-tenant session-ID reassignment rejection, sample batch deduplication/conflict rejection and deletion tombstone behavior.

## Advisor findings

Performance advisor reports no findings after the new schema. Security advisor reports INFO for four deliberately inaccessible internal tables with RLS/no client policies. Leaked-password protection remains a WARN because that feature requires a paid Supabase plan; no upgrade was authorized. See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and [internal-table RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Privileged keys are confined to Supabase; no privileged Vercel/browser environment variable was added.

## External and capacity boundaries

HTTP probes verify the real deployed intake/auth/database contract. They do not establish that a user's actual TradingView alert condition has fired; the user must create the alert using generated setup in their TradingView account. No user strategy or broker credentials were invented. The provider's three-second deadline was met by the recorded direct requests, but broad p95 latency and provider-origin delivery reliability require sustained testing.

Physical WHOOP, Apple Health, Oura and Garmin connectors and large concurrent-user capacity are not verified. WHOOP Bluetooth is implemented and simulated in tests; the other providers are planned. Journaling and TradingView/CSV do not depend on any of them. The current Free plan is a limited-beta starting point; run multi-account staging load tests before a larger launch.

## Release hosting

Production uses https://trade-pulse-ebon.vercel.app and the public GitHub repository https://github.com/ArchesAutomation/TraderPulse. Releases are built directly from GitHub source in Vercel `yul1`; automatic future Git-push deployments remain unverified. Supabase's optional GitHub App has not been installed and is not required for runtime connectivity. SMTP/Resend remains deferred, with operator-created private-beta accounts.

The 0.3 production deployment `dpl_BJtqmtfng8v3UoU5mj163EjiQpzW` is READY, built from GitHub commit `47e5bbd928d565582f27433457e11becd3b3d649` in `yul1`. The stable alias returns HTTP 200 and health reports `version:0.3.0`, `cloudConfigured:true`, `authenticationRequired:true`, `exampleData:false`. The public CSV template returns the exact header-only contract.

A second two-account verification run through the deployed Vercel `/api/data` proxy passed the full connection/journal/CSV/rotation/isolation sequence. Direct webhook receipt during that run took 837 ms; retry took 1,000 ms. Both disposable accounts and their records were removed again. The temporary administrative bootstrap was overwritten by its retired handler with gateway JWT verification enabled.

The live public browser shows the updated sign-in page: an empty journal, TradingView/CSV and optional wearable text. Authenticated interactive UI flows were verified in DOM tests plus real hosted API/database probes; a fully signed-in browser walkthrough and an actual provider-triggered TradingView alert remain unverified.
