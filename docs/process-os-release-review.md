# Still Signal — Process OS 2 review

## Status

This branch implements connected workflow extensions in all six release areas.
It is a review candidate, **not completion of every requirement in the master
specification**. The remaining work and unverified integrations below are release
gates. No merge, production deployment, migration application or live-data write
was performed.

Baseline: main at `18b1483`. Branch: `codex/trading-process-os-2`.

Draft pull request: https://github.com/ArchesAutomation/StillSignal/pull/34

Review commits: `85f9d85` implementation map; `bbcd6fe` preparation;
`99579ce` visual thesis; `1656a11` decision context; `fbba602` workspace modes;
`1b4bf12` replay; `04aa700` missions/development; `0c6f970` integration and
stabilization; `0d8798a` release documentation. Subsequent documentation-only
commits attach the final PR reference.

## Implementation and walkthrough

### 1. Preparation

Open Pre-Market, create a protocol, and edit its requirements. Requirements support
categories and up to four nested group levels. Reorder with drag and drop or up/down
buttons; duplicate, remove, undo and redo step edits. Clone existing protocols or use
the existing validated template import/export controls. Saved edits create versions.

Conditional requirements support exact instrument matching, missing daily thesis,
and a numeric observation above a threshold. Variable conditions pin the definition
version. Conditions are validated structured data, never executable code. Missing
measurements remain unknown; an evidenced false condition is excluded. Explicit
manual exclusions retain their reason. Historical queries exclude later corrections.

Start a run directly from the compact Command Center card. Complete its steps there,
expand/collapse groups, or open Manage for status/reason controls. Existing automatic
thesis/check-in verification is retained. Runs keep their original template and steps.

Files: `pre-market/workspace.tsx`, `condition-editor.tsx`, `grouped-steps.tsx`,
`use-editor-history.ts`, `process/conditions.ts`, `process/engine.ts`.

### 2. Thesis

Open Trading Thesis and create a weekly/daily plan or revise an existing plan. The
timeframe matrix supports custom timeframe names, independent directional biases,
structure, levels and invalidation. Scenario cards support primary, alternative and
no-trade roles, condition, confirmation, action and invalidation. No combined bias or
trade recommendation is generated. Existing weekly inheritance and intraday revisions
remain available.

Expand Chart levels & regions. When an exact instrument is available from recorded
execution metadata, request candles through the existing authenticated market adapter.
Add named, colored levels and region boundaries. Drag a level vertically, use arrow
keys, or enter its price. The source, instrument, interval, observation time and
annotations are saved in the thesis version. Missing feeds show an explicit empty
state; the editor never invents candles. Date boundaries use the trading-day timezone.

Text/typed-control drafts are account/day/base-revision scoped on this device and
recover when the editor reopens. Explicit save creates an immutable version and
clears the draft. Chart-only pointer changes require explicit save.

Files: `trading-thesis/{workspace,visual-plan,chart-plan,annotation-chart}.tsx`,
`process/model.ts`.

### 3. Decision inspector

Add Decision inspector through the Command Center card library. Select a playbook,
record a planned setup, then evaluate its version-pinned rules. Expand Recorded
decision context to inspect preparation at assessment time, the pinned thesis and
any manual override explanation. Existing manual responses, measurable execution
checks and manual execution linking remain available in Trade Quality.

Numeric adherence scores require at least 80% coverage by both rule count and rule
weight. Unknowns and exclusions remain separate. A high-weight unknown rule cannot
produce a confident score from several low-weight confirmations. This is process
adherence, not an estimate of profitability.

Files: `trade-quality/{inspector,workspace}.tsx`, `process/{model,engine}.ts`.

### 4. Workspaces

The existing free-position board and stable module portals are preserved. On pages
with a module board, expand Workspace modes, choose an editable starter, customize
the board and save a named mode. Load, rename through a saved revision, save copies,
archive modes and refresh synced records. Existing browser layouts become portable
when saved as a mode; no existing layout is deleted automatically.

Modes use the existing immutable `layout` process records, owner-scoped IndexedDB,
authenticated sync and server revision checks. Loading a mode changes placements
without replacing the board's connected module children. Local drafts and existing
board undo/redo, resize, keyboard movement and mobile stacking remain in place.

Starter visibility presets: Pre-Market, Live Session, Post-Session, Minimalist Trader,
Price Action Trader, Rules & Discipline, Physiological Research, Data-Driven Trader,
Blank Workspace. Presets affect the modules actually registered on the current page.
Command Center continues using its existing named cloud dashboards and now offers
Decision inspector, Plan versus execution replay and Process development as optional
connected cards. New cards start hidden in legacy layouts.

Files: `portable-modes.tsx`, `module-workspace.tsx`, `process/workspace-schema.ts`,
`process/workspace-presets.ts`, `process/dashboard.ts`, Command Center board/workspace.

### 5. Replay

Open Audits or add the replay card. Select a linked recording and scrub or step through
events. Process records appear at creation time; observations retain their separate
measurement time. Thesis/evaluation revisions recorded later remain hidden before
their creation. Executions retain source and timing caveats. Edited journal text is
shown only at its latest edit timestamp, because earlier text is not reconstructable
from a mutable snapshot. HR endpoints extend the cursor through available samples.

