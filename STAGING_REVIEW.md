# Review and staging runbook

The synthetic UI preview and the connected Supabase staging deployment are separate environments.

## Isolated UI review

Use a Vercel **preview** project/environment with no Supabase URL, publishable key, service key, or broker credentials. Set:

    APP_ENV=staging
    TRADERPULSE_UI_REVIEW=true
    NEXT_PUBLIC_UI_REVIEW=true

Open /review. A persistent banner labels synthetic market, execution, and HR data. Local storage belongs to a fixed synthetic review account on the preview origin. The root still shows authentication. The review route returns 404 without both server gates or whenever a Supabase URL is configured.

## Connected staging

Use a new empty Supabase project/branch with the baseline migrations/storage policies. Configure staging Auth redirects separately. Turn synthetic review flags off. Register the exact staging /api/brokers/callback URL at each OAuth provider.

Do not reset production, rerun its initial migration, or apply this migration to production while reviewing. Run security/performance advisors on staging after applying the additive migration.

Keep server-only secrets in Supabase Edge Function secret storage and the worker environment. Vercel normally needs only the staging public Supabase URL/key and account configuration; new handlers are proxied to Edge Functions.

Generate handlers from source:

    npm run prepare:edge

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
