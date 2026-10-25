# October 2026 implementation

The completed-session route now opens with a 64-second Stillness reset, with optional longer practices, box-breathing rhythms, open awareness, body scan and grounding after a loss. Skip, free voice, structured prompts and the journal remain user choices. The Settings preference persists per account.

## Implemented

- CSV date, account and custom-time preview; deterministic UTC filtering; overlapping recording/voice counts; source timezone, original-file reference and SHA-256. Crops that omit a position opening are blocked.
- Flat-to-flat trade ideas, partial entries/exits, reversals and account/currency separation. Merge/split presentation overrides retain original executions and allocate partial fills without doubling quantity. Legacy partial-entry note links remain readable.
- Chronological reflections ahead of compact stage windows. Prompt text precedes answers; labels are chosen at capture, including Following plan / model. The repeated Collected Notes section is removed. Free daily writing remains at the bottom.
- Durable local loading merges current records before displaying a reopened session. Offline startup recovers the account's own session index. Session generation guards protect explicit user navigation.
- Capture time, event time, LIVE/POST-SESSION, input method, neutral/idea/stage scope and original transcripts. The extension records provenance at creation and preserves it through corrections.
- Separate opt-in original audio capture, playback, download, deletion and a seven-day device-local retention period. Expired audio is inaccessible and purged on next app opening. Source CSV originals are also device-local; session data and transcripts retain existing cloud sync.
- User-defined commitments with category and dated self-assessment; environment, social context, setup, sleep, readiness, stress, news and strategy labels.
- Optional dated physiology snapshots, separate sensitive-field consent and deletion. Prior personal snapshots provide comparison rather than population ranking.
- Independent data-combination controls; normalized source-tagged UTC timeline; single-leader, single-currency P&L snapshot imports, observed peak/open-profit giveback/drawdown and measured threshold durations. Realised-only data never invents open P&L.
- Environment evidence counts distinct days, shows date ranges and underlying sessions, separates obvious confounders, and withholds comparison before minimum samples. Optional HR recovery, voice speaking-rate markers and live/later comparisons use explicitly enabled sources.

## External dependencies and data limits

Tradecopia streaming still requires approved partner/API access. No private API, password collection or access-control bypass is introduced. Existing broker connectors remain subject to their existing provider permissions and deployment readiness. CSV/export is the working integration route in this release.

Fills alone do not provide mark-to-market exposure, maximum adverse excursion or R multiples. Those measurements require an entitled price/P&L stream and explicit risk-unit data. Sparse snapshots report observed values and leave gaps visible. Voice pause, pitch and volume extraction are future analysis, not inferred emotions.

## Verification and deployment

Regression coverage includes six-fill lifecycles, reversal ordering, merge/split quantities, timezone/DST crops, tenant isolation, stale metadata uploads, audio ownership, original transcripts and extension retries. Browser checks cover import → Stillness → journal, save/refresh, compact stages, mobile width, P&L leader separation, audio record/play/delete and preference persistence.

Apply the additive metadata and extension-provenance migrations, then deploy the source-generated pulse-data validation function before releasing the frontend. Existing authentication and row ownership protections remain in place.

Release also updates Next.js from 16.4.0 to the compatible patched 16.4.3 release after the build identified the October security advisories: https://nextjs.org/blog/nextjs-security-update-october-14-2026
