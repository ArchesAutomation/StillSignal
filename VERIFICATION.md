# Verification — empty private beta

## Local checks

18 automated tests pass for the current release. They cover empty workspaces, local ownership, simulated BLE lifecycle, CSV validation, analytics, bounded requests, Postgres RLS, idempotency, journal merging and deletion tombstones. Type checking and the production build pass after migration-file and beta-access UI changes.

## Hosted Supabase checks

Passed against TraderPulse (`ipfurgwqqjkybhadzutj`):

- Two admin-created confirmed accounts sign in by password, without email delivery.
- Account B cannot list, read, delete, append samples to or create hooks for account A’s session.
- Wrong owner and cross-tenant session-ID reassignment are rejected.
- Direct Data API RLS restricts reads; direct client writes and privileged RPC calls return 403.
- Identical sample retries deduplicate; conflicting payloads fail; replay returns exactly the original samples.
- TradingView invalid tokens are rejected; duplicate valid events are stored once; revoked tokens are rejected.
- Deleted sessions cannot be recreated from stale uploads.
- Temporary verification account removed; demo remains empty. Remote counts: 0 sessions, 0 sample chunks, 0 events, 0 tombstones.
- Setup-only bootstrap function replaced with a 410 handler, with gateway JWT verification enabled and no administrative code.

Security advisor reports INFO notices for three deliberately inaccessible internal tables with RLS and no client policies. It also flags disabled leaked-password protection, which requires Supabase Pro or above; no paid upgrade was authorized. See [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and [internal-table RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Foreign-key covering indexes were added. Unused-index INFO is expected on a new, empty database.

## Remaining practical limits

Physical WHOOP hardware, Safari/phone Bluetooth recording support (not available), large concurrent-user capacity and third-party TradingView delivery latency are not established by these checks. Use the staging load harness before raising beta limits. Free-plan quotas are not a production capacity guarantee.

## Production release checks

Vercel deployment `dpl_38e6eHWDYWCAGchYR6MFd9jfvdd4` is READY, built from GitHub commit `7d281ba0b39bba80a0b857b9dc8957aba59b520a`. The stable alias returns HTTP 200 with `cloudConfigured:true`, `authenticationRequired:true`, and `exampleData:false`. A confirmed beta account successfully signs in and lists zero sessions through the deployed Vercel `/api/data` proxy; anonymous access returns 401. The live browser shows enabled email/password sign-in, private beta text, and no sample data or signup/reset links. Physical WHOOP and signed-in browser interactions remain unverified.

The migration baseline is recorded remotely as `20261013082052`; all three foreign-key indexes are present. Production Auth Site URL and the exact redirect allowlist are saved. Resend/SMTP remains deferred; testers use operator-provisioned accounts.

Automatic future Vercel Git-push deployment is not verified; its scoped link-discovery action returned 403. Current production deployment fetched its source directly from GitHub successfully. Supabase's GitHub App installation is prepared for only TraderPulse and awaits the user's action-time permission approval. No paid branching is enabled.

