# StillSignal: shared redesign direction and continuation instructions

This is the shared redesign direction, updated 10 November 2026. Read it before designing or implementing another milestone. The decisions below apply across feature PRs. Record changes here after review so a future chat can work from the repository and its references.

## Start here

Continue with the Stillness milestone. First inspect the references below, verify current GitHub/Cloudflare/Supabase access and repository state, and show a connected local interactive proposal for review. Do not implement additional production features, merge PRs or deploy merely because this handoff exists. Caleb wants visual iteration and feedback before finalising each next milestone. Check the latest user instructions for any later authorization.

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

### Home

A welcoming, simple entrance into today, with clear routes to Preparation, Stillness, Done and Journal. Summarise relevant daily context without recreating a competing Command Center. Integrate links/state from the completed daily flow. Keep weekly supportive reflection accessible without making it an assessment or mandatory task.

### Stillness: next milestone

A support library, replacing the cumbersome manual builder experience rather than merely restyling it. Make reminders, practices and complete sequences discoverable and previewable before adding. The Reading Room prototype offers a card library and adjacent preview; use it as the concrete starting reference, then refine with Caleb.

Adding defaults to **just today**. Offer explicit optional saving for future days; do not silently establish a recurring routine. Allow Preparation or Done as the destination and offer Undo. Keep a complete experience together as a sequence with optional/skippable steps and later customisation. Do not immediately explode it into independently configured pieces. Personal writing/recordings remain optional. Reuse actual run/profile/content structures and inspect legacy compatibility before schema decisions.

The future production flow must use existing records and Journal reflection, not the prototype's localStorage simulation. Distinguish previewing content, adding it, starting it, skipping a step, finishing and reflecting. Confirm detailed player behavior and content with Caleb rather than treating all sample prototype interactions as final approval.

### Preparation

Simpler daily check-in, boundaries, intentions and selected support; multi-select Big 4. Separate initial setup from daily preparation. Show/add today's chosen Stillness support with minimal repetitive configuration. Primary place to start a session once this replacement is complete. Read/write the existing daily context, avoiding duplicate copies of answers.

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

