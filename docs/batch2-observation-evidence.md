# Batch 2: check-in, caffeine, personal variables and dates

4 November 2026. Proposed frontend changes; not merged or released.

## Scope and baseline

- Separate worktree/branch: `fix/batch2-observation-integrity`.
- Started from current `origin/main`, merge commit
  `77ae7dc3334b02b974ad00aea4430a7a0d78e066`, after PR 46.
- PR 46 was merged and its `pulse-process` update was deployed before the merge.
  The normal Git frontend release was triggered. Production deployment
  verification was explicitly deferred by the user and was not performed.
- The user then requested codebase-only work for Batch 2. No account settings
  were read or modified. An earlier all-account caffeine-definition query was
  rejected by automatic approval review and returned no dataset; it was not
  retried through another route.
- The source retains production glass/ocean/appearance systems. No global CSS,
  renderer, process schema, persisted domain validation, shared form component,
  historical records, caffeine bounds, or account data were rewritten.

## Reproductions and proposed corrections

| Item | Before | After / evidence |
| --- | --- | --- |
| Multiple caffeine definitions | Quick entry silently chose the first matching mg definition. A synthetic Pepsi entry saved to it without asking. | Require explicit tracker selection when more than one is available. Display the chosen tracker and its exact bounds. The baseline regression fails; component and browser checks pass on this branch. |
| Existing caffeine in other units/types | Quick entry could create a new mg definition alongside an incompatible existing caffeine variable without explaining the mismatch. | Explain the mismatch and require explicit configuration; no conversion or widening. Corrections require their exact original definition, and a removed selected tracker is not silently replaced. |
| Historical check-in date | A check-in opened for 27 October saved with the current 4 November timestamp. The UI already displayed the historical day. | Default to the selected date in the trading timezone. Optional timing control uses the same DST-aware helper as other observations. Existing drafts without the new optional time field remain readable. The baseline regression fails; browser check uses Honolulu device time and New York trading time. |
| Shared rating correction from observation history | Correct opened an independent observation editor, allowing the derived rating to diverge from its source check-in. | Derived observations offer Correct check-in and open the original shared questionnaire. Its correction regenerates linked observations together. Superseded source answers are explicitly labelled as history, with no independent correction/removal controls. Original evidence is retained. The baseline regression fails; component/browser tests verify Focus changes from 7 to 9 consistently while the original stays 7. |
| Generic correction association/phase loss | A saved phase absent from the pinned definition's listed phases, or an unloaded recording/execution, had no matching select option. An unchanged form could submit an empty or replacement selection. | Retain explicit original options even when not currently loaded; preserve the exact instant and pinned definition. Normal domain validation still rejects genuinely unavailable references. This does not claim unloaded sessions can bypass validation. |
| Range-edit discoverability | The quick-entry range link opened the entire variable page without selecting the relevant definition. | An account-scoped, one-shot session route opens that definition's current editor. If session storage is unavailable the full list remains accessible. Browser verifies explicit range revision creates a new definition while existing doses remain pinned to the old one. |
| Builder clarity | Raw type labels, choices on every type, source controls and daily capture/administration were presented together. | Friendly type labels; numeric bounds only for numeric types; choices only for select types; sleep/caffeine/noise examples for new variables; optional collection settings and truthful source explanation. Management actions are separate from recording. No example is applied to an existing definition automatically. |
| Date/time display | Check-in timestamps and dashboard observation times used device-local formatting. Caffeine totals said today even on historical dates. | Use and label the trading timezone; caffeine totals identify the selected date. Timestamp-valued dashboard observations also use that timezone. |

## Acceptance inventory

| Batch 2 acceptance | Status / practical limit |
| --- | --- |
| Explain the actual caffeine unit/range report | **OPEN / VERIFY for the original account.** Code now makes tracker/unit/range selection explicit and preserves limits. A 60 mg fixture correctly rejects 160 mg; no claim is made about the affected account's intended setting. Account inspection was declined. |
| Discoverable range edit, historical pinned definitions | **VERIFIED LOCALLY.** Exact definition route and explicit 60-to-120 mg fixture revision passed in a browser; previously saved doses still point to the original 60 mg version. Existing pinned-correction regression also passes. |
| Multiple drinks, quantities, definitions and correction totals | **VERIFIED LOCALLY.** Two trackers, 2 x 30 mg plus 100 mg, then correction to 40 mg, show 140 mg across two entries. Tests exclude null/missing observations and superseded revisions from totals. New captures use the selected tracker; corrections retain their original definition. |
| Check-in corrections shared across preparation/dashboard/history | **VERIFIED FOR TESTED PATHS.** Preparation opens the same check-in, history corrections use its source, derived observations update, and the dashboard values test sees the correction. Original reports remain in immutable history. No real-account or exhaustive journal/navigation matrix is claimed. |
| Pre-session default and optional overnight-position links | **PARTIAL.** Browser verifies pre-market default and simple rating without advanced controls. Existing position-link implementation remains; no real overnight-position or multi-recording acceptance session was performed. Correction tests preserve original session/trade links. |
| Personal-variable builder simplification | **IMPLEMENTED / LOCALLY CHECKED.** Conditional fields, examples, plain labels, source explanation and separated management controls are present. Formal novice/position-trader usability sessions remain open. Section placement/mismatch remains owned by Batch 6. |
| Keyboard and timezone/date scenarios | **VERIFIED FOR TESTED PATHS.** Browser operates a rating by keyboard, uses a device timezone different from the trading timezone, saves historical data, revises it and reloads. Tests preserve repeated-hour seconds/milliseconds; PR 45's DST gap/repeated-hour rejection and general-observation drafts continue passing. Full keyboard traversal of every builder control remains open. |

## Validation

- 263 tests passed, zero failed, including all seven new Batch 2 tests and the
  existing caffeine-range, pinned-definition, DST, draft, process and database
  isolation regressions.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `scripts/verify-guided-journey.cjs`: passed with no unhandled errors, preserving
  setup, preparation, thesis/image refresh, check-in, caffeine, review, stillness,
  dark/light/mobile sampling and production materials.
- New `scripts/verify-batch2-observations.cjs`: passed with no unhandled errors.
  This script refuses non-localhost targets, uses only the isolated staging
  owner, and seeds synthetic definitions in its temporary browser profile.
- Screenshots: `outputs/batch2/batch2-historical-caffeine.png` and
  `outputs/batch2/batch2-shared-correction.png` in the task workspace.

The light-theme screenshot exposes the existing dark guided-panel/low-contrast
text problem assigned to Batch 5. Functional browser checks are not a claim of
contrast compliance. No theme CSS was changed in Batch 2.

## Release and remaining work

Frontend-only release; no SQL migration or cloud-handler release is required.
The added optional field belongs to the device-local questionnaire draft, not
the saved process record schema. Existing date helpers and server validation are
reused.

Return to the affected account's settings only if separately authorized. Keep
its original range report OPEN / VERIFY. Real overnight-position journeys,
formal usability work and the complete accessibility matrix remain open. Review
the PR before merging; production verification remains deferred as requested.
