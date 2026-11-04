# Observation dates and recovery - 4 November 2026

Follow-up for PDF items R1, R2, R3, R4, C2, C3 and H1.

- Quick caffeine entry and general observations use the trading day's named timezone, with timezone labels beside the editor and history. New observations default to the selected date. The current-time shortcut keeps that date rather than jumping to today.
- New local times in a daylight-saving gap or repeated hour are rejected with an explanation. Corrections that leave the displayed time unchanged retain the exact original instant, including seconds, milliseconds and the original offset of a repeated hour. Timestamp-valued observations preserve their original value in the same way.
- Correcting caffeine keeps its pinned variable definition instead of selecting the first matching caffeine variable. Existing definition bounds and historical records remain unchanged.
- Observation forms save recoverable local drafts and clear them after successful commit.
- An offline workspace no longer reports that cloud sync succeeded merely because its pending-write count is zero. The status distinguishes offline local storage from verified cloud sync.

Validation: 250 automated tests and the production build passed, including timezone conversion, historical-date defaults, daylight-saving ambiguity, exact correction round-trips, pinned definitions and offline sync status. This is not a reproduction of the account's original cloud rejection. Live browser verification remains unavailable after an automatic approval review usage-limit failure; no alternate browser or indirect live-page workaround was used.

No database schema or cloud validator change is required. Tests use synthetic records; no production journal records were edited for validation.