The chart reuses the existing Lightweight Charts implementation, completed-candle
replay, execution markers and saved thesis levels. Historical market reconstruction
does not claim proof of the original feed's availability. HR analysis reuses existing
artifact/pause exclusions, coverage, baseline and matched entry/exit windows. Samples
after the cursor are excluded. No emotions are inferred from HR. Open the source
journal for its screenshots and existing review tools.

Files: `process/replay.ts`, `audits/{replay,replay-market}.tsx`,
`synchronized-chart.tsx`, `audits/workspace.tsx`.

### 6. Intelligence and missions

Patterns retains its existing comparison/regression engine, uncertainty and sample
quality safeguards. Expand Saved analysis views to save/reapply filters as owner-scoped
process layout records. Results are recalculated, not frozen or invented.

Create an optional mission from the filtered analysis. Edit its interpretation,
evidence source, count and dates. The saved mission includes exploratory provenance,
filters, execution/day/recording counts and bounded source-observation references.
Existing Missions supports subsequent edits and evidence-derived progress.

Open Missions or add Process development to compare daily preparation, known/unknown
rules, violations, review coverage and variable collection. No-trade days remain
eligible. Counts are descriptive; the UI makes no causal or profit-guarantee claims.

Files: `command-center/{analysis-views,analysis-mission,pattern-explorer}.tsx`,
`process-goals/{development,workspace}.tsx`.

## Verification

- Baseline regression run: 209 passed.
- Extended regression run: 215 passed, including existing PGlite ownership/RLS,
  immutable revision, ingestion, storage, journal, broker and process tests.
- Typecheck passed.
- Final local production build passed after the module additions.
- Final extended browser journey passed: 23 checks, zero unhandled errors, including
  desktop/mobile layout, pointer/touch resizing, reduced motion, preparation,
  thesis/playbook/mission persistence, dashboard edits/reload, journal writing,
  text-draft recovery, scenario persistence and mode revision saves.
- Browser selectors were updated for the existing board's `display: contents`
  journal container, current Reset layout label, and the new coverage message.
- Real broker accounts, TradingView webhooks, WHOOP Bluetooth hardware, live market
  entitlements and authenticated multi-device cloud sync were not exercised.
- No production validation or remote migration-ledger verification is claimed.

## Remaining specification gaps and release gates

1. Conditional builder does not yet offer named-session, strategy-selection or
   structured economic-event predicates. Current numeric variables can represent
   user-recorded context; no economic-event feed is inferred.
2. Preparation has no configurable day-level warning/mandatory-override policy.
   Per-requirement reasons and assessment overrides exist; journals remain accessible.
   Protocol/playbook draft autosave and metadata-wide undo/redo are not implemented.
3. Thesis chart regions are horizontal boundary pairs, not time-bounded polygons.
   A new instrument must first have exact instrument metadata from an execution;
   a manual exact-instrument binding UI is still needed. Chart pointer edits are not
   draft-autosaved. Native screenshot capture remains in the journal workflow.
4. Workspace modes use the same process table/sync layer, but the page module library
   and Command Center card catalog are still separate registries. Automatic transitions,
   snap-grid options, compatible connected-card duplication and a full declarative
   capability/configuration registry remain to be implemented.
5. Concurrent remote revisions are rejected, preserving local records. An explicit
   remote/local reconciliation UI for already-diverged offline queues is still needed.
   A stale pending revision may block subsequent sync; refreshing is not a complete
   conflict-resolution workflow. Verify two authenticated devices before release.
6. Replay cannot reconstruct earlier mutable journal/ingestion snapshots absent from
   the source data. It labels uncertain timing and excludes later current note text.
   A complete historical journal revision ledger and inline private screenshot replay
   remain future work. Replays currently load locally available HR; use the existing
   journal/cloud recording workflow when local samples are missing.
7. Saved views and mission creation extend Patterns; this branch does not introduce
   a new automatic process-discovery engine, all requested native process-vs-process
   comparisons, or an aggregated mission-completion/profitability development chart.
   Existing statistical functions remain the source of analytical results.
8. Production interaction profiling, broad accessibility testing and real-device chart
   level dragging are unverified. No 60 FPS or complete accessibility claim is made.

## Database, deployment and rollback

No migration was added. Optional validated JSON fields reuse the existing October 29
process tables, immutable append function, references and owner isolation. Existing
records remain readable by this branch. No credentials or raw HR streams were added
to process records.

Before release:

- Resolve the release gates above and review the diff/commits.
- Confirm the deployed process migration ledger and existing RLS/indexes in an
  authorized staging environment; this branch did not inspect a remote ledger.
- Run typecheck, all tests, build and browser journeys on the release commit.
- Test new/legacy accounts, no-trade days, offline reload/retry, concurrent devices,
  conflict recovery, account switching and deletion/archival with cloud sync enabled.
- Exercise broker/CSV/TradingView ingestion, screenshots and WHOOP hardware in staging.
- Confirm market-data entitlements and missing-feed behavior for the exact instruments.
- Back up user process records and verify recovery before authorizing production.
- Merge and production deploy require explicit user authorization.

Rollback must retain the expanded server validators and current process schema.
Older strict validators cannot read the newly accepted optional JSON fields or new
card IDs. Roll back UI selectively while keeping this compatibility support; do not
strip fields from immutable user history or downgrade the server blindly. No SQL
rollback is required because no migration was added.
