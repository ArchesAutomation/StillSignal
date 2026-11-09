# Supportive preparation: first implementation

This change retires weekly/daily market theses and missions from the active UI,
while retaining their implementation and every saved record. Preparation remains
available through check-in, risk boundaries, optional personal conditions, and
intentions. Existing dashboard geometry and journal/Stillness editing remain intact.

## Try it

Open Command Center. **Review & Refine → Archived tools** opens a read-only view of
saved theses, missions/progress, and retired preparation steps with their answers
and revision history. Old internal thesis/mission destinations also open this archive.
Opening it does not require creating a trading day.

Choose **Start today's preparation**. In the existing journal setup, choose
Impulsiveness, Impatience, Fear, Greed, or General mindful review. This is a chosen
focus, not a diagnosis; experiences can overlap. Preview and edit the proposed
question, approve it or defer questions, and save. The four suggested preparation
sections have no thesis or mission prerequisite. Existing routines retain their
remaining custom steps, so their section count can differ.

Profile edits preserve approved questions unless the trader explicitly changes
focus. A started run retains its original questions; routine edits apply to later
runs. Skips remain skips, unknown answers remain unknown, and saving errors retain
the draft. No wearable is necessary.

## Code and compatibility

- `src/lib/process/active-preparation.ts` centralises retired-step selection.
  Active walkthroughs and summaries omit those steps without modifying definitions,
  run snapshots, responses, or archived rows. New runs still pin the full exact
  template snapshot, as existing validation requires.
- Preparation totals describe active steps by default. Historical execution-time
  rule evaluation explicitly includes original requirements, preserving its meaning.
- Dashboard/library, preparation tools and linked journal panels no longer mount
  thesis/mission editors. Existing layouts remain readable; archived card choices
  are not offered in the active library. Market-outlook display is retired with
  thesis, while saved layout data and the implementation remain recoverable.
- The profile gains optional `focus`; old profiles remain valid. Legacy habit
  questions are retained for profiles without a focus. The generated `pulse-process`
  copies of the profile/engine and new helper match shared source.
- Rule creation no longer offers or creates missions, including when an older
  on-device draft had mission creation selected. Existing playbook rules and
  mission data are retained.

This is a first foundation. It does not yet customise Journal/Stillness layouts
by focus, infer emotion, change interruption preferences, introduce contextual
post-loss prompts, or change broker trading. Existing pauses remain unchanged.
Daily session intentions and weekly reflection are not market-thesis planners and
remain available.

## Verification

Baseline: current Cloudflare version `5a7dc45f-3798-461d-a689-32bdc874aada`;
all 222 project source files found in its source maps matched checkout HEAD before
editing (normalised line endings). Two other source-map entries were dependency
files rather than repository source.

- `npm ci --no-audit --no-fund`: 278 locked packages installed using a workspace-local
  npm runner because this environment's Node installation has no bundled npm.
- Focused checks: `node --import ./tests/browser-environment.mjs --import tsx --test tests/supportive-preparation.test.ts tests/journal-guide-v3.test.ts tests/guided-preparation.test.ts tests/preparation-access.test.ts tests/preparation-reference.test.ts tests/preparation-schedule.test.ts`: 21 passed.
- `node --import ./tests/browser-environment.mjs --import tsx --test --test-concurrency=2 tests/supportive-preparation.test.ts tests/batch6-preparation.test.ts tests/process-domain.test.ts`: 13 passed after updating retired-feature expectations.
- `npm run check`: type generation/typecheck and all 333 tests passed. The build
  stage hit sandbox `EACCES` connecting to Cloudflare's own localhost runtime.
  `npm run build` rerun outside that sandbox passed. Existing vinext bundling and
  source-map warnings remain.
- Browser: synthetic `/review`, desktop Chrome, all four focus choices, archive
  navigation, no archived editors, save, skip and reload/resume passed with no
  browser errors. The 390px viewport fits after resize settles. Screenshots inspected.
- `git diff --check`: passed.
- `npm exec -- vinext check`: 13 supported features, 0 partial, 0 issues.
- A parallel full-suite attempt intermittently failed the unchanged CSV import
  test at `tests/journal-import.test.ts:335`. Its isolated rerun passed all seven
  tests; the complete check was retried with lower parallelism. No importer change
  is included in this PR.

Reproduce the isolated browser walkthrough with
`node scripts/test-supportive-preparation-browser.mjs`. Set `COMMAND_CENTER_CHROME`
to an installed Chromium executable if Playwright's browser is unavailable, and
optionally `SUPPORTIVE_QA_OUTPUT` to a scratch directory. It disables cloud settings,
uses synthetic review records, and restores Next's generated config edits.

## Rollout and review

No database migration, data deletion, dependency change, or live-account write.
The new optional profile field requires deploying the generated `pulse-process`
validator before releasing the frontend. Regenerate with `node scripts/prepare-edge.mjs`;
review its output for pre-existing unrelated generated drift. Do not deploy or
merge this revision automatically. Verify real authenticated saving on a preview
after coordinated Edge deployment; that live-service check has not been run.

Review closely the active-step policy, immutable run handling, archive completeness,
and focus-to-question save behaviour. Restoration is a deliberate code change to
the presentation policy and entry points; no original data needs rebuilding.
