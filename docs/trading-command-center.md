# Still Signal trading command center

This change extends the existing Next.js/TypeScript/Supabase application. Sessions,
WHOOP Bluetooth recording, CSV/TradingView ingestion, reconstruction, journal
capture, chart/replay, Stillness, and existing performance/HR views remain intact.

## Implemented workflow

- Command Center is the signed-in default. Explicitly open a trading day; select
  instrument, account, timeframes, timezone, status, and process goal. Existing
  recordings are associated by trading date or explicit session links.
- Pre-Market supports reusable protocols, required/optional/conditional steps,
  applicability notes, ordering, expected windows, manual responses, and
  evidence-backed verification of saved theses and temperature checks. Verification
  is an explicit action; it does not silently rewrite earlier preparation.
- Weekly/daily theses, derivation, intraday changes, revision reasons, per-timeframe
  biases, scenarios, levels, invalidations, no-trade conditions, notes, and chart
  links retain immutable versions. Execution-time context selects an available
  version, never the trader's subsequently revised outlook.
- Personal variables support all nine requested types, custom categories, units,
  ranges, options, collection phases/frequencies, archival/restoration, typed
  observations, explicit missing states, corrections, and template import/export.
- Temperature questions can be added/renamed/removed and recorded repeatedly.
  Their actual answers also become version-pinned, self-reported variable
  observations, so comparisons do not require duplicate entry. Removing a check-in
  excludes its linked observations from current analyses.
- Playbooks retain versioned criteria, rule IDs, and weights. Planned setup reviews
  can later be linked to actual executions. Imported/existing execution reviews
  are retrospective. Aggregate position limits remain manual without a reliable position snapshot. Manual and execution-verified evaluations remain distinct.
  Maximum single-execution quantity, trading-time windows, preparation, and explicitly configured thesis
  alignment rules can be verified when the required evidence exists. Missing data
  stays unknown. Process scores show unknown/excluded criteria and coverage.
- Missions count their declared evidence sources or explicit manual confirmations.
  No-trade days remain in preparation and review evidence. Audits retain daily,
  weekly, or monthly evidence snapshots, reflections, next goals, and revisions.
- Layout presets support panel ordering (drag/drop and keyboard buttons), visibility,
  single/full-width desktop panels, default selection, status widgets, market-context
  visibility, saving copies, and resetting to the original layout.
- Journal/Live Session add a collapsible context inspector using the existing
  recording and execution IDs. Source links open the original journal/chart.

## Data and ownership

The additive migration creates 15 dedicated tables: `trading_days`,
`protocol_templates`, `protocol_runs`, `protocol_responses`, `thesis_revisions`,
`variable_definitions`, `variable_observations`, `temperature_checks`,
`strategy_playbooks`, `trade_assessments`, `rule_evaluations`, `process_goals`,
`process_progress`, `session_audits`, and `dashboard_layouts`.

Each row is an immutable version with a stable root ID, previous-version ID,
revision, client creation timestamp, server receipt timestamp, and ownership.
Protocol steps and strategy rules are stable-ID arrays inside their immutable
parent definition versions; actual runs pin the definition and step snapshot.
There is no need to migrate the database for each new personal variable.

All tables enable RLS. Authenticated clients can only select their own rows;
mutations pass through the bounded authenticated `/api/process` proxy and the
`pulse-process` Edge Function. The Edge handler resolves the bearer token with
`getUser`, validates domain types/references/session ownership, and uses the
service-only `pulse_process_append` transaction. SQL also checks same-owner
references, immutable revision lineage, idempotency, and uniqueness. No new
`SECURITY DEFINER` functions or public write grants are introduced.

IndexedDB keeps separate owner partitions and a durable append queue. Every sync
request rechecks the expected authenticated account, including after a mid-sync
account switch. Retries reuse IDs; a stale revision is rejected and the local
copy is retained rather than blindly overwriting another device's revision.
Concurrent conflicting edits require explicit reconciliation; no last-write-wins
merge is performed. Normal offline writes and later reconnect/retry are supported.
HR samples remain in the existing stores and are not copied into process records.

## Analytical definitions

- HR windows: 5/1 minutes before entry; a 10-second entry/exit neighborhood;
  reconstructed holding interval when fully available; and 1/5 minutes after exit.
- Baseline: the completed opening recording window (existing user baseline setting),
  ending before the execution and requiring at least 80% observed time coverage.
  The event itself is excluded from the baseline.
