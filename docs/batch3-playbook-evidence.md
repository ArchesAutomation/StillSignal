# Batch 3: playbook drafts, action feedback and reversible cleanup

4 November 2026. Proposed changes, not merged or released.

## Baseline and scope

- PR 47 was merged as requested: `8a70d093c43ccd90d7dc7be700d59f4b7ffe1134`.
  The normal main-branch frontend release was triggered. Production deployment
  verification remains deferred at the user's request.
- This batch starts from that current `origin/main` in its own worktree/branch,
  `fix/batch3-playbook-recovery`.
- Read `AGENTS.md`, `production-source.md` and `guided-journal-v3.md`. Production
  glass/ocean/appearance systems, saved records and historical definitions are
  preserved. No account data was accessed or modified.
- Ownership: playbook editor, shared persistent form behaviour, and thesis
  archive/restore feedback. No board geometry, rule evaluation, review scores,
  process schema, domain validation or global theme CSS was changed.

## Demonstrated causes and proposed corrections

| Scenario | Before | After / evidence |
| --- | --- | --- |
| Cancel and reopen an edited playbook revision | Text fields could restore through `PersistentForm`, while the button reset rule state to the committed version. Edited criteria were lost. | Keep controlled rule drafts separately for each original playbook version, alongside the existing account-scoped last-editor draft. Reopening resumes those rules. Legacy last-editor drafts still load. Baseline regression failed; component/browser checks now pass. |
| Supporting form under an inert container or collapsed details | Shared form attempted to focus its first input regardless of those inactive ancestors. The inert-container component regression demonstrated focus theft. | Suppress automatic focus/scroll for hidden, inert and collapsed supporting forms; skip disabled fields. The regression covers both inert and collapsed ancestors. |
| Closing an expanded editor | No shared return-to-opener behaviour. | Return focus and saved window position to a connected, visible opener when focus still belongs to the closing form. Do not override deliberate navigation outside the form or restore focus for forms that were inactive. Component test verifies focus and scroll return. |
| Playbook archive fails | No local failure feedback when the save returned false and the store supplied no error text. | Give explicit success/failure feedback for save, revise, archive and restore. A local in-flight guard suppresses concurrent submissions; failed saves keep the editor and drafts. Browser simulates one failed IndexedDB write, then retries successfully. |
| Draft's original playbook version is missing | The old restore code could treat it as a new playbook because `previous` was absent. | Report that the source version must be loaded, retain the raw draft, and do not silently open a new-record editor. Component test verifies no new editor and unchanged raw draft. |
| Account changes while an editor is open | Editor state was not keyed by owner within this component. | Key the playbook workspace by account so an open draft cannot be persisted under the next account's key. Test verifies the next account has neither the editor nor a copied draft. |
| Local draft storage is unavailable | The new per-version restoration path must not make the editor unusable. | Show a draft-storage warning but allow a fresh editor to open and commit through the normal store. Malformed record drafts remain distinguishable from unavailable draft storage. |
| Thesis archive/restore feedback | Cleanup explained retained history, but action failures had no local result message. | Explicit confirmed/failed action feedback and duplicate-action guard, with plain archive-versus-deletion wording. Original versions and linked evidence stay intact. Component test verifies failure, archive and restore. No destructive deletion is added. |

## Issue-by-issue acceptance inventory

| Batch 3 item | Status and limits |
| --- | --- |
| Original unclickable playbook fields / overlay interception | **OPEN / VERIFY: not reproduced in tested scenarios.** On this source build, native pointer clicks reached every playbook text section, rule criterion and related controls at desktop width; mobile pointer and keyboard entry also passed. The historical account/layout/overlay configuration was not supplied, so no speculative overlay fix was made. |
| Back / leave / return drafts across playbook sections | **VERIFIED LOCALLY for the fixture.** All seven text sections, rule name/criterion and an incomplete time window survive close/reopen, navigation away/back, and refresh. New per-version storage fixes the observed rule-loss path. PR 44's unfinished numeric/time-window and checkbox/multi-select tests continue passing. Not every transient browser number-input state is claimed. |
| Save / revise / archive / restore; historical blank-after-save report | **VERIFIED LOCALLY for the fixture; original report remains OPEN / VERIFY.** Browser creates one playbook after a failed write and rapid repeated submit, revises it, archives/restores it, and verifies four versions remain. Saved text/rules appear in the current record. No claim is made that the original account's exact blank-after-save sequence was reproduced. |
| Correct from relevant capture/history entries; closing returns to routine position | **PARTIAL.** Shared-form focus return and inactive-form handling are tested. Full guided browser journey still passes, including single-answer editing and per-trade correction. Every capture/history opener at every narrow/wide layout has not been exercised; check-in guides that do not use `PersistentForm` were not rewritten. |
| Loading/success/error feedback, repeated clicks and failure | **VERIFIED FOR TESTED ACTIONS.** Save/revise/archive/restore show confirmed outcomes; false/rejected saves show errors, and the playbook editor stays open. Component and browser repeated-submit tests confirm one append. Physical storage exhaustion and real cloud-failure journeys remain untested. |
| Archive/restore/version explanation | **IMPLEMENTED AND LOCALLY CHECKED.** One current row per playbook root; earlier versions stay in History. Copy explains archival and restoration. Browser verifies an assessment remains pinned to the original playbook after revision, archive and restore. Rule evaluation and score semantics remain owned by Batch 7. |
| Identify “activations” before removing them | **DECISION / EXPLORATION.** Record type remains unidentified. No guessed workflow or deletion was implemented. |
| Mistaken-thesis cleanup | **VERIFIED WITH COMPONENT TESTS.** Archive, failure feedback and restore preserve the original thesis and append revisions. The existing confirmation and retained-link semantics remain. No new media deletion or historical-data rewrite. Account-specific cleanup remains unverified. |

## Validation

- **272 automated tests passed, zero failed**, including all nine new Batch 3
  tests, prior form recovery, preparation, observation, immutable history and
  database isolation regressions.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- New `scripts/verify-batch3-playbooks.cjs`: passed with no unhandled browser
  errors. It refuses non-localhost targets and uses the isolated staging owner.
  It checks desktop/mobile pointer and keyboard access, every playbook text
  section, incomplete rule drafts, navigation and refresh, simulated write
  failure, repeated-submit protection, revision, archive/restore and pinned
  assessment history.
- `scripts/verify-guided-journey.cjs`: passed with no unhandled browser errors,
  preserving setup, preparation, weekly/daily thesis and images, shared check-in,
  caffeine, summary editing, review, stillness and sampled appearance/mobile
  behaviour. These functional samples do not close Batch 5's contrast matrix.
- Screenshots: task outputs `batch3/batch3-playbook-mobile.png` and
  `batch3/batch3-playbook-restored.png`, alongside guided-journey screenshots.

## Integration and release

Frontend-only changes. No process schema/domain-validation changes were made;
no generated cloud-copy update, Edge Function release or SQL migration is
required. Draft storage gains per-version keys while retaining the old
last-editor format; committed records and pinned evidence are unchanged.

Review this PR before merging. Production verification stays deferred. Keep the
original overlay/blank-after-save reports and the exhaustive correction-entry
matrix OPEN / VERIFY. Keep board overlap/reflow with Batch 4, contrast with
Batch 5, review calculations with Batch 7, and unidentified activations in the
decision parking lot.
