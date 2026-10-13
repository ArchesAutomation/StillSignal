# Architecture and scale envelope

## Data path

WHOOP BLE → browser recorder → IndexedDB raw samples + atomic retry outbox → authenticated bounded HTTP batches → stateless Vercel Functions → Supabase Postgres.

TradingView → validated session-scoped webhook → durable deduplicated Postgres event → active browser polls every 15 seconds → shared event/heart-rate timeline.

Browser reads and interactive analytics run locally. A sensor notification does not trigger a server call. Recording, rendering, insight refreshes, and cloud synchronization are independent clocks:

| Work                        | Cadence                                  |
| --------------------------- | ---------------------------------------- |
| Raw sample persistence      | Every valid received BLE notification    |
| Dashboard refresh           | 1 second                                 |
| Descriptive insight refresh | User choice: 15s to 60m                  |
| Cloud batch upload          | Completed 30-second windows              |
| TradingView event poll      | 15 seconds while signed in and recording |
| Chart output                | At most 600 peak-preserving points       |

## Backend choices

- **Stateless Next.js API routes:** no process-local user state or in-memory rate-limit correctness. Vercel can horizontally scale handlers.
- **Postgres through Supabase HTTP:** no per-request application TCP connection pool explosion. Deploy functions in the same region as the database.
- **Chunked time series:** up to 120 JSON samples per insert, indexed by tenant/session/sequence. Typical 1 Hz sessions produce one chunk per 30 seconds instead of one row or API call per heartbeat.
- **Idempotency:** stable batch IDs + uniqueness + content conflict detection. TradingView event IDs are unique within the session. A successful retry does not add another event/sample chunk.
- **Pagination:** sample reads return at most 100 chunks per request. Cloud history returns the newest 100 sessions. More extensive archive browsing is a later feature.
- **No premature distributed system:** simple ingestion commits before acknowledgement. Introduce a durable queue when measured traffic or added downstream jobs require it, not an in-memory background promise.

## Isolation and deletion

Supabase email/password Auth authenticates the client. Every user API request re-verifies its bearer token. Server-side reads/writes explicitly scope by verified user ID. Composite session/user foreign keys prevent cross-tenant child rows. Browser client keys can only read their own rows through RLS; table mutations and privileged functions are revoked from client roles.

A database-backed atomic counter limits each authenticated user and valid hook to 120 requests/minute, independent of the number of function instances. This is a protective ceiling, not a throughput promise. Configure WAF/IP rate limits for unauthorized traffic at the platform edge. Rate-limit rows reuse a single key per user/hook; expired hook and unused rate-limit keys need periodic maintenance at scale.

Session deletion cascades samples, events, and hooks. A minimal ID/user tombstone prevents stale clients from recreating deleted sessions. Account deletion should also delete tombstones through the auth-user cascade. A stale device may retain its own local/exported copies; server deletion cannot erase offline devices. Server rejects attempted resurrection, so a stale sync will surface as paused until that local copy is removed.

Metadata updates merge append-only events and notes by ID. They preserve a recorded end time and original start time. Note editing/deletion and conflict-resolution UI are out of MVP scope. Only one recording session per browser tab should be active; cloud accounts can have multiple distinct sessions. The service-role key must never be exposed to client code.

## Client resilience

Raw sample and outbox updates occur in one IndexedDB transaction. Completed buckets upload oldest first in groups of up to 20 per sync run. Outages keep data locally. A failed upload does not remove the retry record. A storage write error stops recording and tells the user. An interrupted tab leaves a recoverable local session; it does not pretend to capture while closed. Exports remain available.

There is no generated demo data. The empty demo login has its own tenant. Local data is scoped by account ID, but it is not encrypted: use separate browser profiles on shared devices. Sign-in is required to open a workspace.

BLE timestamps use the receiving computer's clock, not the wearable's internal timestamp. TradingView timestamp semantics depend on the alert template. Clock drift and alert delivery latency affect alignment; verify device clock synchronization. Sample gaps remain gaps, not interpolated physiological facts. Insights do not classify emotion or predict returns.

## Capacity estimates — not tested guarantees

At 1 notification/second and a 6.5-hour session:

- 23,400 raw samples per trader per trading day.
- About 780 chunks per trader at a 30-second upload cadence.
- 10,000 simultaneous traders imply roughly 333 batch uploads/second, up to 333 changed-session saves/second, and about 667 poll requests/second. Authentication checks and multiple database operations amplify database traffic beyond these HTTP counts.
- 10,000 daily traders imply 7.8 million chunks/day and 234 million samples/day before indexes/backups. Payload storage alone can reach many GB/day. Default/free database tiers are not an appropriate assumption for that load.

Current architecture provides a path to scale, not evidence that the initial database provision will handle these levels. Establish SLOs in staging (for example p95 read/write under 500 ms, webhook response under 2 seconds, error rate below 1%, zero accepted-data loss). Use representative multi-account traffic and several hours of backlog/retry pressure.

Growth path after measurements:

1. Add observability, alerting, database sizing and workload budgets. Profile actual ingest/poll traffic.
2. Add retention/archive policy and monthly partitions for chunks. Cold raw data can move to private object storage, keeping indexed aggregates in Postgres.
3. Build incremental minute/session aggregates for long-range cross-session analysis; avoid loading entire account histories into a client.
4. Replace frequent polling with an appropriately scaled realtime/notification channel if it is the bottleneck.
5. Add a durable queue ahead of heavier webhook processing; commit intake before returning 202, use idempotent workers and dead-letter handling.
6. Isolate high-volume ingestion from interactive reads as measured load warrants. Evaluate Redis-based rate limiting if Postgres counters become material overhead.

## Deliberate MVP boundaries

No order execution, broker API integration, WHOOP cloud API, sleep/recovery/HRV claims, Apple/Oura, Wi-Fi sensing, AI advice, subscription billing, teams, or automatic emotion labeling. No external TradingView chart widget is included: trading synchronization uses configured alerts and imported/manual events on the same physiological timeline.

## Version 0.2 tenancy update

The dashboard is now gated by Supabase email/password sign-in and contains no generated samples. Each account is one tenant. The UI remounts when the user ID changes, and local buffers/preferences are scoped by that ID. Existing guest data is not automatically reassigned to an account.

Data and webhook operations now run in Supabase Edge Functions behind bounded Vercel proxies. Privileged keys stay in Supabase; only the public project URL/key are configured on Vercel. The functions derive tenant identity from verified JWTs, not editable user metadata or request-body ownership. Database functions are `SECURITY INVOKER`, restricted to the server role, with fixed search paths. RLS provides defense for direct client reads and direct client writes remain revoked.

An empty shared demo login is a separate tenant. Sharing that login does not create privacy between people who use it; private beta testers must have their own accounts. No fake data is seeded into either their accounts or the demo account.

TraderPulse is provisioned in Canada Central. Vercel proxies run in yul1, near the database. Hosted two-account isolation, direct RLS, retry safety, webhook tokens, and deletion tests passed. The temporary verification account and all probe records were removed. Production capacity still requires representative staging load measurements.
