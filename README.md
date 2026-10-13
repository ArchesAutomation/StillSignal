# Trade Pulse 0.2

A Next.js/React/TypeScript app for WHOOP Bluetooth heart rate, synchronized trading events, descriptive statistics, replay, and journaling. Every account starts empty. There are no preloaded heart-rate samples, trades, journal entries, or generated demo sessions.

## Current status

- Source repository: https://github.com/ArchesAutomation/TraderPulse.
- Supabase **TraderPulse** (`ipfurgwqqjkybhadzutj`) in ArchesAutomation is healthy in Canada Central; AA CRM is untouched.
- Six RLS-protected tables and the two runtime Edge Functions are deployed. Production Vercel has the public project URL and publishable key.
- Hosted checks passed for two-account authentication, API and Data API isolation, forbidden client mutations/RPCs, ingestion deduplication, deletion tombstones, TradingView event deduplication, and hook revocation. The temporary test account was removed. Sessions, samples, events and tombstones are all empty.
- Empty demo account: `demo@traderpulse.test`. Its password is supplied privately and never committed. Each tester needs a separate account for private data.
- Public signup and reset links are hidden during the private beta. Resend/SMTP is deferred. An operator can create confirmed password accounts in Supabase Auth for testers; do not use email invitations until delivery is configured.
- Production URL: https://trade-pulse-ebon.vercel.app. See `VERIFICATION.md` for the actual release checks and limitations.

## Architecture

Browser → Vercel bounded API proxy → Supabase Edge Function → Supabase Postgres.

Auth uses Supabase email/password accounts. Sign-in gates the dashboard. Each user ID is a tenant for this MVP. A single shared demo account is one shared workspace; testers need individual accounts for private recordings.

The Supabase functions verify each user JWT with `auth.getUser()` and derive ownership from that verified identity. All server reads/writes scope by that identity. RLS protects direct reads. Direct client writes and privileged RPC execution are revoked. Composite foreign keys prevent cross-account child records. Server-only keys stay in Supabase Edge environment variables; **Vercel and browsers only receive the project URL and publishable key**.

Sample ingestion is local-first, batched in durable 30-second buckets with idempotent retries. IndexedDB reads, writes, deletion, and session metadata updates also check account ownership. AuthGate remounts the dashboard by user ID on account changes. Cloud refresh merges unsent local notes instead of overwriting them.

## Run and verify

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run bench
```

Without configured Supabase variables, the public page shows sign-in with an account-setup status. It never opens a guest dashboard or generates a sample session.

## Supabase operations

The initial schema is tracked in `supabase/migrations/20261013082052_initial_trade_pulse_tenants.sql`. It was applied through the signed-in Supabase SQL editor after native migration requests failed with an expired request-state error. The live schema includes all three parent/owner indexes. Do not rerun the initial SQL on the provisioned database. Reconcile migration history before a future CLI `db push`; runtime connectivity does not depend on Supabase's optional GitHub branching integration.

Run `npm run prepare:edge` before deploying Edge Functions. `pulse-data` verifies each user JWT, and `pulse-tradingview` verifies a revocable session token. Gateway `verify_jwt=false` is required for this custom authentication and modern API keys; do not remove the checks inside the handlers. Supabase supplies server-only credentials to the functions, never to Vercel/browser code.

For the final launch, configure SMTP, confirm the production Auth Site URL/redirects, and set `NEXT_PUBLIC_OPEN_SIGNUP=true` in the intended environment. Email verification stays enabled. Preview environments should use a separate database; do not give untrusted previews production access.

## WHOOP and TradingView

WHOOP Heart Rate Broadcast is Bluetooth-only; there is no WHOOP cloud OAuth or API. Pair using a supported browser, keep the recording tab open and the device awake. Safari/iPhone browsers cannot use this Web Bluetooth recorder; review works across devices after cloud setup.

TradingView events are configured alerts, not confirmed broker fills. Cloud setup is required. Generate a session-scoped 24-hour ingestion token in Connections and use the provided JSON alert message at `https://trade-pulse-ebon.vercel.app/api/tradingview`. Token rotation/revocation is supported. Each event needs a stable unique ID, explicit timestamp, symbol, kind, side, price, and quantity. P&L is optional and user-provided. TradingView requires an eligible plan and 2FA for webhooks. Verify hosted latency below its 3-second cancellation limit.

CSV templates contain only the column headers; they do not ship sample trades. Imports must use explicit timezone offsets and match a recorded session.

## Capacity

See `ARCHITECTURE.md`. Scalable design and local isolation tests do not establish a production capacity guarantee. Run the included staging load harness with a distinct account for each virtual user after the new cloud project is live. The Free plan is a beta/testing starting point, not an assumption of unlimited simultaneous users.
