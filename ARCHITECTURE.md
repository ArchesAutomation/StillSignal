# Architecture and scale envelope

## Independent data sources

The journal owns trades and reflections. Wearables contribute optional samples; they do not control access to sessions, imports, notes or replay. `Session.source` records journal/CSV/TradingView origin, while `Session.wearable` and sample provider metadata describe physiology independently. WHOOP is implemented; Apple/Oura/Garmin authorization and ingestion remain future work.

| Source | Durable path | Requires an open app? |
| --- | --- | --- |
| Manual trades/reflections | Browser → tenant IndexedDB → authenticated Vercel proxy → Supabase Edge → Postgres | For entry only |
| CSV | Local parse/mapping/preview → explicit import → same journal sync path | For import only |
| TradingView | Direct Supabase webhook → token lookup/rate limit → transactional Postgres RPC | No |
| WHOOP Bluetooth | Sensor → local raw samples + retry outbox → completed cloud batches | Yes, for recording |

Server-only keys stay inside Supabase. Vercel and browser configuration contain only the public URL/publishable key. Vercel runs in `yul1`, near the Canada Central database. Direct webhook intake removes the Vercel forwarding hop from TradingView's three-second deadline; `/api/tradingview` remains a bounded compatibility proxy.

## Tenant isolation

Each Supabase Auth user is one MVP tenant. User APIs verify bearer tokens with `auth.getUser()` and explicitly scope every database query by that identity. Editable user metadata never controls authorization. Composite session/user foreign keys protect children. RLS permits authenticated reads of owned sessions, samples and events; client mutations and RPC execution are revoked.

Connections, hook hashes, rate counters and deletion tombstones have RLS and no client policies. Only the server can access them. Database functions use `SECURITY INVOKER`, fixed search paths and service-only execution grants. AuthGate remounts the dashboard on identity changes. IndexedDB/preferences, sample buffers and outboxes are account-scoped. Local storage is not encrypted; use separate browser profiles on shared computers.

The demo login is one empty tenant. Sharing its password also shares its workspace. Private testers need separate accounts.

## TradingView consistency

A random 32-byte token is stored as a SHA-256 hash in `pulse_connections`, unique per account/provider and expiring after 30 days. Rotation replaces the hash; Disconnect deletes it. This capability can only append journal events and cannot read account data or place trades.

The handler validates at most 8 KB, normalizes explicit events or strategy position transitions, applies a database rate limit and routes to the latest owned open journal started within 12 hours. Otherwise it derives a stable account/day UUID and timezone-aware day bounds. The RPC locks the connection and journal, verifies ownership/revocation/tombstones, deduplicates identical IDs, rejects conflicting IDs, inserts one or two events, updates journal metadata and receipt count atomically, then returns 202. No acknowledgment precedes durable commit. Per-journal cap: 5,000 events.

Calendar journals have fixed day bounds; ending a sensor recording does not close webhook intake for that day. Wearable samples align with alert timestamps without making their existence mandatory. UTC fire-time placeholders prevent historical bar timestamps from silently determining receipt-day alignment. Generated IDs have second precision; high-frequency identical fills require custom unique Pine IDs.

## CSV consistency

Client parsing is bounded to 2 MB and 5,000 rows. Preview is deferred during changes, and Import remains disabled until the current validated preview is ready. Local timestamps require explicit timezone confirmation; ambiguous DST values are rejected. Stable normalized event fingerprints and a tenant/event-set journal UUID make identical-file retries idempotent. Imported journals contain real user-selected rows and no generated samples. Distinct overlapping file sets are separate journals unless explicitly consolidated into the current journal. Automatic broker reconciliation is outside the MVP.

## Bounded work

| Work | Cadence / limit |
| --- | --- |
| Raw sample persistence | Each valid BLE notification, atomic sample/outbox transaction |
| Cloud sample upload | Completed 30-second buckets, up to 120 samples per request, 20 pending buckets per sync |
| Dashboard display | 1 second |
| Insight computation | User-selected 15 seconds to 60 minutes |
| Selected journal event poll | 15 seconds, independent of wearable status |
| Cloud journal history refresh | 30 seconds |
| Connection receipt status | 15 seconds while Connections is mounted |
| Chart output | At most 600 peak-preserving points |
| History / sample reads | Newest 100 journals / 100 chunks per paginated request |
| User / valid webhook rate | 120 requests/minute per database-backed key |

The Vercel and Supabase handlers are stateless and use Supabase HTTP rather than opening application TCP pools per request. Correctness does not rely on a process-local lock or background promise. CSV/connection UI and its parsing/timezone dependencies load on demand. Server and client body/data limits bound individual work; a rate ceiling is not a throughput guarantee.

## Resilience and deletion

IndexedDB sample/outbox updates are atomic. Uploads retain failed retry records. Local notes/trades remain usable during an outage; cloud refresh merges append-only events and notes by ID. A storage failure or BLE disconnect stops physiology capture while leaving journaling available. Raw recording has a 100,000-sample/12-hour sensor span limit. A closed/suspended tab cannot claim to capture wearable data.

Session deletion cascades children and creates a minimal tombstone to prevent stale uploads from resurrecting it. Auth-user deletion cascades sessions, connections and tombstones. Offline local/exported copies cannot be erased remotely. Note editing/deletion and multi-device conflict-resolution UI are later work. When multiple journals are open on different devices, webhook routing selects the newest eligible journal; there is no multi-tab exclusive session lock.

Expired connections and orphaned rate keys need scheduled maintenance as account volume grows. Invalid public webhook traffic should be limited at the platform edge before it reaches database lookup. Add measured WAF/IP controls and observability before widening the beta; no protection setting is disabled by this release.

## Capacity and growth

At one notification/second for 6.5 hours, a wearable trader produces 23,400 samples and roughly 780 chunks/day. At 10,000 simultaneous wearable traders that implies about 333 batch uploads/second, as well as metadata saves, authentication checks and multiple database operations per request. Selected-journal polling alone adds about 667 requests/second; history and connection polling add more. 10,000 such daily users produce 7.8 million chunks/day and 234 million samples/day before indexes/backups.

Those figures are sizing estimates, not a tested capacity. The Free tier is suitable for a limited beta, not an assumption of unlimited concurrency. The journal-only workload removes sensor ingestion but still requires measured auth/read/write capacity. Run representative multi-account staging load tests, including retries, simultaneous alerts, file imports and sustained backlog. Establish response/error/data-loss SLOs, and validate webhook p95 comfortably below three seconds rather than relying on a single successful request.

Growth after measurements: size Postgres and connection/auth budgets; add monitoring and account quotas; implement retention/partitioning and private object archives for raw samples; build incremental aggregates; replace polling if measured as a bottleneck; introduce a durable intake queue before expensive downstream processing; separate ingestion and reads if warranted. Do not add an in-memory queue or claim fire-and-forget work is durable.

No order execution, broker OAuth/API, wearable cloud integrations, automatic emotion inference, AI advice, billing or team membership is implemented. The architecture separates those future capabilities from journal access.