Agreed order: Journal (#78) -> Stillness -> Preparation -> Done -> Home/navigation transition -> appearance personalisation. Adjust PR boundaries with Caleb if implementation dependencies justify it; do not independently redesign the direction in each chat.

The shared base is [`integration/reading-room-redesign`](https://github.com/ArchesAutomation/StillSignal/tree/integration/reading-room-redesign). It started at main `d6aa146647e289a8acba104e580e36b45da3d4f3` after verifying that production still served the same Worker version whose embedded source matched that commit in the Journal handoff. #78 was retargeted only after checking its Journal-only diff and confirming the new base has the same SHA. Read repository instructions and verify live repository, PR and deployment state in each continuation.

Create each feature branch from integration after the preceding milestone has been approved and merged there. Target integration and apply `manual-merge`; no automatic merges. The user's integration instructions take precedence over the repository's generic PR-to-main instruction for these milestone PRs. The trusted auto-merge policy also rejects draft PRs, `manual-merge` and non-main bases. Review the combined experience on integration. Open a single final release PR into `main` after the combined review. Cloudflare Builds deploys merged `main` automatically; explicit release approval is required. Do not change deployment settings to assemble the redesign.

Before a new feature PR, read this document, the actual prototypes and integration's current code. If the shared direction PR has not yet been merged, read its branch. Update this current direction and the milestone record in the same feature PR when Caleb agrees a change. Record the PR and base, verified revision, exact checks, screenshots/reproduction, gaps and next-chat prompt. Use the PR head link for its current revision rather than trying to embed a commit's own SHA in that commit. Always distinguish proposed, implemented, reviewed, merged to integration and released.

## Verification and review rules

Smallest complete change, separate branch, existing repository conventions, no unrelated cleanup or dependencies. Before pushing, run focused checks, `npm run check`, relevant local browser verification and `git diff --check`. If required checks cannot pass, keep new changes local and explain the blocker. Document all substantive files/changes, exact commands/results, setup/migrations and gaps in each PR; apply `manual-merge` and require review. Explain where behavior lives and how Caleb can reproduce it.

At #78 handoff: 337 tests, TypeScript and production build passed; vinext compatibility check and diff check passed. Browser verification covered selected-day navigation, populated/empty days, chart layers/zoom, moments/evidence/stages/editing and dashboard preview/edit/Undo/Cancel/Save/snapshot/reload. Physical microphone/HR/screen capture and authenticated multi-device saves were not exercised. Inspect #78 documentation for exact evidence and commands; do not imply this covers future changes.

Supabase preview branches are disabled. Cloudflare branch-build success does not prove backend isolation; the build-details read returned HTTP 403. No authenticated preview save tests were performed. Inspect actual preview bindings and agree a suitable test account/data path before authenticated writes. Use the existing synthetic `/review` fixture with cloud URL/key variables empty for local interaction verification. Production was verified unchanged at handoff.

## What is agreed versus still open

Agreed: the purpose, five destinations, Reading Room basis, top navigation, existing systems preserved, library-first interaction, just-today default, sequence integrity/skipping/later customisation, Done outcomes, optional writing, dashboard compatibility and reviewed staged delivery.

Still open: Stillness library/player approval, final Preparation/Done/Home compositions, exact Home summary, future saving semantics and where to persist dated grouped choices. The prototypes are concrete proposals and references. They do not authorize production changes.

## Stillness proposal and reuse plan

- Start with the existing `PageDashboard` and Stillness widget identities `personal-stillness` and `stillness` in `src/components/concept/workspace.tsx`. A library-first starter can keep personal content and practices reachable and existing layouts intact. Reuse the Reading Room material scope and tokens from #78; leave app navigation and default layouts alone during this milestone.
- `SavedStillness`, `StillnessBuilder`, `PersonalStillness` and `RoutineAudio` already handle account-scoped routine revisions and existing device-local audio. Keep the original editor/playback available as personal support. Reuse practice behaviour from `SessionReset` and existing Stillness components, and the canonical `supportFocus` labels in `src/lib/process/journal-guide.ts`. Multi-select filters do not change the existing single-focus profile.
- `useProcess` already persists account-scoped dated records and revisions. Existing `protocol` definitions, `run` step snapshots and `response` records preserve pinned preparation history. The personal `profile.stillness` shape is a flat, context-tagged list; it cannot represent a dated collection of grouped sequences for both destinations. Inspect run/day lifecycle and sync validation before selecting the smallest backwards-compatible representation. Keep choices attached to the actual current day and timezone; do not use whichever historical day the Journal happens to show. Saving for later is explicitly opt-in; the proposal keeps it as a reusable saved choice rather than silently applying it every day.
- Command Center already holds the daily dashboard, Preparation entry and review entry. `preparation-workflow.ts` and `active-preparation.ts` govern existing runs and context; `SessionReviewGuide` and post-session support already handle review/outcomes. Use small support entry points in the current flows for Stillness. Full Preparation, Done and Home layouts and session-flow changes each get their own milestone. Patterns and its existing analytics stay reachable; move links only during the later navigation transition.
- Route optional reflection into the existing Journal composer with the correct day context. Preview, skip and finish are distinct and should not create a Journal entry. Use existing capture, audio and dictation paths rather than creating a second editor or storage store. Proposal copy, step timing and the extent of later customisation still need review.

Try it: **Stillness → Make room for waiting → an individual step → Back to sequence → Add to my day → Preparation or Done → Add for today**. The future option starts unchecked. Try Undo, then add again and open the destination. Use Begin, Pause/Resume and Skip; finish with or without a local reflection. Try Customise and inspect the original sequence afterwards. Check explicit future saving under **Additional tools → Initial setup & saved choices**. This review has no real account, microphone, HR or backend interaction.

## Milestone record

| Milestone | Branch and base | Revision and status |
| --- | --- | --- |
| Journal | `codex/reading-room-journal` → `integration/reading-room-redesign` | [#78](https://github.com/ArchesAutomation/StillSignal/pull/78), `bf4ed9dc5271ebd0908e4c615de69e58ea150202`: implemented, open draft, `manual-merge`, not approved for merge, not integrated or released. |
| Shared direction and Stillness prototype | `codex/stillness-design-review` → `integration/reading-room-redesign` | Design proposal and portable references only. No Stillness application implementation, integration merge or release. See this branch's draft PR for the reviewed revision. |
| Stillness implementation | New feature branch from updated integration | Awaiting proposal approval and Journal integration. |
| Preparation → Done → Home/navigation → appearance | One feature branch each, from updated integration | Planned. |
| Combined release | `integration/reading-room-redesign` → `main` | Planned. One release PR, explicit approval required. |

On 10 November 2026, GitHub reported #78's `check` and `Workers Builds: still-signal` successful at its head; `Supabase Preview` was skipped. Cloudflare's deployment API returned `f2543ebd-9b40-42a3-b397-7d608b93a606`, Worker `e844f543-c15b-4625-bc94-9f7edbb77254` at 100%, matching the prior source reconciliation. The Builds trigger read returned 403. Repository and CI use the existing Supabase project; actual preview bindings remain unverified, so no authenticated saves were attempted. Use the synthetic local fixture until isolation is established.

Design review checks: `npm ci --no-audit --no-fund` installed the 278 locked packages (an offline attempt missed the cached `zod` package). `npm run check` passed Worker type generation, TypeScript, 333 tests and the production build on the integration baseline with no app source changes. On Windows, use the workspace npm runner on PATH and run with local socket access for the build helper. Existing build warnings remain. `node --check docs/design/stillness-proposal/app.js` and `git diff --check` (including the staged diff) passed. In the local browser, individual preview → add for today → Undo, whole sequence → Done → pause/resume → skip → finish → local reflection, and explicit save for future → Preparation → customise → reload passed. Finishing a catalogue preview without reflection did not add a note. No browser errors were captured. Hardware capture, authenticated writes and actual session changes are outside this design review.

## Copy into the next chat

> Continue the StillSignal redesign. Read `docs/redesign-direction.md` on the latest integration or design-review PR branch, open the referenced prototypes and inspect the actual PRs, repository and Worker state. Verify the preceding milestone is approved and merged into `integration/reading-room-redesign` before branching. If Stillness is still proposed, show the local proposal and get explicit scope approval before implementation. Once Stillness is merged, the next milestone is Preparation: simpler daily check-in, canonical multi-select Big 4, intentions, boundaries and today's chosen support, separate from initial setup. Reuse the current records, pinned runs, session controls and dashboards. Show a local interactive proposal before implementation. Use a separate feature branch, run `npm run check`, browser verification and `git diff --check` before pushing, and open a draft `manual-merge` PR to integration. Update this document with the approved decisions, files, screenshots, checks, gaps and the next-chat prompt. Do not merge or release without explicit approval.
