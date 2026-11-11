# StillSignal: shared redesign direction and continuation instructions

This is the shared redesign direction, updated 11 November 2026. Read it before designing or implementing another milestone. The decisions below apply across feature PRs. Record changes here after review so a future chat can work from the repository and its references.

## Start here

Continue with Done for the day after the Preparation implementation is approved for merge and merged into integration. Inspect the references below and verify the live repository and preview state. Caleb wants visual iteration before implementation and explicit approval for each merge and production release.

Repository: https://github.com/ArchesAutomation/StillSignal

Live application: https://still-signal.archesautomation.workers.dev

Journal PR: https://github.com/ArchesAutomation/StillSignal/pull/78

Read [Journal implementation and verification](https://github.com/ArchesAutomation/StillSignal/blob/bf4ed9dc5271ebd0908e4c615de69e58ea150202/docs/reading-room-journal.md) for the real changes, checks and synthetic `/review` setup. Check out the relevant PR revision to reproduce it; do not assume a previous chat's checkout or server exists.

## Mandatory visual references

- [Reading Room HTML](design/redesign-reference/01-reading-room.html): the primary whole-experience reference, including Home, Preparation, Stillness, Done and Journal. Open it in a browser and exercise the interactions.
- [Quiet Hours](design/redesign-reference/02-quiet-hours.html) and [Daily Space](design/redesign-reference/03-daily-space.html): alternatives retained as possible future presets.
- [Comparison index](design/redesign-reference/index.html), [comparison image](design/redesign-reference/comparison.png) and [reference walkthrough](design/redesign-reference/README.md). The folder also includes editable `app.js`, `style.css` and `build.mjs`. Each numbered HTML works by itself.
- [Implemented Reading Room Journal screenshot](design/redesign-reference/implemented-journal.png): synthetic `/review` fixture of the actual PR #78 implementation.
- [Stillness proposal 1](design/stillness-proposal/index.html) and [desktop screenshot](design/stillness-proposal/library.png): a refinement of the original Reading Room library with horizontal navigation. Open the HTML from a checkout with its sibling files present. It uses only a fixed sample day and browser-local demo data.

Distinguish the references: the prototype expresses the intended wider experience; PR #78 implements real Journal behavior. Its working components take precedence over simulated prototype Journal interactions. The latest agreed navigation is horizontal across the top, even though the original Reading Room HTML used a sidebar. If files are unavailable, say exactly which are missing; do not substitute a guessed Reading Room aesthetic.

## Shared visual foundation

Reading Room is the current basis: warm paper surfaces, lavender with pink and sage accents, generous spacing, clear hierarchy, quiet borders, friendly language, serif display headings and readable sans-serif controls/body text. Use the actual HTML and implemented CSS to recover exact measurements rather than guessing from this description.

Original prototype tokens: background `#f7f6f2`, panel `#fffefa`, text `#302e3b`, muted `#787381`, border `#e5e1e8`, accent `#71609a`, soft lavender `#ece6f6`, green `#dce9dc`, pink `#f2e1e8`; base radius 18px. Prototype display type is Georgia/Times New Roman and body is Arial/Helvetica. These are reference values, not a claim that all current app components use them identically. Inspect `src/app/reading-room.css` and scope/reuse styles so existing workspaces remain intact.

Pages must look related while having distinct purposes. Do not give Preparation, Stillness and Done the same checklist layout with changed titles. Preserve the quiet visual language, shared navigation, buttons, spacing and surface treatment. Extract shared production components/styles where justified by actual reuse; do not rewrite the application or add a design-system dependency to achieve this.

Glass and decorative backgrounds are off in the starter view. Nick's optical glass, background-image and shark implementations must remain available in the code; do not delete or pave over them. Sharks are not a redesign priority. An interactive globe was an earlier requested idea, but simplicity comes first: its exact placement and behavior remain for review and it is not a reason to introduce decorative distractions.

Desktop is the design priority. Preserve existing mobile fallback usability; mobile redesign is outside this phase.

## Product purpose and common flow

Support the person through the Big 4, in a form others can also use. Ready-made support comes first, selecting/personalising comes second, and writing or recording original material is optional.

Core flow:
Home -> Preparation -> session / Journal -> Done for the day -> optional Journal reflection.

Stillness library -> preview individual piece or complete sequence -> add to Preparation or Done for today -> use it -> optionally reflect into the existing Journal.

Use the application's actual Big 4 labels/data. Allow multi-selection. Prototype tags include Fear, Greed, Impatience and Impulsiveness; inspect the existing canonical implementation rather than introducing conflicting labels.

## Page responsibilities

### Home: integrated

A welcoming, simple entrance into today, with clear routes to Preparation, Stillness, Done and Journal. Summarise relevant daily context without recreating a competing Command Center. Integrate links/state from the completed daily flow. Keep weekly supportive reflection accessible without making it an assessment or mandatory task.

Home uses #79's Reading Room welcome, day cards, featured support and weekly reflection with horizontal navigation. Choose any of the canonical Big 4 to get support with patterns that may arise **during trading**. The choices save to the current trading day. Explore Stillness opens the existing library with those filters and a relevant preview. The library's filters can be changed independently. Home links to Reading Room Preparation, the existing Done workflow and the real Journal.

### Stillness: integrated

A support library, replacing the cumbersome manual builder experience rather than merely restyling it. Make reminders, practices and complete sequences discoverable and previewable before adding. The Reading Room prototype offers a card library and adjacent preview; use it as the concrete starting reference, then refine with Caleb.

Adding defaults to **just today**. Offer explicit optional saving for future days; do not silently establish a recurring routine. Allow Preparation or Done as the destination and offer Undo. Keep a complete experience together as a sequence with optional/skippable steps and later customisation. Do not immediately explode it into independently configured pieces. Personal writing/recordings remain optional. Reuse actual run/profile/content structures and inspect legacy compatibility before schema decisions.

Caleb approved the card library, side preview, today-only add and Undo, reusable saved support, grouped playback with optional steps, and handoff to the existing Journal composer. The feature uses dated trading-day records and the existing process save and sync path. Preview, playback and skip are read-only. Reflection opens today's Journal composer and is saved only when the user submits it. The existing personal routine editor, recordings, and reset practices remain available below the library.

### Preparation

Reading Room Preparation follows #79's Today’s path layout and Home’s colours. Open it from Home or from **Preparation** in the top navigation. The optional arrival chips save as a pre-market check-in and appear under **How you arrived** in the Journal’s **Daily reference** for that date. Intention and boundary save together on the existing trading day. **Save for today** saves without starting a session. **Start session** saves any edits, starts through the existing session controls and opens Journal. All fields can be left blank.

Preparation shows today's Home choices and a Stillness suggestion in the support card. Opening the suggestion seeds the library's editable filters. Support joins today's list only after an explicit add. **Initial setup** opens the existing guided tools and routine library. Existing layouts, saved runs and their pinned requirements are retained. Preparation’s arrival, support and intention sections provide the basis for future widgets.

### Done for the day

Primary place to end a session once ready. Outcome choices belong here. Review process, offer selected closing support and optional reflection. Do not require original writing to complete the day and do not turn this into another Preparation screen.

### Journal: implemented first milestone

PR #78 arranges the real Journal around daily reference, session rhythm and moment-by-moment entries/evidence. It preserves before/entry/management/exit/after, day-level entries and entries without a trade, the existing chart/layers/measurements/gaps, evidence presentation and editing. No replacement evidence drawer or simulated Journal is authorized.

Reading Room is an additional non-default starter preview. Entering it must not overwrite an existing dashboard or saved default. Daily reference is movable/resizable using the same editor and reads selected-day records. Existing move, resize, hide, restore, Undo, Cancel, Save, snapshots and old widget identities/arrangements remain. Secondary widgets are hidden in the starter but restorable. Header retains recording status and accessible Start/End controls; secondary actions use its tools menu until future session-flow transitions are reviewed.

## Preserve throughout

Floating capture, screenshots, audio, transcript/evidence display, dictation, imports, journal history, heart-rate collection/data, session controls, calendar and chart behavior, account persistence and historical data. The prototype is not a replacement for these implementations. Inspect existing code and reuse functioning helpers and widgets.

Do not archive functionality simply to simplify navigation. As replacements become usable, remove Command Center and Patterns from the top bar and retain them through **Additional tools**. Keep existing destinations usable until their replacements are complete.

Later appearance milestone: Reading Room, Quiet Hours and Daily Space presets, plus create-your-own palette with live preview and optional background image/glass. Colour changes must preserve arrangements. Applying a different layout is explicit. These are agreed future capabilities, not already implemented in #78.

## Milestone and integration workflow

Agreed order after Caleb moved Home earlier: Journal (#78) -> Stillness (#80) -> Home -> Preparation -> Done for the day -> combined release. Finish the navigation transition when the destinations are ready. Appearance personalisation is a later milestone.

The shared base is [`integration/reading-room-redesign`](https://github.com/ArchesAutomation/StillSignal/tree/integration/reading-room-redesign). It started at main `d6aa146647e289a8acba104e580e36b45da3d4f3` after verifying that production still served the same Worker version whose embedded source matched that commit in the Journal handoff. #78 was retargeted only after checking its Journal-only diff and confirming the new base has the same SHA. Read repository instructions and verify live repository, PR and deployment state in each continuation.

Create each feature branch from integration after the preceding milestone has been approved and merged there. Target integration and apply `manual-merge`; no automatic merges. The user's integration instructions take precedence over the repository's generic PR-to-main instruction for these milestone PRs. The trusted auto-merge policy also rejects draft PRs, `manual-merge` and non-main bases. Review the combined experience on integration. Open a single final release PR into `main` after the combined review. Cloudflare Builds deploys merged `main` automatically; explicit release approval is required. Do not change deployment settings to assemble the redesign.

Before a new feature PR, read this document, the actual prototypes and integration's current code. If the shared direction PR has not yet been merged, read its branch. Update this current direction and the milestone record in the same feature PR when Caleb agrees a change. Record the PR and base, verified revision, exact checks, screenshots/reproduction, gaps and next-chat prompt. Use the PR head link for its current revision rather than trying to embed a commit's own SHA in that commit. Always distinguish proposed, implemented, reviewed, merged to integration and released.

## Verification and review rules

Smallest complete change, separate branch, existing repository conventions, no unrelated cleanup or dependencies. Before pushing, run focused checks, `npm run check`, relevant local browser verification and `git diff --check`. If required checks cannot pass, keep new changes local and explain the blocker. Document all substantive files/changes, exact commands/results, setup/migrations and gaps in each PR; apply `manual-merge` and require review. Explain where behavior lives and how Caleb can reproduce it.

At #78 handoff: 337 tests, TypeScript and production build passed; vinext compatibility check and diff check passed. Browser verification covered selected-day navigation, populated/empty days, chart layers/zoom, moments/evidence/stages/editing and dashboard preview/edit/Undo/Cancel/Save/snapshot/reload. Physical microphone/HR/screen capture and authenticated multi-device saves were not exercised. Inspect #78 documentation for exact evidence and commands; do not imply this covers future changes.

Supabase preview branches are disabled. Cloudflare branch-build success does not prove backend isolation; the build-details read returned HTTP 403. No authenticated preview save tests were performed. Inspect actual preview bindings and agree a suitable test account/data path before authenticated writes. Use the existing synthetic `/review` fixture with cloud URL/key variables empty for local interaction verification. Production was verified unchanged at handoff.

## What is agreed versus still open

Agreed: the purpose, five destinations, Reading Room basis, top navigation, existing systems preserved, library-first interaction, just-today default, sequence integrity/skipping/later customisation, Done outcomes, optional writing, dashboard compatibility and reviewed staged delivery.

Stillness and Home are integrated. Caleb approved the Preparation proposal and its implementation is ready for draft review. The Done layout, the final navigation transition and later sequence customisation remain open. At combined review, Caleb wants the Reading Room Journal to be the view people see when they open Daily journal. Decide how that landing behavior should respect existing custom dashboards, and revisit how Command Center and Patterns move out of the main navigation. Saved support requires an explicit choice each time it is added to a day.

## Stillness design reference and original reuse plan

- Start with the existing `PageDashboard` and Stillness widget identities `personal-stillness` and `stillness` in `src/components/concept/workspace.tsx`. A library-first starter can keep personal content and practices reachable and existing layouts intact. Reuse the Reading Room material scope and tokens from #78; leave app navigation and default layouts alone during this milestone.
- `SavedStillness`, `StillnessBuilder`, `PersonalStillness` and `RoutineAudio` already handle account-scoped routine revisions and existing device-local audio. Keep the original editor/playback available as personal support. Reuse practice behaviour from `SessionReset` and existing Stillness components, and the canonical `supportFocus` labels in `src/lib/process/journal-guide.ts`. Multi-select filters do not change the existing single-focus profile.
- `useProcess` already persists account-scoped dated records and revisions. Existing `protocol` definitions, `run` step snapshots and `response` records preserve pinned preparation history. The personal `profile.stillness` shape is a flat, context-tagged list; it cannot represent a dated collection of grouped sequences for both destinations. Inspect run/day lifecycle and sync validation before selecting the smallest backwards-compatible representation. Keep choices attached to the actual current day and timezone; do not use whichever historical day the Journal happens to show. Saving for later is explicitly opt-in; the proposal keeps it as a reusable saved choice rather than silently applying it every day.
- Command Center already holds the daily dashboard, Preparation entry and review entry. `preparation-workflow.ts` and `active-preparation.ts` govern existing runs and context; `SessionReviewGuide` and post-session support already handle review/outcomes. Use small support entry points in the current flows for Stillness. Full Preparation, Done and Home layouts and session-flow changes each get their own milestone. Patterns and its existing analytics stay reachable; move links only during the later navigation transition.
- Route optional reflection into the existing Journal composer with the correct day context. Preview, skip and finish are distinct and should not create a Journal entry. Use existing capture, audio and dictation paths rather than creating a second editor or storage store. Proposal copy, step timing and the extent of later customisation still need review.

Try it: **Stillness → Make room for waiting → an individual step → Back to sequence → Add to my day → Preparation or Done → Add for today**. The future option starts unchecked. Try Undo, then add again and open the destination. Use Begin, Pause/Resume and Skip; finish with or without a local reflection. Try Customise and inspect the original sequence afterwards. Check explicit future saving under **Additional tools → Initial setup & saved choices**. This review has no real account, microphone, HR or backend interaction.

## Milestone record

| Milestone | Branch and base | Revision and status |
| --- | --- | --- |
| Journal | `codex/reading-room-journal` → `integration/reading-room-redesign` | [#78](https://github.com/ArchesAutomation/StillSignal/pull/78), approved and merged at `60f3698`. |
| Shared direction and Stillness prototype | `codex/stillness-design-review` → `integration/reading-room-redesign` | [#79](https://github.com/ArchesAutomation/StillSignal/pull/79), approved and merged at `b9aa42c`. |
| Stillness implementation | `codex/stillness-library` → `integration/reading-room-redesign` | [#80](https://github.com/ArchesAutomation/StillSignal/pull/80), approved and merged at `835b3cb`. |
| Home | `codex/reading-room-home` → `integration/reading-room-redesign` | [#81](https://github.com/ArchesAutomation/StillSignal/pull/81), approved and merged at `76c8873`. |
| Preparation | `codex/reading-room-preparation` → `integration/reading-room-redesign` | Proposal approved, implemented from `76c8873` for draft review. See the [feature branch](https://github.com/ArchesAutomation/StillSignal/tree/codex/reading-room-preparation) for the current revision. |
| Done for the day | Separate feature branch from updated integration | Planned. |
| Combined release | `integration/reading-room-redesign` → `main` | Planned. One release PR, explicit approval required. |

On 10 November 2026, GitHub reported #78's `check` and `Workers Builds: still-signal` successful at its head; `Supabase Preview` was skipped. Cloudflare's deployment API returned `f2543ebd-9b40-42a3-b397-7d608b93a606`, Worker `e844f543-c15b-4625-bc94-9f7edbb77254` at 100%, matching the prior source reconciliation. The Builds trigger read returned 403. Repository and CI use the existing Supabase project; actual preview bindings remain unverified, so no authenticated saves were attempted. Use the synthetic local fixture until isolation is established.

Design review checks: `npm ci --no-audit --no-fund` installed the 278 locked packages (an offline attempt missed the cached `zod` package). `npm run check` passed Worker type generation, TypeScript, 333 tests and the production build on the integration baseline with no app source changes. On Windows, use the workspace npm runner on PATH and run with local socket access for the build helper. Existing build warnings remain. `node --check docs/design/stillness-proposal/app.js` and `git diff --check` (including the staged diff) passed. In the local browser, individual preview → add for today → Undo, whole sequence → Done → pause/resume → skip → finish → local reflection, and explicit save for future → Preparation → customise → reload passed. Finishing a catalogue preview without reflection did not add a note. No browser errors were captured. Hardware capture, authenticated writes and actual session changes are outside this design review.

## Review the Stillness implementation

Start from the feature branch with its locked dependencies installed. Use these PowerShell commands to launch the existing synthetic fixture.

```powershell
$env:APP_ENV='staging'
$env:TRADERPULSE_UI_REVIEW='true'
$env:NEXT_PUBLIC_SUPABASE_URL=''
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY=''
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=''
$env:NEXT_TELEMETRY_DISABLED='1'
$env:STILL_SIGNAL_QA_DIST='.next-stillness-feature'
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3182
```

1. Open `http://127.0.0.1:3182/review` and choose **Stillness**. Filter by Big 4 or content type, and try a reminder or practice in the side preview.
2. Choose **Add to my day → Preparation → Add for today**. **Also keep in Saved support** starts unchecked. Open Preparation and use **Undo**. Try the same flow with a practice in Done.
3. In **Make room for waiting**, preview one step, then try the sequence. Add it to Done with **Also keep in Saved support** checked. The existing review screen shows the three steps together as one choice.
4. Begin the sequence, skip a step, and finish without writing. Repeat and choose **Reflect in Journal**. The original composer opens for today's date with Whole day selected.
5. Reload, open **Saved support**, and reuse the sequence in Preparation. Undo the reuse. The earlier saved copy remains available.

[Library](design/stillness-implementation/library.jpg) · [Add for today](design/stillness-implementation/add.jpg) · [Preparation](design/stillness-implementation/preparation.jpg) · [Done](design/stillness-implementation/done.jpg) · [Journal composer](design/stillness-implementation/journal.jpg) · [Saved support](design/stillness-implementation/saved.jpg)

The library and player are in `src/components/stillness-library.tsx`. The catalogue keeps item IDs and step indexes stable because dated choices reference them. The existing Preparation and Done entry points share the same process store, and their shortcut selects the actual current trading date. A first addition can create today's trading-day record. Undo revises the affected choice and keeps the day and unrelated changes. Saved support reads the explicitly kept choices across days and never inserts them into a new day. Review date selection, revision handling, and the Journal handoff closely.

Stillness adds an optional field to the existing day record. The current database stores the JSON body as-is, so there is no SQL migration. The app's validator and the generated `pulse-process` Edge Function validator both accept the field. The production release needs a coordinated Edge Function and app update before authenticated users save Stillness choices. Older running app versions use a strict validator and need to reload before syncing new records. Confirm which Supabase project and Edge revision a preview uses before any authenticated save test. Only the local synthetic account and a local PostgreSQL test were used in this milestone.

Verification on 11 November 2026:

- `node scripts/prepare-edge.mjs` regenerated the Edge Function source. Only the matching `pulse-process/process/model.ts` change is included.
- `node --import ./tests/browser-environment.mjs --import tsx --test tests/dashboard.test.ts tests/navigation.test.ts tests/process-core.test.ts` passed all 7 tests. The local PostgreSQL test round-tripped a saved Stillness choice in an existing trading-day revision.
- `npm run check` passed Worker type generation, TypeScript, all 337 tests, and the production build. This Windows checkout used the existing workspace npm wrapper on PATH and loopback access for the build helper. The build printed source map and route-classification warnings.
- `node node_modules/vinext/dist/cli.js check` reported 13 supported, 0 partial and 0 issues. `git diff --check` and `git diff --cached --check` passed.
- The local browser verified Big 4 multi-selection, reminder and practice preview, adds to both destinations and Undo, individual step preview, grouped sequence playback with pause/resume and skip, optional reflection and a synthetic Journal save on today's date. Reload restored Saved support. Reusing a saved sequence then undoing the new add preserved its saved copy. At a 390 px viewport the page had no horizontal overflow and the add dialog remained reachable. The browser recorded no warnings or errors.

The local verification did not exercise live microphone recording, wearable capture, authenticated cloud sync or multi-device conflict recovery. Preview backend bindings still need verification.

## Review the Home implementation

Use the synthetic review environment documented above with `STILL_SIGNAL_QA_DIST='.next-glassy-build'` and port `3184`. Open `http://127.0.0.1:3184/review` and choose **Home**.

1. Choose **Impatience** and **Fear**, reload, then return to **Home**. Both choices should remain selected.
2. Choose **Explore Stillness** and check the preselected filters. Clear one library filter, add **Make room for waiting** to Preparation, then open Preparation. Return to **Home** and check both original choices and the updated Preparation count.
3. Try **Begin preparation**, **Done for the day**, **Your journal** and **Open weekly reflection**. In Journal, use **Preview Reading Room** to open the #78 starter. The separate **Stillness** navigation entry opens the library with its own filters.

[Desktop Home](design/home-implementation/home.jpg) · [Home at 390 px](design/home-implementation/home-mobile.jpg)

The Home UI is in `src/components/concept/reading-room-home.tsx`, using `src/app/reading-room.css` and the existing workspace navigation. Read `day.body.supportFocuses` for today's date and timezone using `tradingDayFor`. Home saves a day revision with the existing fields and Stillness choices intact. Review the dated revision and both ways to enter Stillness.

No SQL migration is required. The optional `supportFocuses` field is in the app and generated `pulse-process` validators. The combined release must coordinate the Edge Function update and app release before authenticated saves use the new field. Reload old app versions before syncing the new records because the previous validator is strict.

Verification on 11 November 2026:

- `npm run check` passed Worker type generation, TypeScript, all 337 tests and the production build. The build emitted source map and route classification warnings. `git diff --check` and `git diff --cached --check` passed.
- `node --import ./tests/browser-environment.mjs --import tsx --test tests/dashboard.test.ts tests/process-core.test.ts` passed all 6 tests, including a local PostgreSQL round trip for the Big 4 and Stillness on the same day revision.
- Edge verified the local synthetic flow above, including removing a saved focus, returning from the actual destinations and checking the 390 px layout for horizontal overflow. The browser reported zero console errors and outbound HTTP requests. Authenticated sync, hardware capture and actual session transitions were outside this walkthrough.
- `node scripts/check-cloudflare.mjs` passed the read-only production smoke checks before Home work. Preview backend bindings and the production release were outside this milestone.

## Copy into the Preparation chat

> Continue StillSignal with Preparation after the Home PR is approved and merged. Read `docs/redesign-direction.md` on `integration/reading-room-redesign` and open #79's Reading Room Preparation reference. Start from updated integration with the real #78 Journal, #80 Stillness and Home. Show a connected proposal in synthetic `/review` before implementing. Keep the check-in about how the person is arriving. Use the existing `day.body.supportFocuses` choices from Home to surface relevant Stillness without asking again. Bring intentions, boundaries and today's chosen support together and keep initial setup separate. Reuse current records, pinned runs, session controls, Journal and dashboards. After approval, use a separate branch, run `npm run check` and `git diff --check`, verify in the local browser, and open a draft `manual-merge` PR to integration. Update this handoff with screenshots, checks, gaps and a copy-ready prompt for Done for the day. Ask before merging or releasing.

## Review the Preparation implementation

Use the synthetic review setup above with `STILL_SIGNAL_QA_DIST='.next-glassy-build'` and port `3187`. Open [the local review](http://127.0.0.1:3187/review).

1. On **Home**, select **Greed**, then **Begin preparation**. The support card shows **Greed** and offers **Preview Enough is a choice in Stillness**. Preparation is also a direct navigation destination.
2. In Preparation, select **Tired** and enter an intention and boundary. Open **Initial setup** to see the original guided workspace, then use **Back to Preparation**.
3. Open the suggestion, clear the **Greed** filter, then choose **Add to my day → Add for today → Open Preparation**. Confirm that the added support, draft fields and Home choice are still present. **Also keep in Saved support** starts unchecked.
4. Choose **Start session**. Open **Preview Reading Room** in Daily journal and look for **How you arrived · Tired** and the intention in **Daily reference**. Return to Preparation and reload to check the saved fields. Use a fresh browser profile to check starting with all fields blank.

[Preparation suggestion](design/preparation-implementation/preparation-suggestion.jpg) · [Support added for today](design/preparation-implementation/preparation-support.jpg) · [Journal arrival](design/preparation-implementation/journal-arrival.jpg)

The Preparation view is in `src/components/concept/reading-room-preparation.tsx`. `workspace.tsx` keeps the guided tools reachable and passes the real Stillness library and session controls through. `src/lib/process/daily-preparation.ts` appends only edited fields and reads the current record before writing, so unrelated day fields and Stillness selections survive. The day stores its existing goal and an optional boundary. The existing check-in record stores the optional pre-market arrival choices. Clearing those choices archives that check-in revision. Legacy rated check-ins stay editable in Temperature check. Journal reads the selected day, including its timezone.

The matching `pulse-process` validators are generated. There is no SQL migration. Coordinate the Edge Function update with the app in the combined release so the endpoint accepts the new fields when clients start writing them. Existing strict validators in older app versions require a reload before syncing the new records.

Verification on 11 November 2026:

- `node scripts/prepare-edge.mjs` regenerated the function sources. The change retains only the matching `pulse-process/process/model.ts` diff.
- `node --import ./tests/browser-environment.mjs --import tsx --test tests/reading-room.test.ts tests/process-core.test.ts` passed all 6 tests. Local Postgres round-tripped arrival, intention, and boundary alongside existing Home and Stillness choices. The Journal test checked clearing the arrival and returning to the older rated check-in.
- `npm run check` passed Worker type generation, TypeScript, 337 tests, and the Vinext production build. The build reported source map and route classification warnings. `git diff --check` and `git diff --cached --check` passed.
- Local Edge exercised the steps above, including a real session start with blank fields, a start with unsaved edits, reload and clearing, and a 390 px viewport. The final run recorded no browser errors or outbound HTTP requests. An earlier run emitted one generic browser event error that did not recur.
- The review used synthetic data and local storage. Authenticated cloud sync, preview backend bindings, and physical wearable, microphone, or screen capture were outside this verification. The Journal landing view and final navigation changes are for combined integration review.

## Copy into the Done for the day chat

> Continue StillSignal with Done for the day. Verify the live `integration/reading-room-redesign` ref and the Preparation PR first. Read `docs/redesign-direction.md`, especially “Review the Preparation implementation,” and open #79’s original Done for the day screen. Branch from updated integration once Preparation has merged. Show the connected proposal in synthetic `/review` and get visual approval before implementing. Use the Reading Room palette and existing navigation. Make Done the primary place to end a session when ready, record outcomes and process separately, offer today’s closing Stillness support, and keep reflection optional in the real Journal. Reuse current sessions, daily records, review tools, and dashboard layouts. Start and end should work without optional writing. After approval run `npm run check` and `git diff --check`, verify in a local browser, and open a draft `manual-merge` PR to integration. Update this handoff with screenshots, exact checks, and gaps. Ask before merging or releasing. For the combined integration review, decide how Daily journal opens into Reading Room while respecting existing saved dashboards, and revisit where Command Center and Patterns should be accessed. Release the combined redesign once after approval.
