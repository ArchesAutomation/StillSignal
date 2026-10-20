# Still Signal 0.4.1

A private, multi-tenant trading journal built with Next.js, React, TypeScript and Supabase. Use TradingView alerts, CSV imports, manual trade entries and reflections without a wearable. WHOOP Bluetooth heart rate is optional context. Every account starts empty; no sample trades, physiological readings or demo sessions are seeded.

- Live app: https://still-signal.vercel.app (the existing trade-pulse-ebon.vercel.app alias remains available).
- Source: https://github.com/ArchesAutomation/StillSignal
- Backend: Supabase **Still Signal** (`ipfurgwqqjkybhadzutj`), Canada Central.
- Each authenticated user is one tenant. Shared credentials share a workspace; give each tester their own account.
- Empty beta accounts: `demo@traderpulse.test` and `caleb@traderpulse.test`. Passwords are supplied privately and never committed.
- Signup/reset links are hidden during the private beta. SMTP/Resend remains deferred. Operators can create confirmed password accounts in Supabase Auth without sending invitations.


## Smart journal

**Start session** also opens a floating session dashboard on browsers with Document Picture-in-Picture. It shows fresh heart rate versus the opening baseline (or an explicit disconnected/building/stale state), a journal-entry button, microphone dictation, and screenshot paste. Copy a chart screenshot, then use **Paste screenshot** or Ctrl/Command+V in the panel; review the image and text and save them together through the existing private attachment flow. Clipboard permission may be required; file selection and keyboard paste remain available. Microphone access starts only when requested, never on session start.

The floating dashboard uses the same live session and save callbacks as the main tab. Keep the main tab open. Closing PiP moves the editor back into the dashboard without remounting it or discarding the current draft. Ending a session returns it to the main tab too. Use **Session dashboard** to reopen it. Browsers without PiP, or rejected PiP requests, show the panel in the main tab instead. Opening is requested directly from Start session before asynchronous storage work; it does not depend on automatic media/call PiP eligibility.

Press **Alt + J** while Still Signal is focused to open dictation. Review the transcript, choose your own label, and save it with an optional PNG/JPEG/WebP screenshot (up to 5 MB). Unsupported browsers offer typed input. Screenshots are private and use expiring links; screenshot interpretation is deferred. Reflections can be edited or deleted without stale uploads reviving older versions.

Automatic HR moments identify sudden rises and sustained elevations after a complete opening baseline, without requiring a trade. Click a timeline point to inspect the HR window. In Settings, enable the optional **Check-in beep** and **Spoken check-in question**, choose a cooldown, and customize the shortcut. Answer starts dictation; Dismiss and Snooze never open the microphone. Browser speech services may process audio remotely; Still Signal stores reviewed text, not recordings.

Personal insights compile only your available saved history: confirmed labels, HR deviations and proximity to recorded losses, with supporting moments. Questions use those facts. Learned sensitivity needs at least 8 reflections across 3 sessions and 5 elevated HR-linked records; otherwise the selected threshold applies. It can be disabled in Settings. This release uses deterministic personal analytics; no generative model is trained on your records.

Broker fill reports with recognized columns reconstruct entries, partial exits and reversals after confirmation that a complete export starts flat. Cancelled/unfilled orders are skipped, account positions stay separate, and ambiguous repeated snapshots or indistinguishable fills are rejected. Representative user exports are still needed to establish support for additional broker layouts. Price alerts are excluded from execution statistics and reconstruction. Manual entry can capture an entry and its matching exit together.

## Start journaling

Sign in and start a journal, add a manual trade or save a reflection. None of those actions requests Bluetooth. In **Connections**, generate TradingView webhook setup or drop a CSV. Incoming alerts create daily journals when there is no recent open journal. Trades, notes and replay work with zero heart-rate samples.

CSV accepts the downloadable header-only template and TradingView Strategy Report **List of Trades** exports. Other broker exports can be imported by mapping their columns and explicitly supplying missing context. Preview validation happens before saving. See [INTEGRATIONS.md](INTEGRATIONS.md) for formats, timezone rules and TradingView setup.

WHOOP Heart Rate Broadcast can be attached to a journal in a supported Web Bluetooth browser. It requires no WHOOP account login and works only while the tab/device remain awake. Disconnecting the wearable leaves the journal running. Apple Health, Oura and Garmin connectors are planned; provider metadata is extensible, but those integrations are not implemented.

## Architecture

Browser → bounded Vercel API proxy → authenticated Supabase Edge Function → Postgres. TradingView uses a direct Supabase webhook to avoid an extra network hop within its three-second response deadline.

User APIs verify JWTs with `auth.getUser()`, then scope all operations by the verified user ID. Direct reads have tenant RLS; direct client mutations and privileged RPCs are revoked. Composite owner/session foreign keys protect child rows. Account webhook tokens are random, hashed at rest, expire after 30 days, and can be rotated or disconnected. They permit ingestion only.

Samples persist locally in IndexedDB with an atomic retry outbox and 30-second cloud batches. Journal metadata and notes remain locally available during an outage. Alerts commit durably before acknowledgment. Unique event IDs reject conflicting alert retries and deduplicate identical retries. Chart output is bounded and integration UI is loaded on demand. See [ARCHITECTURE.md](ARCHITECTURE.md) for limits and growth paths.

## Development and operations

```sh
npm ci
npm run check
npm run bench
npm run prepare:edge
```

Production Vercel needs only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the browser may receive these public values. Privileged keys stay in Supabase's Edge environment. Never set a service-role/secret key under `NEXT_PUBLIC_*` or commit it.

All applied migrations are tracked under `supabase/migrations` and match the remote migration ledger. Do not rerun the initial migration on the provisioned database. Generate new migration files with the Supabase CLI, test them, apply once, and verify the remote ledger. `npm run prepare:edge` generates deployable copies of the runtime handlers and dependencies.

`pulse-data` verifies user JWTs internally. `pulse-tradingview` verifies a narrow hashed webhook token. Both use gateway `verify_jwt=false` for their custom authentication; do not remove the checks in their handlers. `pulse-bootstrap` is retired and contains no administrative setup code.

Production Auth Site URL and the exact redirect allowlist use the live app URL above. For a public launch, configure SMTP and set `NEXT_PUBLIC_OPEN_SIGNUP=true` in the intended environment. Preview deployments should use separate Supabase projects. The optional Supabase GitHub App is not required for runtime connectivity and has not been installed. Production releases currently deploy directly from GitHub source; automatic future push deployments have not been verified.

## Verification and capacity

33 tests, type checking and the optimized build pass. Hosted two-account tests verify webhook receipt, retries, isolation, CSV persistence, reflections, rotation and revocation without any wearable. See [VERIFICATION.md](VERIFICATION.md) for evidence and remaining boundaries.

The architecture can scale horizontally, but the current Free-tier database is a beta starting point. No unlimited-user guarantee or measured production concurrency claim is made. Run representative multi-account staging load tests and size the database before broad rollout.
