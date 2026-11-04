# Batch 1: thesis persistence, sync and preparation evidence

Date: 4 November 2026. Status: proposed changes, not merged or deployed.

## Baseline and limits

Separate worktree/branch: `fix/batch1-thesis-sync`, from `origin/main` at
`fd604aafa2cc38000ca4bc4e3d12ab4191ba15d5`.
Vercel's project/deployment APIs confirmed that production still points to
`dpl_NB5dgFDbg6WoddrefYELvqkD9VBC`, READY, with the same commit metadata and
`still-signal.vercel.app` alias. The deployment's source is Git. The recovered
production UI described in `production-source.md` remains the baseline.

The public production landing page was opened. Production `/review` correctly
returned 404: the fixture route is restricted to local/staging with cloud
configuration absent. No authenticated production journey, real-account data
inspection, production mutation, merge or deployment was performed.

The original account's records, rejected request and pinned routine version were
not supplied. Synthetic reproductions below do **not** establish the cause of
that account's original failure. OPEN / VERIFY items remain open.

## Demonstrated causes and proposed changes

| Scenario | Baseline behaviour | Proposed behaviour / evidence |
| --- | --- | --- |
| Legacy thesis section without the newer explicit `activity` field; only its events/custom field is filled | Saved thesis is rejected as preparation evidence. The legacy activity inference used by the UI was not used for the extended evidence fields. | Use the existing `activityOf` compatibility rule. A legacy events-only plan is accepted without rewriting the pinned template or records. Regression fails on baseline and passes on this branch. |
| A generic or case-equivalent saved plan, or an intraday revision of the daily plan | Preparation accepts the record, but the editor's exact instrument/scope comparison automatically opens another new-plan form. | The editor uses the same generic/case-equivalent matching and treats intraday revisions as daily evidence. Component tests verify no automatic duplicate form and no unrelated-instrument card in the routine. Explicit New plan remains available. |
| Weekly record with a valid non-Monday period start covering the selected date | Verification accepts its seven-day period, but the editor only displays a Monday-start week. | Shared day/period matching is used by both the editor and verification. Tests cover an applicable period and its end boundary. |
| Valid first row followed by a malformed row in a local storage batch | Helper rejects, but IndexedDB commits the first row. This is a storage-helper failure reproduction; the normal save hook already prevalidates its entire batch. | Validate all rows before opening the transaction and abort on transaction failures. The regression confirms zero rows committed on rejection. |
| Pending upload is rejected while newer cloud evidence exists | Sync throws before downloading anything; Refresh retries the rejection without retrieving the newer records. | Stop uploading at the first failure, retain pending writes, still download cloud records, and propagate the upload error. The workspace reloads downloaded evidence even on sync failure. Fake API/storage and mounted-hook tests verify displayed evidence, pending flags, conflict preservation, offline state and retry. |
| Process proxy rejects a malformed request, or upstream returns structured validation fields | Proxy reports generic `Invalid request.`; client discards upstream field details. | Proxy returns bounded field paths/messages; client includes up to five supplied field errors. A malformed list cursor reproduces the generic proxy rejection. This is not a reproduction of the original account's thesis payload. Authentication and request limits remain in place. |
| Device goes offline after a successful sync | Status is only refreshed by a later timer/save/online event. | Subscribe to the offline event as well. Hook tests verify offline pending status and recovery after a successful retry. |

## Batch acceptance inventory

| Batch 1 item | Status and evidence |
| --- | --- |
| Original weekly/daily thesis appears saved but routine refuses completion | **OPEN / VERIFY for the affected account.** Related legacy-field mismatch reproduced and corrected locally. Normal weekly/daily save-to-completion paths passed in a real browser using isolated fixtures. |
| Original `Saved locally - Invalid request` | **OPEN / VERIFY for the affected account.** Generic proxy error and discarded upstream details reproduced independently. Improved diagnostics proposed; no claim the original server/account cause is fixed. |
| Plan/date/instrument/template selection | **VERIFIED LOCALLY for tested cases.** Applicable seven-day period, excluded period, generic/case-equivalent instruments, unrelated instruments, daily/intraday reuse, current revisions and archive handling have automated evidence. Existing pinned-template/history regressions pass. Real legacy-account combinations remain unverified. |
| Create / revise / keep / complete / refresh / repeated clicks | **VERIFIED LOCALLY for tested cases.** Browser saves both scopes, reloads unsaved text, reloads committed records, checks two immediate form submissions add only one thesis, and completes the routine. Keeping an applicable plan opens no automatic duplicate editor. Existing revision test confirms hidden saved analysis survives a visible-field edit. Exhaustive user-managed create/revise histories remain unverified. |
| Failed local save, cloud failure, offline recovery, retry | **VERIFIED WITH ISOLATED TESTS.** Rejected local batch is atomic; API rejection retains pending flags; successful retry does not duplicate rows; network failure retains records; mounted workspace shows downloaded evidence after upload failure and responds to offline/online events. Physical disk-full/browser-storage-denial journeys remain untested. |
| Stale tabs and multi-device conflicts | **PARTIAL / OPEN.** Existing stale-revision/immutable-write tests pass. New fake-cloud conflict test downloads the competing revision, preserves both histories and leaves the rejected local revision pending. No automatic reconciliation is introduced. Same-revision branches and a usable reconciliation workflow, plus two authenticated devices, still need investigation. Refresh must not be described as resolving the conflict. |
| Progress complete/incomplete/skipped/unverified and return to prior step | **PARTIAL / OPEN.** Existing preparation/reference/blocker tests and full browser completion pass; draft and activity position survive repeated refresh. Exhaustive combinations of old runs, cadence carry-forward and edited evidence are not browser-verified. |
| Images reopen; local files are not described as cloud attachments | **VERIFIED LOCALLY for selected PNG.** Browser attaches a PNG, reloads, verifies decoded image dimensions and checks device-local wording. No attachment storage changes. Clipboard/drop, missing assets on another device, upload-in-progress submission and all image formats remain unverified. |

## Validation

- Four new failure tests were run against the unchanged baseline: legacy evidence,
  local atomicity, sync/error detail behaviour, and proxy diagnostics failed;
  existing selected tests still passed.
- Full test suite: 256 passed, zero failed (including existing database/RLS,
  historical records, observation, preparation and cloud-schema regressions).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Extended `scripts/verify-guided-journey.cjs`: passed, no unhandled browser
  errors. It uses an isolated staging owner, synthetic executions and fake
  microphone; it cannot connect to a real cloud account. It now checks thesis
  draft/record refresh, repeated submission counts and decoded local images.
- Screenshot: `batch1-weekly-plan-reopened.png`, alongside the existing guided
  desktop/light/mobile/preparation screenshots in the task's outputs directory.

New tests use no real account or synthetic production data. Test clients are
disposed after each browser-state check.

## Integration and release order

Domain evidence validation changed. `node scripts/prepare-edge.mjs` was run;
the changed process engine and shared thesis helper are included in the cloud
copies. Unrelated generated line-ending noise and an unused, unrelated generated
observation-time helper were excluded from this PR.

1. Review the proposed changes and open verification items.
2. Deploy `pulse-process` with the generated engine and thesis helper **before**
   the frontend, so server/client legacy thesis evidence rules agree.
3. Release the reviewed frontend commit; no SQL migration or record rewrite is
   required. Historical evidence and pinned definitions are retained.
4. Validate authenticated sync/reopen with a test account, including a real
   two-device conflict. Capture the original affected account's rejected payload,
   routine version, selected day/instrument and server error before closing its
   two original reports.

This PR does not merge or deploy itself. The integration owner controls release.
