# Daily Journal focused iteration — 23 October 2026

Implements `Still_Signal_Daily_Journal_Notes_for_Nick_2026-10-23.pdf` in the existing Daily Journal.

- The writing destination resolves its time from the selected trade's execution and phase, independent of the chart cursor. Entry/Exit use the CSV execution time; Before uses up to ten minutes before entry, Management uses entry through exit (or the available open interval), and After uses up to ten minutes after exit. A window's midpoint is the writing link; its nearest measured sample, within ten seconds, supplies the individual HR context. Cards show the full phase's recorded HR average. No timestamp or date-only execution yields “No linked time yet”; manual times are scoped to the current destination and checked against the journal day when saved.
- Expandable trade cards are the default sequence. Each phase contains its executions, notes, emotion labels, prompt source and screenshots, with editing, writing, voice and screenshot controls. Existing analytics styling is reused without changing analytics or emotion colors. The flat session list remains available through All session moments.
- Each save commits one JournalEntry containing the original answer, optional routing/time/HR/source/screenshot metadata, through the existing local and cloud sync path. Saving resets collection filters to reveal the new record immediately. Unsorted notes are expanded, and filters select the same underlying records without moving them. Unknown ownership can be saved as Unsorted; invalid explicit trade IDs are still rejected.
- Same-day sibling recordings supply their own HR measurements for links and saves. Sources are owner-scoped; delayed loads are discarded after navigation. A linked time may belong to another recording on the same day, while the note remains in its original recording and the consolidated day collection.

No database migration or edge-function/schema deployment is required. No demo data or production account is modified. Overview, Heart-Rate Analytics, Stillness design and trade reconstruction are unchanged.

## Verification

`npm run typecheck`, `npm test`, `npm run build`.

The new regression cases cover every trade/phase link, missing/date-only timestamps, absent HR, open trades, consolidation with explicit ownership, selector changes, save/filter/reopen retrieval and HR in another recording. The browser runner is `scripts/test-journal-trades.mjs`, against an isolated staging `/review` workspace. `BROWSER_EXECUTABLE_PATH` optionally selects an installed Chromium.

The browser check covers the two-trade flow, time/HR updates, exact multiline writing, phase filters, immediate Unsorted visibility, screenshot editor routing, day navigation and desktop/mobile fit. Screenshot upload and real microphone/WHOOP hardware remain checks for the signed-in mock session; the isolated review cannot upload to cloud storage. The installed Next.js version reports a pre-existing security advisory.