- HR summaries honor existing journal HR source opt-outs, measurement pauses, recording bounds, and artifact flags. They integrate usable timestamp intervals. Gaps longer than ten seconds
  are missing, never interpolated or counted as observed threshold time. Windows
  report sample count, observed-time coverage, missing intervals, mean/max baseline
  deviation, observed change per minute, and measured time above the configured
  threshold. Date-only and approximate order-update imports have no high-resolution execution-aligned HR windows.
- Recovery means a continuously observed 30-second period within baseline ±5 BPM,
  within five minutes of exit. A disconnect before recovery makes it unavailable.
- Environmental associations use the latest applicable prior observation for the
  pinned definition, day, session, and execution scope. Event doses retain actual
  observation times; they are not silently aggregated into daily totals. Corrections
  and removals affect current analyses while old record versions remain inspectable.
- Comparisons report executions, independent trading days, recording sessions,
  missing/filter exclusions, distributions, and observed effect sizes. Different
  definition versions are separate groups; mixed-unit numeric scatterplots require
  choosing one version. Conditional filters include strategy, instrument, account,
  date/hour, recorded bias, execution ordinal, prior recorded loss, and HR coverage.
- Exploratory two-group intervals use deterministic whole-day cluster bootstrap,
  resampling shared days jointly. At least five days per group are required; these
  are not significance tests or causal claims.
- Optional two-predictor OLS uses complete numeric observations from explicitly
  selected definition versions, centered/scaled fitting, original-unit slopes,
  and day-cluster robust standard errors. Results require at least 100 complete
  executions across 30 days; constant/collinear predictors are refused. It does not
  adjust for unrecorded confounders.

Automated motif discovery, clustering/change-point research, and composite readiness
scoring are intentionally outside this initial deterministic release. No LLM, trading
signal generation, automatic emotion inference, WHOOP cloud API, or invented account
data is added.

## Verification and release

Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit`.
`npm run prepare:edge` regenerates the shared-source Edge Function bundle. New tests
exercise PostgreSQL RLS/permissions/revision/ref constraints, offline ownership and
retry safety, timestamp history, missing data, variable units/corrections, HR gaps,
no-trade evidence, regression thresholds, and day-cluster uncertainty.

For the isolated desktop/mobile browser walkthrough:

```sh
# Uses only /review, with cloud configuration explicitly removed in the child server.
node scripts/test-command-center-browser.mjs
# Or set COMMAND_CENTER_CHROME to a compatible installed Chromium executable.
```

The walkthrough creates only temporary browser-context records under the reserved
review fixture account; it does not write to a real Supabase account. It covers
preparation, weekly/daily thesis, temperature, personal variables, planned setup
reviews, missions, audits, preset persistence after reload, Patterns, and mobile
layout, and checks for unhandled browser errors and page overflow.

Before production activation, review/apply the additive migration to the correct
existing project, deploy `pulse-process` from the generated bundle, and deploy the
Next.js branch. Check real authenticated reads/writes with two test users, reconnect
behavior, and a real WHOOP session on a preview environment. Those live-service and
physical-device checks are not replaced by the local database/browser tests.

Keep the rollout additive: retain the new tables and immutable records on a frontend
rollback. Do not drop process tables or rewrite previous data to roll back the UI.

## Production integration

The release merges the production `codex/journal-space` history at
`5fbc4bc07418afd4a5fe2d636be87c65c8e90cdf` into the Command Center branch.
The production journal workspace, inline edits, phase highlights, recording and
screen capture, private audio/files, session context, weekly reviews, and their
regression tests are retained. The new workflow navigation uses the existing
journal shell. No production source files or migrations are removed.

Validation includes the combined test suite, type checking, a production build,
and isolated desktop/mobile browser checks. The browser checks also save a journal
reflection and navigate between the journal and process pages. Real-service checks
and any physical WHOOP test are reported separately at release time.


### Simplified command workspace

The main navigation contains Command Center, Daily journal, Patterns, Stillness, and Settings. Preparation, thesis, trade-quality reviews, missions, audits, and personal variables are opened from their Command Center panels or footer, with a return-to-Command-Center button. Existing session tools remain available from the journal shell.

A day without process records shows actionable empty panels instead of requiring a setup form. Choosing a process action explicitly creates the trading day with the browser timezone and no assumed instrument, account, observations, or completed requirements. Day settings remain available for optional context and revisions. Opening the journal does not create a process day.

The dashboard shows compact summaries without visible select controls. Detailed builders and layout configuration remain available on demand. Temperature ratings use labeled 1–10 buttons; tapping the selected rating clears it back to missing. Historical data, layouts, backend ownership checks, and recording behavior are unchanged.
