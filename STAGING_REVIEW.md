# Review and staging runbook

The synthetic UI preview and the connected Supabase staging deployment are separate environments.

## Isolated UI review

Use a Vercel **preview** project/environment with no Supabase URL, publishable key, service key, or broker credentials. Set:

    APP_ENV=staging
    TRADERPULSE_UI_REVIEW=true
    NEXT_PUBLIC_UI_REVIEW=true

Open /review. A persistent banner labels synthetic market, execution, and HR data. Local storage belongs to a fixed synthetic review account on the preview origin. The root still shows authentication. The review route returns 404 without both server gates or whenever a Supabase URL is configured.

### Day away from charts proposal

Set `STILL_SIGNAL_DAY_AWAY_REVIEW=true` alongside the review flags above. On Windows, run the real app locally with these settings:

```powershell
$env:APP_ENV='staging'
$env:TRADERPULSE_UI_REVIEW='true'
$env:NEXT_PUBLIC_UI_REVIEW='true'
$env:STILL_SIGNAL_DAY_AWAY_REVIEW='true'
$env:NEXT_PUBLIC_SUPABASE_URL=''
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY=''
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=''
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3193
```

Open `http://127.0.0.1:3193/review`. On Home, **Day away from charts** sits below the hero. The normal Home and Preparation screens are available throughout. Choose **Open in Daily journal** to see **Space between sessions.** above **Day in Action** for that date. Use **Edit dashboard** to arrange **Why I stayed away** and **Reflection** independently. The Reflection widget holds optional chart review and earlier thoughts. Switch to **Journal** for the regular book. Its writing is separate and saves in the review’s browser storage on a date without a session.

**Mark another date** opens a compact dialog in Daily journal. To try carry-forward immediately, mark an earlier date, write a reflection, and choose **Show at my next preparation**. Return to Home and use **Begin preparation** on an ordinary trading day. On another away date, **Continue a thought** identifies the date of the original Day in Action reflection.

The week strip in **Daily reference** uses **Away**, **Prep**, **Session**, and **Trade** for recorded activity. **Prep** comes from saved preparation, **Session** from an explicit start with no trade recorded, and **Trade** from an execution. A date with no evidence stays blank. If a trade arrives on a date marked away, the strip shows **Trade** and the selected date shows both facts.

To inspect a **Trade** example through the ordinary Journal, start a second isolated review server with `STILL_SIGNAL_DAY_AWAY_REVIEW=false` and a different port. Open `/review` there to see the seeded trades on 13 October 2026. The regular Journal uses recorded activity directly. For the extra browser check that enters a manual trade, set `REGULAR_JOURNAL_REVIEW_URL` to the second server’s loopback origin before running `node scripts/verify-day-away-review.mjs`.

Run `node scripts/verify-day-away-review.mjs` with Chrome installed to check the main journey against that local server. This review build has no Supabase connection, so the synthetic owner's away days stay on this device. Signed-in storage, sync and the release order are described in `docs/away-days.md`. Away-editor dictation is not included.

## Connected staging

Use a new empty Supabase project/branch with the baseline migrations/storage policies. Configure staging Auth redirects separately. Turn synthetic review flags off. Register the exact staging /api/brokers/callback URL at each OAuth provider.

Do not reset production, rerun its initial migration, or apply this migration to production while reviewing. Run security/performance advisors on staging after applying the additive migration.

Keep server-only secrets in Supabase Edge Function secret storage and the worker environment. Vercel normally needs only the staging public Supabase URL/key and account configuration; new handlers are proxied to Edge Functions.

Generate handlers from source:

    npm run prepare:edge

After the additive migration and corresponding Edge Functions are installed, enable BROKER_SERVICES_ENABLED and MARKET_SERVICES_ENABLED in Vercel as appropriate. Both default off so the redesigned app can run with the existing journal backend while provider setup is pending.

Run a persistent Node worker outside Vercel. It requires APP_ENV=staging and BROKER_STAGING_PROJECT_REF matching the staging URL, the staging service key, encryption key, and provider configuration. The original production reference is rejected in staging mode.

    node --env-file=.env.worker.local --import tsx scripts/broker-worker.ts

The worker uses leases, durable checkpoints, bounded execution pages, backoff, and account reconciliation. Retries do not create additional events. Unknown starting positions remain unclassified; fees/currencies stay explicit.

Provision pulse_market_entitlements with exact user/instrument IDs, provider, agreement reference, expiry, and individually verified permissions. Display alone does not permit persistent caching, analytics, or redistribution.

## Validation

    npm run typecheck
    npm test
    npm run build

The broker database tests apply migrations only to a fresh isolated local PGlite database. They cover RLS/secret boundaries, transactional intake, retries, amendments/voids, notes, deletion protection, checkpoints, and cross-account rejection.

Production migration and deployment remain a separate release decision.

## Overview and candle controls

Build and start the isolated UI review app with the review flags above, then run
`node scripts/test-overview.mjs`. The default review URL is
`http://127.0.0.1:3100`; set `OVERVIEW_TEST_URL` for another port or review host.
Use Playwright's installed Chromium, or set `PLAYWRIGHT_CHANNEL=msedge` to use
an installed Edge browser.

The browser check verifies all four candle intervals (75 one-minute, 15
five-minute, 5 fifteen-minute, and 2 hourly fixture bars), instrument selection,
volume, HR pane sizing, timeline ranges, return to live, tab navigation, and
replay without browser errors. The unit suite also checks unavailable-feed
controls and instrument resolution across sessions and toolbar selections.

Verified locally on 2026-10-19: 76 tests, TypeScript, optimized review build, and
the Edge browser check pass. These browser results use labeled synthetic data.
The production `/api/market` still reports `Market data is not configured yet`.
Live candles require a configured provider, instrument display entitlement, and
the corresponding market backend before enabling `MARKET_SERVICES_ENABLED`.
Broker execution connections can be added independently.
