# Batch 7 — missions, rules and review

5 November 2026. Synthetic/code-only checks; production and account inspection deferred.

Fixed: Active missions now uses the selected trading date, retaining historical/future missions in the builder. Evidence labels explain qualifying actions rather than exposing enum names. The empty-rule selector explicitly explains the gap and opens Trade Quality's first-rule guide while retaining the mission form draft. Market outlook normalizes instrument whitespace/case and identifies the selected date/instrument and intraday scope. Distinct Daily plan and Daily chart records are retained, not deleted to hide a repeated label.

Validation: 284 tests pass. Three new tests cover mission periods, empty-rule creation routing and scoped outlook. Existing tests cover partial exits, stable closure/reimport keys, unknown states, broken/followed trades, corrections and mission progress. The existing full guided browser journey passes rule creation → mission → trade review → correction, optional stillness, preparation resumption and no-wearable writing, with no page errors. Optimized build/type validation passes.

The preparation mission card remains a reminder with a management route; the builder stays on its dedicated page. Multi-day goals carry across selected dates automatically. P&L does not determine adherence. Device-local invitation deduplication remains device-local. The originally reported account's duplicate Daily record was not inspected; automated tests verify separate scoped records. No schema/cloud update is required.
